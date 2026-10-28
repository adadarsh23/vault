import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { installBodyParsers } from '../../server/middleware/bodyParsers.ts';
import { requireTrustedBrowserOrigin } from '../../server/middleware/csrfOriginMiddleware.ts';
import { installCsrfProtection } from '../../server/middleware/csrfProtection.ts';
import { errorHandler } from '../../server/middleware/errorHandler.ts';
import { validateRequest } from '../../server/middleware/expressValidate.ts';
import { customMongoSanitize } from '../../server/middleware/mongoSanitize.ts';
import { originProtection } from '../../server/middleware/originProtection.ts';
import { validateAuthCredentials } from '../../server/middleware/requestValidation.ts';
import { fileUploadSecurityMiddleware } from '../../server/middleware/securityMiddleware.ts';
import { validate } from '../../server/middleware/validate.ts';
import { body } from 'express-validator';
import { AppError } from '../../server/utils/appError.ts';

describe('Production Middleware Suite', () => {
  describe('bodyParsers', () => {
    it('successfully parses valid JSON request bodies', async () => {
      const app = express();
      installBodyParsers(app);
      app.post('/test', (req, res) => res.json({ received: req.body }));
      app.use(errorHandler);

      const res = await request(app).post('/test').send({ message: 'hello world' });

      expect(res.status).toBe(200);
      expect(res.body.received).toEqual({ message: 'hello world' });
    });

    it('rejects malformed JSON with 400 INVALID_JSON', async () => {
      const app = express();
      installBodyParsers(app);
      app.post('/test', (req, res) => res.json({ received: req.body }));
      app.use(errorHandler);

      const res = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('csrfOriginMiddleware', () => {
    it('skips validation on safe GET / HEAD / OPTIONS methods', async () => {
      const app = express();
      app.use(requireTrustedBrowserOrigin);
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });

    it('rejects requests with explicit null origin', async () => {
      const app = express();
      app.use(requireTrustedBrowserOrigin);
      app.post('/test', (_req, res) => res.json({ ok: true }));
      app.use(errorHandler);

      const res = await request(app).post('/test').set('Origin', 'null');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_BLOCKED');
    });

    it('blocks explicit cross-site browser requests via Sec-Fetch-Site', async () => {
      const app = express();
      app.use(requireTrustedBrowserOrigin);
      app.post('/test', (_req, res) => res.json({ ok: true }));
      app.use(errorHandler);

      const res = await request(app)
        .post('/test')
        .set('Sec-Fetch-Site', 'cross-site')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_BLOCKED');
    });
  });

  describe('csrfProtection', () => {
    it('issues CSRF tokens via /api/auth/csrf-token and sets cookie', async () => {
      const app = express();
      installCsrfProtection(app);
      app.use(errorHandler);

      const res = await request(app).get('/api/auth/csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.csrfToken).toBeDefined();
    });

    it('validates x-csrf-token or x-xsrf-token on protected POST requests', async () => {
      const prevBypass = process.env.CSRF_TEST_BYPASS;
      try {
        process.env.CSRF_TEST_BYPASS = 'false';
        const app = express();
        installCsrfProtection(app);
        app.post('/api/vault/test', (_req, res) => res.json({ ok: true }));
        app.use(errorHandler);

        const tokenRes = await request(app).get('/api/auth/csrf-token');
        const cookie = tokenRes.headers['set-cookie'];
        const csrfToken = tokenRes.body.data.csrfToken;

        const validRes = await request(app)
          .post('/api/vault/test')
          .set('Cookie', cookie)
          .set('X-XSRF-Token', csrfToken);

        expect(validRes.status).toBe(200);
        expect(validRes.body.ok).toBe(true);
      } finally {
        if (prevBypass !== undefined) {
          process.env.CSRF_TEST_BYPASS = prevBypass;
        } else {
          delete process.env.CSRF_TEST_BYPASS;
        }
      }
    });
  });

  describe('errorHandler', () => {
    it('does not set wildcard Access-Control-Allow-Origin for unauthorized origins', async () => {
      const app = express();
      app.get('/test-error', (_req, _res, next) => {
        next(new AppError(403, 'CORS_FORBIDDEN', 'Origin not allowed'));
      });
      app.use(errorHandler);

      const res = await request(app)
        .get('/test-error')
        .set('Origin', 'http://malicious-attacker-site.com');

      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('maps database selection errors to 503 DB_UNAVAILABLE', async () => {
      const app = express();
      app.get('/db-error', (_req, _res, next) => {
        const err = new Error('server selection timed out');
        err.name = 'MongoServerSelectionError';
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/db-error');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DB_UNAVAILABLE');
    });

    it('maps ZodError to 400 VALIDATION_ERROR with structured details', async () => {
      const app = express();
      app.get('/zod-error', (_req, _res, next) => {
        const schema = z.object({ email: z.string().email() });
        const result = schema.safeParse({ email: 'not-an-email' });
        if (!result.success) {
          return next(result.error);
        }
        _res.send('ok');
      });
      app.use(errorHandler);

      const res = await request(app).get('/zod-error');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });
  });

  describe('customMongoSanitize', () => {
    it('strips keys starting with $ or containing . or prototype pollution', () => {
      const req: any = {
        body: {
          $gt: '',
          'nested.field': 'evil',
          __proto__: { polluted: true },
          safeField: 'good',
          nested: {
            $regex: '.*',
            safeNested: 123,
          },
        },
        params: {},
        query: {},
      };
      const res: any = {};
      const next = vi.fn();

      customMongoSanitize(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.$gt).toBeUndefined();
      expect(req.body['nested.field']).toBeUndefined();
      expect(req.body.safeField).toBe('good');
      expect(req.body.nested.$regex).toBeUndefined();
      expect(req.body.nested.safeNested).toBe(123);
    });

    it('handles circular references without infinite recursion', () => {
      const circular: any = { safe: 'ok' };
      circular.self = circular;
      const req: any = { body: circular, params: {}, query: {} };
      const res: any = {};
      const next = vi.fn();

      expect(() => customMongoSanitize(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
      expect(req.body.safe).toBe('ok');
    });
  });

  describe('originProtection', () => {
    it('allows container readiness and health endpoints', () => {
      const paths = ['/health', '/ready', '/api/health', '/api/ready'];
      for (const path of paths) {
        const req: any = {
          path,
          socket: { remoteAddress: '203.0.113.50' },
          get: () => undefined,
        };
        const res: any = {};
        const next = vi.fn();

        originProtection(req, res, next);
        expect(next).toHaveBeenCalledWith();
      }
    });
  });

  describe('validateRequest (express-validator)', () => {
    it('validates request fields and returns AppError with details on failure', async () => {
      const app = express();
      app.use(express.json());
      app.post(
        '/validate-test',
        validateRequest([body('email').isEmail().withMessage('Valid email required')]),
        (_req, res) => res.json({ ok: true }),
      );
      app.use(errorHandler);

      const res = await request(app).post('/validate-test').send({ email: 'bad-email' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].path).toBe('email');
    });
  });

  describe('validate (Zod middleware)', () => {
    it('validates request body and assigns parsed result', async () => {
      const app = express();
      app.use(express.json());
      const testSchema = z.object({
        count: z.number().min(1),
      });

      app.post('/zod-validate', validate(testSchema), (req, res) => {
        res.json({ count: req.body.count });
      });
      app.use(errorHandler);

      const res = await request(app).post('/zod-validate').send({ count: 5 });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });
  });

  describe('fileUploadSecurityMiddleware', () => {
    it('detects and blocks dangerous file extensions in req.file (single upload)', async () => {
      const req: any = {
        file: {
          originalname: 'malicious.exe',
          size: 1024,
        },
        get: () => undefined,
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await fileUploadSecurityMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FILE_UPLOAD_REJECTED' }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('detects EICAR test signature in file buffers', async () => {
      const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const req: any = {
        file: {
          originalname: 'test.txt',
          buffer: Buffer.from(eicarString, 'latin1'),
          size: eicarString.length,
        },
        get: () => undefined,
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await fileUploadSecurityMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'MALWARE_DETECTED' }),
        }),
      );
    });
  });

  describe('requestValidation', () => {
    it('validates and normalizes username and password up to 128 chars', () => {
      const req: any = {
        body: {
          username: ' TestUser ',
          password: 'Password123456789!@#$%^&*()_+ExtraCharsUpTo128',
        },
      };
      const res: any = {};
      const next = vi.fn();

      validateAuthCredentials(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.username).toBe('testuser');
    });

    it('rejects passwords under 16 characters', () => {
      const req: any = {
        body: {
          username: 'testuser',
          password: 'short',
        },
      };
      const res: any = {};
      const next = vi.fn();

      validateAuthCredentials(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const err = next.mock.calls[0][0];
      expect(err.code).toBe('INVALID_PASSWORD');
    });
  });
});
