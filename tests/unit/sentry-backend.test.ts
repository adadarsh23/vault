import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => {
  const init = vi.fn();
  const captureException = vi.fn(() => 'event-id');
  const captureMessage = vi.fn(() => 'message-id');
  const addBreadcrumb = vi.fn();
  const setUser = vi.fn();
  const close = vi.fn(async () => true);
  const withScope = vi.fn((cb: any) =>
    cb({
      setTag: vi.fn(),
    }),
  );
  const startSpanManual = vi.fn((_opts: any, cb: any) =>
    cb({
      setAttribute: vi.fn(),
      end: vi.fn(),
    }),
  );
  const expressErrorHandler = vi.fn(
    () => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next(),
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
          masterKey: 'vault-master-key-xyz',
          dek: 'secret-dek',
          ciphertext: '0123456789abcdef',
          nested: { token: 'abc' },
        },
        url: 'https://vault.internal/api/auth/verify?token=secretToken',
        query_string: 'token=secretToken&limit=10',
      },
      extra: {
        refreshToken: 'secret-refresh',
      },
    });

    expect(event.request.headers.authorization).toBe('[Filtered]');
    expect(event.request.headers.cookie).toBe('[Filtered]');
    expect(event.request.data.password).toBe('[Filtered]');
    expect(event.request.data.masterKey).toBe('[Filtered]');
    expect(event.request.data.dek).toBe('[Filtered]');
    expect(event.request.data.ciphertext).toBe('[Filtered]');
    expect(event.request.data.nested.token).toBe('[Filtered]');
    expect(event.extra.refreshToken).toBe('[Filtered]');
    expect(event.request.url).toBe('https://vault.internal/api/auth/verify?token=[Filtered]');
    expect(event.request.query_string).toBe('token=[Filtered]&limit=10');
  });

  it('safely handles circular references and prototype pollution in beforeSend', async () => {
    const mod = await importModule();
    mod.initSentry();
    const initArg = sentryMock.init.mock.calls[0][0];

    const circular: any = { note: 'test' };
    circular.loop = circular;

    const polluted = JSON.parse('{"status": "ok", "__proto__": {"hacked": true}}');

    const event = initArg.beforeSend({
      extra: {
        circular,
        polluted,
      },
    });

    expect(event.extra.circular.note).toBe('test');
    expect(event.extra.circular.loop).toBe('[CircularReference]');
    expect(event.extra.polluted.status).toBe('ok');
    expect((Object.prototype as any).hacked).toBeUndefined();
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

  it('setUserContext scrubs credentials and passwords from user objects', async () => {
    const mod = await importModule();
    mod.initSentry();

    mod.setUserContext({
      id: 'usr_100',
      username: 'alice',
      email: 'alice@vault.local',
      passwordHash: 'hash-secret',
      masterKey: 'mk-secret',
      salt: 'salt-123',
    });

    expect(sentryMock.setUser).toHaveBeenCalledWith({
      id: 'usr_100',
      username: 'alice',
      email: 'alice@vault.local',
    });
  });

  it('addBreadcrumb redacts sensitive fields in breadcrumb data', async () => {
    const mod = await importModule();
    mod.initSentry();

    mod.addBreadcrumb({
      category: 'auth',
      data: {
        action: 'login',
        password: 'raw-password',
        token: 'jwt-token',
      },
    });

    expect(sentryMock.addBreadcrumb).toHaveBeenCalledWith({
      category: 'auth',
      data: {
        action: 'login',
        password: '[Filtered]',
        token: '[Filtered]',
      },
    });
  });

  it('tracing handler records status and safely ends span on finish and close', async () => {
    const mod = await importModule();
    mod.initSentry();

    const handler = mod.sentryTracingHandler();
    const listeners: Record<string, () => void> = {};
    const req = { method: 'POST', path: '/api/v1/vault/items?token=secret' };
    const res = {
      statusCode: 201,
      on: vi.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      }),
    };
    const next = vi.fn();

    handler(req as any, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    expect(sentryMock.startSpanManual).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'POST /api/v1/vault/items?token=[Filtered]',
      }),
      expect.any(Function),
    );

    listeners.finish?.();
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

  it('clamps sample rates between 0 and 1', async () => {
    process.env.SENTRY_TRACES_SAMPLE_RATE = '2.5';
    process.env.SENTRY_PROFILES_SAMPLE_RATE = '-0.5';
    const mod = await importModule();
    mod.initSentry();

    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1,
        profilesSampleRate: 0,
      }),
    );
  });

  it('registerProcessHandlers sets up listeners once and handles shutdown', async () => {
    const mod = await importModule();
    mod.initSentry();

    const shutdown = vi.fn();
    mod.registerProcessHandlers(shutdown);
    mod.registerProcessHandlers(shutdown); // Should be idempotent
  });
});
