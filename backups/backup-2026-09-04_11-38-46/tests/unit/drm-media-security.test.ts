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

describe('DRM & Media Authorization Security', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { vaultRouter } = await import('../../server/routes/vaultRoutes.ts');
    const { installBodyParsers } = await import('../../server/middleware/bodyParsers.ts');
    const { errorHandler } = await import('../../server/middleware/errorHandler.ts');

    app = express();
    app.use((req: any, _res: any, next: any) => {
      (req as express.Request & { requestId?: string }).requestId = randomUUID();
      next();
    });
    installBodyParsers(app);
    app.use('/api/vault', vaultRouter);
    app.use(errorHandler);
  });

  it('rejects unauthenticated POST /api/vault/license/:itemId even if query params (uid, userId, username) are supplied', async () => {
    const res = await request(app)
      .post('/api/vault/license/item-123?uid=victim-user&userId=victim-user&username=victim')
      .send({ drmType: 'widevine', deviceId: 'dev-1' });

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('AUTH_REQUIRED');
  });

  it('rejects unauthenticated GET /api/vault/media/key/:itemId', async () => {
    const res = await request(app).get('/api/vault/media/key/item-123');

    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated POST /api/vault/media/drm/widevine/:itemId', async () => {
    const res = await request(app).post('/api/vault/media/drm/widevine/item-123');

    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated POST /api/vault/media/drm/fairplay/:itemId', async () => {
    const res = await request(app).post('/api/vault/media/drm/fairplay/item-123');

    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated GET /api/vault/media/drm/cenc/:itemId/:kid', async () => {
    const res = await request(app).get('/api/vault/media/drm/cenc/item-123/kid-1');

    expect(res.status).toBe(401);
  });
});
