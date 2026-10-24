import { describe, expect, it, vi } from 'vitest';
import { requireRecaptcha } from '../../server/middleware/recaptchaMiddleware.ts';
import { AppError } from '../../server/utils/appError.ts';

const createMockReq = (overrides: Record<string, any> = {}) => ({
  body: {},
  headers: {},
  get: vi.fn((header: string) => (header === 'user-agent' ? 'test-agent' : undefined)),
  app: {
    get: vi.fn((key: string) => (key === 'trust proxy' ? false : undefined)),
  },
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  connection: { remoteAddress: '127.0.0.1' },
  originalUrl: '/api/2fa/login',
  method: 'POST',
  ...overrides,
});

describe('reCAPTCHA Middleware - Optional Mode & 2FA Flow', () => {
  it('allows missing captchaToken when optional is true', async () => {
    const middleware = requireRecaptcha({ action: 'auth_2fa_login', optional: true });
    const req: any = createMockReq({
      body: {
        userId: '12345',
        token: '654321',
        mfaToken: 'valid-mfa-token',
      },
    });
    const res: any = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called with no errors
    expect(req.body.captchaToken).toBeUndefined();
  });

  it('allows empty string or whitespace captchaToken when optional is true', async () => {
    const middleware = requireRecaptcha({ action: 'auth_2fa_login', optional: true });
    const req: any = createMockReq({
      body: {
        userId: '12345',
        token: '654321',
        mfaToken: 'valid-mfa-token',
        captchaToken: '   ',
      },
    });
    const res: any = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.captchaToken).toBeUndefined();
  });

  it('rejects missing captchaToken when optional is false (default)', async () => {
    const middleware = requireRecaptcha({ action: 'auth_login' });
    const req: any = createMockReq({
      body: {
        username: 'alice',
        password: 'Password123!',
      },
    });
    const res: any = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('CAPTCHA_TOKEN_MISSING');
    expect(error.message).toContain('CAPTCHA token is missing');
  });

  it('rejects non-object request body', async () => {
    const middleware = requireRecaptcha({ action: 'auth_2fa_login', optional: true });
    const req: any = createMockReq({
      body: 'invalid-body-string',
    });
    const res: any = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INVALID_REQUEST_BODY');
  });
});
