import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => {
  const init = vi.fn();
  const captureException = vi.fn(() => 'event-id');
  const captureMessage = vi.fn(() => 'message-id');
  const addBreadcrumb = vi.fn();
  const setUser = vi.fn();
  const close = vi.fn(async () => true);
  const withScope = vi.fn((cb) =>
    cb({
      setTag: vi.fn(),
    })
  );
  const startSpanManual = vi.fn((_opts, cb) =>
    cb({
      setAttribute: vi.fn(),
      end: vi.fn(),
    })
  );
  const expressErrorHandler = vi.fn(
    () => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next()
  );
  const httpIntegration = vi.fn(() => ({ name: 'http' }));
  const expressIntegration = vi.fn(() => ({ name: 'express' }));

  return {
    init,
    captureException,
    captureMessage,
    addBreadcrumb,
    setUser,
    close,
    withScope,
    startSpanManual,
    expressErrorHandler,
    httpIntegration,
    expressIntegration,
  };
});

vi.mock('@sentry/node', () => sentryMock);
vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => ({ name: 'profiling' })),
}));

const importModule = async () => import('../../server/lib/sentry.js');

describe('server sentry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    process.env.SENTRY_ENABLED = 'false';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.2';
    process.env.SENTRY_PROFILES_SAMPLE_RATE = '0.05';
  });

  it('initializes in production when DSN exists even when flag is false', async () => {
    const mod = await importModule();
    expect(mod.initSentry()).toBe(true);
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
  });

  it('scrubs sensitive fields in beforeSend', async () => {
    const mod = await importModule();
    mod.initSentry();
    const initArg = sentryMock.init.mock.calls[0][0];

    const event = initArg.beforeSend({
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'a=b',
        },
        data: {
          password: 'secret',
          nested: { token: 'abc' },
        },
      },
      extra: {
        refreshToken: 'secret-refresh',
      },
    });

    expect(event.request.headers.authorization).toBe('[Filtered]');
    expect(event.request.headers.cookie).toBe('[Filtered]');
    expect(event.request.data.password).toBe('[Filtered]');
    expect(event.request.data.nested.token).toBe('[Filtered]');
    expect(event.extra.refreshToken).toBe('[Filtered]');
  });

  it('capture helpers call sentry when enabled', async () => {
    const mod = await importModule();
    mod.initSentry();

    mod.captureException(new Error('boom'));
    mod.captureMessage('hello', 'warning');
    mod.addBreadcrumb({ category: 'test' });
    mod.setUserContext({ id: 'u1' });
    await mod.flushSentry(250);

    expect(sentryMock.captureException).toHaveBeenCalled();
    expect(sentryMock.captureMessage).toHaveBeenCalledWith('hello', 'warning');
    expect(sentryMock.addBreadcrumb).toHaveBeenCalled();
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: 'u1' });
    expect(sentryMock.close).toHaveBeenCalledWith(250);
  });

  it('returns no-op handlers when disabled', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SENTRY_DSN = '';
    process.env.SENTRY_ENABLED = 'false';
    const mod = await importModule();

    const reqHandler = mod.sentryRequestHandler();
    const traceHandler = mod.sentryTracingHandler();
    const errHandler = mod.sentryErrorHandler();

    const next = vi.fn();
    reqHandler({} as any, {} as any, next);
    traceHandler({} as any, {} as any, next);
    errHandler(new Error('x'), {} as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(3);
  });
});
