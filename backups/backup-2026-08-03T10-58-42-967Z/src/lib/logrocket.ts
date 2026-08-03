const isBrowser = typeof window !== 'undefined';
const appId = import.meta.env.VITE_LOGROCKET_APP_ID;
const isProd = import.meta.env.PROD === true;
const allowLocalhost = import.meta.env.VITE_LOGROCKET_ALLOW_LOCALHOST === 'true';

type LogRocketClient = {
  init: (appId: string, options?: { release?: string }) => void;
  identify: (userId: string, traits: Record<string, string>) => void;
  captureException: (
    error: Error,
    options?: { tags?: Record<string, string | number | boolean> }
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

const isEnabled = () =>
  isBrowser &&
  isProd &&
  Boolean(appId) &&
  import.meta.env.VITE_LOGROCKET_ENABLED !== 'false' &&
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
      logRocketClient.init(appId, {
        release: import.meta.env.VITE_APP_RELEASE || import.meta.env.VITE_SENTRY_RELEASE,
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
  }
) => {
  if (!isEnabled() || !initialized || !userId) {
    return;
  }
  if (!logRocketClient) {
    return;
  }

  const safeTraits: Record<string, string> = {};
  if (traits?.name) safeTraits.name = traits.name;
  if (traits?.email) safeTraits.email = traits.email;
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
