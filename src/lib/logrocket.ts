const isBrowser = typeof window !== 'undefined';
const appId = import.meta.env.VITE_LOGROCKET_APP_ID;
const isProd = import.meta.env.PROD === true;
const allowLocalhost = import.meta.env.VITE_LOGROCKET_ALLOW_LOCALHOST === 'true';

type LogRocketClient = {
  init: (appId: string, options?: { release?: string }) => void;
  identify: (userId: string, traits: Record<string, string>) => void;
  captureException: (
    error: Error,
    options?: { tags?: Record<string, string | number | boolean> },
  ) => void;
};

const isLocalHost = () => {
  if (!isBrowser) {
    return false;
  }

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
};

let initialized = false;
let initializing = false;
let logRocketClient: LogRocketClient | null = null;

export const hasTelemetryConsent = (): boolean => {
  if (!isBrowser) return false;
  try {
    const consent = localStorage.getItem('vault_telemetry_consent');
    if (consent === 'false') return false;
    if (consent === 'true') return true;
  } catch {
    // ignore
  }
  return import.meta.env.VITE_TELEMETRY_CONSENT !== 'false';
};

const isEnabled = () =>
  isBrowser &&
  isProd &&
  Boolean(appId) &&
  import.meta.env.VITE_LOGROCKET_ENABLED !== 'false' &&
  hasTelemetryConsent() &&
  (allowLocalhost || !isLocalHost());

export const initLogRocket = (): boolean => {
  if (!isEnabled() || initialized || initializing) {
    return false;
  }

  initializing = true;

  void import('logrocket')
    .then((module) => {
      const LogRocket =
        (module as { default?: LogRocketClient }).default ?? (module as unknown as LogRocketClient);

      logRocketClient = LogRocket;
      (logRocketClient as any).init(appId, {
        release: import.meta.env.VITE_APP_RELEASE || import.meta.env.VITE_SENTRY_RELEASE,
        dom: {
          inputSanitizer: true,
          textSanitizer: true,
        },
        network: {
          requestSanitizer: (request: any) => {
            if (request.headers) {
              delete request.headers['authorization'];
              delete request.headers['x-csrf-token'];
              delete request.headers['csrf-token'];
              delete request.headers['cookie'];
            }
            if (request.body && typeof request.body === 'string') {
              try {
                const parsed = JSON.parse(request.body);
                const sensitiveFields = [
                  'password',
                  'newPassword',
                  'currentPassword',
                  'masterKey',
                  'token',
                  'refreshToken',
                  'accessToken',
                  'dek',
                  'kek',
                  'secret',
                  'privateKey',
                  'pqcSalt',
                  'ciphertext',
                  'payload',
                  'twoFactorCode',
                  'totpCode',
                  'recoveryCodes',
                  'backupCodes',
                ];
                for (const field of sensitiveFields) {
                  if (parsed[field] !== undefined) parsed[field] = '[REDACTED]';
                }
                request.body = JSON.stringify(parsed);
              } catch {
                if (request.url?.includes('/auth/') || request.url?.includes('/vault/')) {
                  request.body = '[REDACTED]';
                }
              }
            }
            return request;
          },
          responseSanitizer: (response: any) => {
            if (response.headers) {
              delete response.headers['set-cookie'];
            }
            if (response.body && typeof response.body === 'string') {
              try {
                const parsed = JSON.parse(response.body);
                if (parsed.token) parsed.token = '[REDACTED]';
                if (parsed.accessToken) parsed.accessToken = '[REDACTED]';
                if (parsed.refreshToken) parsed.refreshToken = '[REDACTED]';
                if (parsed.masterKey) parsed.masterKey = '[REDACTED]';
                if (parsed.data?.token) parsed.data.token = '[REDACTED]';
                if (parsed.data?.accessToken) parsed.data.accessToken = '[REDACTED]';
                response.body = JSON.stringify(parsed);
              } catch {
                // non-JSON response
              }
            }
            return response;
          },
        },
      });
      initialized = true;
    })
    .catch(() => {
      // Keep LogRocket optional and non-blocking.
      initialized = false;
    })
    .finally(() => {
      initializing = false;
    });

  return true;
};

export const identifyLogRocketUser = (
  userId?: string,
  traits?: {
    username?: string;
    email?: string;
    name?: string;
  },
) => {
  if (!isEnabled() || !initialized || !userId || !hasTelemetryConsent()) {
    return;
  }
  if (!logRocketClient) {
    return;
  }

  // Only forward non-sensitive, scrubbed traits
  const safeTraits: Record<string, string> = {};
  if (traits?.username) safeTraits.username = traits.username;

  logRocketClient.identify(userId, {
    ...safeTraits,
  });
};

export const captureLogRocketError = (error: unknown, extra?: Record<string, unknown>) => {
  if (!isEnabled() || !initialized) {
    return;
  }
  if (!logRocketClient) {
    return;
  }
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const tags: Record<string, string | number | boolean> = {};
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        tags[key] = value;
      }
    }
  }
  logRocketClient.captureException(normalizedError, { tags });
};
