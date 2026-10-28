import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { redactSensitiveData, sanitizeUrl, sanitizeUserContext } from './sanitizer.ts';

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const enabledFlag = process.env.SENTRY_ENABLED === 'true';
const dsn = process.env.SENTRY_DSN;
const isEnabled = Boolean(dsn) && (enabledFlag || isProd);

const toNumber = (value, fallback, min = 0, max = 1) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

let initialized = false;
let processHandlersRegistered = false;

export { redactSensitiveData };

export const initSentry = () => {
  if (!isEnabled || initialized) return false;

  try {
    Sentry.init({
      dsn,
      enabled: isEnabled,
      environment: process.env.SENTRY_ENVIRONMENT || env,
      release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration(),
        nodeProfilingIntegration(),
      ],
      tracesSampleRate: toNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
      profilesSampleRate: toNumber(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0),
      beforeSend(event) {
        try {
          if (event.request) {
            if (event.request.data) {
              event.request.data = redactSensitiveData(event.request.data);
            }
            if (event.request.headers) {
              event.request.headers = redactSensitiveData(event.request.headers);
            }
            if (event.request.url) {
              event.request.url = sanitizeUrl(event.request.url);
            }
            if (event.request.query_string) {
              event.request.query_string = sanitizeUrl(event.request.query_string);
            }
            if (event.request.cookies) {
              event.request.cookies = redactSensitiveData(event.request.cookies);
            }
          }
          if (event.extra) {
            event.extra = redactSensitiveData(event.extra);
          }
          if (event.user) {
            event.user = sanitizeUserContext(event.user);
          }
          if (Array.isArray(event.breadcrumbs)) {
            event.breadcrumbs = event.breadcrumbs.map((b) => {
              if (b && b.data && typeof b.data === 'object') {
                return { ...b, data: redactSensitiveData(b.data) };
              }
              return b;
            });
          }
        } catch {
          // Fallback to returning event unmodified if scrubbing fails
        }
        return event;
      },
    });

    initialized = true;
    return true;
  } catch {
    return false;
  }
};

export const sentryRequestHandler = () => {
  if (!isEnabled) return (_req, _res, next) => next();
  return (req, _res, next) => {
    Sentry.withScope((scope) => {
      const requestId = req && req.requestId ? req.requestId : 'unknown';
      scope.setTag('request_id', requestId);
      next();
    });
  };
};

export const sentryTracingHandler = () => {
  if (!isEnabled) return (_req, _res, next) => next();
  return (req, res, next) => {
    const rawPath = req?.path || req?.url || 'unknown';
    const method = req?.method || 'GET';
    const sanitizedPath = sanitizeUrl(rawPath);

    Sentry.startSpanManual(
      {
        op: 'http.server',
        name: `${method} ${sanitizedPath}`,
      },
      (span) => {
        let spanEnded = false;
        const endSpan = (status) => {
          if (spanEnded) return;
          spanEnded = true;
          if (typeof status === 'number') {
            span.setAttribute('http.status_code', status);
          }
          span.end();
        };

        const attachListener = (event, cb) => {
          if (typeof res?.once === 'function') {
            res.once(event, cb);
          } else if (typeof res?.on === 'function') {
            res.on(event, cb);
          }
        };

        attachListener('finish', () => endSpan(res?.statusCode));
        attachListener('close', () => endSpan(res?.statusCode || 499));

        next();
      },
    );
  };
};

export const sentryErrorHandler = () => {
  if (!isEnabled) {
    return (err, _req, _res, next) => next(err);
  }
  return Sentry.expressErrorHandler();
};

export const captureException = (error, context) => {
  if (!isEnabled) return null;
  try {
    const safeContext = context ? redactSensitiveData(context) : undefined;
    return Sentry.captureException(error, safeContext);
  } catch {
    return null;
  }
};

export const captureMessage = (message, level = 'info') => {
  if (!isEnabled) return null;
  try {
    const safeMessage = sanitizeUrl(String(message));
    return Sentry.captureMessage(safeMessage, level);
  } catch {
    return null;
  }
};

export const setUserContext = (user) => {
  if (!isEnabled) return;
  try {
    const safeUser = sanitizeUserContext(user);
    Sentry.setUser(safeUser);
  } catch {
    // Non-critical telemetry failure
  }
};

export const addBreadcrumb = (breadcrumb) => {
  if (!isEnabled || !breadcrumb || typeof breadcrumb !== 'object') return;
  try {
    const safeBreadcrumb = { ...breadcrumb };
    if (safeBreadcrumb.data && typeof safeBreadcrumb.data === 'object') {
      safeBreadcrumb.data = redactSensitiveData(safeBreadcrumb.data);
    }
    Sentry.addBreadcrumb(safeBreadcrumb);
  } catch {
    // Non-critical telemetry failure
  }
};

export const registerProcessHandlers = (shutdown) => {
  if (!isEnabled || processHandlersRegistered) return;
  processHandlersRegistered = true;

  process.on('unhandledRejection', (reason) => {
    captureException(reason, { tags: { source: 'unhandledRejection' } });
  });

  process.on('uncaughtException', async (error) => {
    captureException(error, { tags: { source: 'uncaughtException' } });
    try {
      await Sentry.close(2000);
    } catch {
      // Ignore cleanup timeout
    } finally {
      if (typeof shutdown === 'function') {
        shutdown('uncaughtException');
      } else {
        process.exit(1);
      }
    }
  });
};

export const flushSentry = async (timeoutMs = 2000) => {
  if (!isEnabled) return true;
  try {
    return await Sentry.close(timeoutMs);
  } catch {
    return false;
  }
};

export const sentryIsEnabled = () => isEnabled;
