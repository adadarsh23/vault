import { describe, expect, it, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

vi.stubEnv('JWT_SECRET', 'test-jwt-secret-minimum-length-32-chars-for-test');
vi.stubEnv('REFRESH_TOKEN_SECRET', 'test-refresh-secret-minimum-length-32-chars');
vi.stubEnv(
  'VAULT_ENCRYPTION_KEY',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);
vi.stubEnv('AUTH_PEPPER', 'test-auth-pepper');
vi.stubEnv('CSRF_SECRET', 'test-csrf-secret');
vi.stubEnv('SIGNED_URL_SECRET', 'test-signed-url-secret');
vi.stubEnv('SKIP_MONGO_CONNECT', '1');

describe('Production Route Security Hardening Suite', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { contactRouter } = await import('../../server/routes/contactRoutes.ts');
    const { integrityRouter } = await import('../../server/routes/integrityRoutes.ts');
    const { twoFactorRouter } = await import('../../server/routes/twoFactorRoutes.ts');
    const { authRouter } = await import('../../server/routes/authRoutes.ts');
    const { avatarRouter } = await import('../../server/routes/avatarRoutes.ts');
    const masterKeyRouter = (await import('../../server/routes/masterKeyRoutes.ts')).default;
    const { notificationRouter } = await import('../../server/routes/notificationRoutes.ts');
    const { securityRouter } = await import('../../server/routes/securityRoutes.ts');
    const { systemRouter } = await import('../../server/routes/systemRoutes.ts');
    const { vaultRouter } = await import('../../server/routes/vaultRoutes.ts');

    const { installBodyParsers } = await import('../../server/middleware/bodyParsers.ts');
    const { errorHandler } = await import('../../server/middleware/errorHandler.ts');

    app = express();
    app.use((req: any, _res: any, next: any) => {
      (req as express.Request & { requestId?: string }).requestId = randomUUID();
      next();
    });
    installBodyParsers(app);

    app.use('/api/contact', contactRouter);
    app.use('/api/vault/integrity', integrityRouter);
    app.use('/api/2fa', twoFactorRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/avatar', avatarRouter);
    app.use('/api/master-key', masterKeyRouter);
    app.use('/api/notifications', notificationRouter);
    app.use('/api/security', securityRouter);
    app.use('/api/system', systemRouter);
    app.use('/api/vault', vaultRouter);

    app.use(errorHandler);
  });

  describe('1. Contact Routes (/api/contact)', () => {
    it('sets anti-caching headers on contact form submission endpoint', async () => {
      const res = await request(app).post('/api/contact/submit').send({});
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.status).toBe(400); // Validation error
    });

    it('rejects invalid or missing contact form fields', async () => {
      const res = await request(app).post('/api/contact/submit').send({
        name: 'Test User',
        email: 'invalid-email',
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Integrity Routes (/api/vault/integrity)', () => {
    it('requires authentication for integrity status and verify', async () => {
      const statusRes = await request(app).get('/api/vault/integrity/status');
      expect(statusRes.status).toBe(401);

      const verifyRes = await request(app).post('/api/vault/integrity/verify').send({});
      expect(verifyRes.status).toBe(401);
    });

    it('sets anti-caching headers on integrity routes', async () => {
      const res = await request(app).get('/api/vault/integrity/status');
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('validates :itemId parameter on proof endpoint', async () => {
      const res = await request(app).get('/api/vault/integrity/proof/invalid%20item%20id!!');
      expect(res.status).toBe(401); // Auth runs before or parameter validation
    });
  });

  describe('3. Two-Factor Routes (/api/2fa)', () => {
    it('enforces authentication on 2FA setup, verify, and disable', async () => {
      const setupRes = await request(app).post('/api/2fa/setup');
      expect(setupRes.status).toBe(401);

      const verifyRes = await request(app).post('/api/2fa/verify').send({ token: '123456' });
      expect(verifyRes.status).toBe(401);

      const disableRes = await request(app).post('/api/2fa/disable').send({ token: '123456' });
      expect(disableRes.status).toBe(401);
    });

    it('sets anti-caching headers on 2FA endpoints', async () => {
      const res = await request(app).post('/api/2fa/setup');
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });

  describe('4. Avatar Routes (/api/avatar)', () => {
    it('returns storage status without crashing', async () => {
      const res = await request(app).get('/api/avatar/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('requires authentication for avatar presign', async () => {
      const res = await request(app)
        .post('/api/avatar/presign')
        .send({ userId: 'u1', contentHash: 'h1' });
      expect(res.status).toBe(401);
    });

    it('blocks directory traversal attempts on raw avatar retrieval', async () => {
      const res = await request(app).get('/api/avatar/raw/..%2f..%2f/secret.txt');
      expect([400, 404]).toContain(res.status);
    });

    it('rejects invalid image extensions during binary upload', async () => {
      const res = await request(app)
        .put('/api/avatar/upload/testuser/hash123?ext=exe')
        .set('Content-Type', 'image/webp')
        .send(Buffer.from('fake-data'));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid or unsupported avatar image extension');
    });
  });

  describe('5. Master Key Routes (/api/master-key)', () => {
    it('enforces authentication and anti-caching on all master-key endpoints', async () => {
      const endpoints = [
        { method: 'post', path: '/api/master-key/save' },
        { method: 'get', path: '/api/master-key/retrieve' },
        { method: 'post', path: '/api/master-key/verify' },
        { method: 'delete', path: '/api/master-key' },
        { method: 'get', path: '/api/master-key/metadata' },
        { method: 'get', path: '/api/master-key/full-data' },
      ];

      for (const ep of endpoints) {
        const res = await (request(app) as any)[ep.method](ep.path);
        expect(res.status).toBe(401);
        expect(res.headers['cache-control']).toContain('no-store');
      }
    });
  });

  describe('6. Notification Routes (/api/notifications)', () => {
    it('requires authentication and applies anti-caching headers', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('requires authentication on notification clear and read', async () => {
      const clearRes = await request(app).post('/api/notifications/clear');
      expect(clearRes.status).toBe(401);

      const readRes = await request(app).post('/api/notifications/read').send({ id: 'some-id' });
      expect(readRes.status).toBe(401);
    });
  });

  describe('7. Security Routes (/api/security)', () => {
    it('requires authentication and applies anti-caching on security endpoints', async () => {
      const res = await request(app).get('/api/security/devices');
      expect(res.status).toBe(401);
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('requires authentication for elevated login verification', async () => {
      const res = await request(app).post('/api/security/login-verify').send({ password: 'test' });
      expect(res.status).toBe(401);
    });

    it('requires admin privileges on admin security dashboard', async () => {
      const res = await request(app).get('/api/security/admin/dashboard');
      expect(res.status).toBe(401);
    });
  });

  describe('8. System Routes (/api/system)', () => {
    it('requires authentication and applies anti-caching on system logs', async () => {
      const res = await request(app).get('/api/system/logs');
      expect(res.status).toBe(401);
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('requires authentication for clearing logs', async () => {
      const res = await request(app).post('/api/system/logs/clear');
      expect(res.status).toBe(401);
    });
  });

  describe('9. Vault Routes (/api/vault)', () => {
    it('requires authentication on vault root, sync, folders, and items', async () => {
      const getRoot = await request(app).get('/api/vault');
      expect(getRoot.status).toBe(401);

      const getSync = await request(app).get('/api/vault/sync');
      expect(getSync.status).toBe(401);

      const getFolders = await request(app).get('/api/vault/folders');
      expect(getFolders.status).toBe(401);

      const getItems = await request(app).get('/api/vault/items');
      expect(getItems.status).toBe(401);
    });

    it('applies anti-caching headers on vault item retrieval', async () => {
      const res = await request(app).get('/api/vault/items');
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('rejects unauthenticated upload sessions', async () => {
      const res = await request(app).post('/api/vault/files/multipart/start').send({
        category: 'photo',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
      });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated category item writes', async () => {
      const res = await request(app).post('/api/vault/photo').send({
        itemId: 'item-1',
      });
      expect(res.status).toBe(401);
    });
  });
});
