import * as Sentry from '@sentry/react';

const isBrowser = typeof window !== 'undefined';
const env = import.meta.env;
const appEnv = env.VITE_SENTRY_ENVIRONMENT || env.MODE || 'development';
const dsn = env.VITE_SENTRY_DSN;
const isLocalhost =
  isBrowser && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const isEnabledFlag = env.VITE_SENTRY_ENABLED === 'true';
const isDisabledExplicitly = env.VITE_SENTRY_ENABLED === 'false';
const allowLocalhost = env.VITE_SENTRY_ENABLE_LOCALHOST === 'true';
const isProd = env.PROD === true;
const sentryEnabled =
  Boolean(dsn) &&
  !isDisabledExplicitly &&
  (isEnabledFlag || (isProd && (!isLocalhost || allowLocalhost)));

let initialized = false;
let globalHandlersBound = false;
const recentEventCache = new Map();

const toNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const eventKeyFromException = (exception, hint) => {
  const stack = hint?.originalException?.stack || '';
  const message =
    hint?.originalException?.message ||
    (exception?.values && exception.values[0]?.value) ||
    'unknown';
  return `${message}::${stack}`;
};

const shouldDropDuplicate = (key) => {
  const now = Date.now();
  const lastSeenAt = recentEventCache.get(key);
  recentEventCache.set(key, now);
  if (!lastSeenAt) return false;
  return now - lastSeenAt < 1200;
};

export const initSentry = (options = {}) => {
  if (!sentryEnabled || initialized || !isBrowser) return false;

  const routerIntegration = options.reactRouter
    ? Sentry.reactRouterV7BrowserTracingIntegration(options.reactRouter)
    : Sentry.browserTracingIntegration();

  Sentry.init({
    dsn,
    environment: appEnv,
    release: env.VITE_SENTRY_RELEASE || env.VITE_APP_RELEASE || undefined,
    enabled: sentryEnabled,
    integrations: [
      routerIntegration,
      ...(env.VITE_SENTRY_REPLAY_ENABLED === 'true'
        ? [
            Sentry.replayIntegration({
              maskAllText: true,
              blockAllMedia: true,
            }),
          ]
        : []),
    ],
    tracesSampleRate: toNumber(env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
    replaysSessionSampleRate: toNumber(env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE, 0),
    replaysOnErrorSampleRate: toNumber(env.VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE, 0.1),
    beforeSend(event, hint) {
      if (event.exception) {
        const key = eventKeyFromException(event.exception, hint);
        if (shouldDropDuplicate(key)) {
          return null;
        }
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'ui.click' && !breadcrumb.message) {
        return null;
      }
      return breadcrumb;
    },
  });

  initialized = true;
  return true;
};

export const bindGlobalErrorHandlers = () => {
  if (!sentryEnabled || !isBrowser || globalHandlersBound) return;
  globalHandlersBound = true;

  window.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason, {
      tags: { source: 'unhandledrejection' },
    });
  });
};

export const trackRouteNavigation = (location) => {
  if (!sentryEnabled || !location) return;
  addBreadcrumb({
    category: 'navigation',
    message: `${location.pathname}${location.search || ''}`,
    level: 'info',
  });
};

export const captureException = (error, context = {}) => {
  if (!sentryEnabled) return null;
  return Sentry.captureException(error, context);
};

export const captureMessage = (message, level = 'info', context = {}) => {
  if (!sentryEnabled) return null;
  return Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value);
    }
    return Sentry.captureMessage(message, level);
  });
};

export const setUser = (user) => {
  if (!sentryEnabled) return;
  Sentry.setUser(user || null);
};

export const clearUser = () => {
  if (!sentryEnabled) return;
  Sentry.setUser(null);
};

export const addBreadcrumb = (breadcrumb) => {
  if (!sentryEnabled) return;
  Sentry.addBreadcrumb(breadcrumb);
};

export const sentryIsEnabled = () => sentryEnabled;
