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

  it('registers request logger once and records request lifecycle', async () => {
    const mod = await importModule();
    const appUse = vi.fn();
    const app = { use: appUse } as any;

    mod.registerLogRocketMiddleware(app);
    mod.registerLogRocketMiddleware(app);
    expect(appUse).toHaveBeenCalledTimes(1);

    const middleware = appUse.mock.calls[0][0];
    const listeners: Record<string, () => void> = {};
    const req = { method: 'GET', originalUrl: '/api/health', requestId: 'r1' };
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
        path: '/api/health',
        statusCode: 200,
      }),
    );
  });

  it('error middleware forwards and captures', async () => {
    const mod = await importModule();
    mod.initLogRocketServer();

    const middleware = mod.logRocketErrorMiddleware();
    const next = vi.fn();
    const err = new Error('x');
    const req = {
      method: 'POST',
      originalUrl: '/api/auth/login',
      requestId: 'req-123',
    };

    middleware(err, req as any, {} as any, next);

    expect(logrocketMock.captureException).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(err);
  });
});
