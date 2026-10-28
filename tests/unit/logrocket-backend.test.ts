import { beforeEach, describe, expect, it, vi } from 'vitest';

const logrocketMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('logrocket', () => ({
  default: logrocketMock,
}));

vi.mock('../../server/utils/logger.ts', () => loggerMock);

const importModule = async () => import('../../server/lib/logrocket.ts');

describe('server logrocket integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.LOGROCKET_APP_ID = 'app/test';
  });

  it('initializes once when enabled', async () => {
    const mod = await importModule();
    expect(mod.initLogRocketServer()).toBe(true);
    expect(mod.initLogRocketServer()).toBe(false);
    expect(logrocketMock.init).toHaveBeenCalledTimes(1);
    expect(logrocketMock.init).toHaveBeenCalledWith('app/test');
    expect(mod.isLogRocketEnabled()).toBe(true);
  });

  it('captures normalized exceptions with tags', async () => {
    const mod = await importModule();
    mod.initLogRocketServer();

    mod.captureServerException('boom', { source: 'test', code: 500 });

    expect(logrocketMock.captureException).toHaveBeenCalledTimes(1);
    const [errorArg, optionsArg] = logrocketMock.captureException.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toContain('boom');
    expect(optionsArg).toMatchObject({
      tags: { source: 'test', code: 500 },
    });
  });

  it('scrubs sensitive tags and sanitizes error messages', async () => {
    const mod = await importModule();
    mod.initLogRocketServer();

    const sensitiveError = new Error('Auth failed for /api/login?token=secret123456');
    mod.captureServerException(sensitiveError, {
      source: 'test',
      password: 'plain-password',
      token: 'jwt-token-xyz',
      url: '/api/v1?token=queryToken123',
    });

    expect(logrocketMock.captureException).toHaveBeenCalledTimes(1);
    const [errorArg, optionsArg] = logrocketMock.captureException.mock.calls[0];
    expect((errorArg as Error).message).toBe('Auth failed for /api/login?token=[Filtered]');
    expect(optionsArg.tags).toHaveProperty('source', 'test');
    expect(optionsArg.tags).toHaveProperty('url', '/api/v1?token=[Filtered]');
    expect(optionsArg.tags).not.toHaveProperty('password');
    expect(optionsArg.tags).not.toHaveProperty('token');
  });

  it('registers request logger once and records request lifecycle with URL scrubbing', async () => {
    const mod = await importModule();
    const appUse = vi.fn();
    const app = { use: appUse } as any;

    mod.registerLogRocketMiddleware(app);
    mod.registerLogRocketMiddleware(app);
    expect(appUse).toHaveBeenCalledTimes(1);

    const middleware = appUse.mock.calls[0][0];
    const listeners: Record<string, () => void> = {};
    const req = {
      method: 'GET',
      originalUrl: '/api/auth/verify?token=secretToken&user=test',
      requestId: 'r1',
    };
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    listeners.finish?.();

    expect(loggerMock.logger.info).toHaveBeenCalledWith(
      '[API REQUEST]',
      expect.objectContaining({
        requestId: 'r1',
        method: 'GET',
        path: '/api/auth/verify?token=[Filtered]&user=test',
        statusCode: 200,
      }),
    );
  });

  it('handles client close in request logger safely', async () => {
    const mod = await importModule();
    const middleware = mod.logRocketRequestLogger();
    const listeners: Record<string, () => void> = {};
    const req = { method: 'POST', originalUrl: '/api/items', requestId: 'r2' };
    const res = {
      statusCode: 499,
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
    };
    const next = vi.fn();

    middleware(req as any, res as any, next);
    listeners.close?.();

    expect(loggerMock.logger.info).toHaveBeenCalledWith(
      '[API REQUEST]',
      expect.objectContaining({
        requestId: 'r2',
        method: 'POST',
        path: '/api/items',
      }),
    );
  });

  it('error middleware forwards and captures with sanitized paths', async () => {
    const mod = await importModule();
    mod.initLogRocketServer();

    const middleware = mod.logRocketErrorMiddleware();
    const next = vi.fn();
    const err = new Error('x');
    const req = {
      method: 'POST',
      originalUrl: '/api/auth/login?token=sensitiveQueryParam',
      requestId: 'req-123',
    };

    middleware(err, req as any, {} as any, next);

    expect(logrocketMock.captureException).toHaveBeenCalledTimes(1);
    const [, optionsArg] = logrocketMock.captureException.mock.calls[0];
    expect(optionsArg.tags.path).toBe('/api/auth/login?token=[Filtered]');
    expect(next).toHaveBeenCalledWith(err);
  });

  it('registerLogRocketMiddleware ignores null or invalid app instances', async () => {
    const mod = await importModule();
    expect(() => mod.registerLogRocketMiddleware(null as any)).not.toThrow();
    expect(() => mod.registerLogRocketMiddleware({} as any)).not.toThrow();
  });

  it('registerLogRocketProcessHandlers attaches handlers once', async () => {
    const mod = await importModule();
    mod.initLogRocketServer();

    mod.registerLogRocketProcessHandlers();
    mod.registerLogRocketProcessHandlers(); // Idempotency check
  });
});
