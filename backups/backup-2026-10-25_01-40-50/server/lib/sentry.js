import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const enabledFlag = process.env.SENTRY_ENABLED === 'true';
const dsn = process.env.SENTRY_DSN;
const isEnabled = Boolean(dsn) && (enabledFlag || isProd);

const toNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

let initialized = false;

const redactSensitiveData = (input) => {
  if (!input || typeof input !== 'object') return input;
  const hiddenKeys = [
    'password',
    'token',
    'authorization',
    'cookie',
    'set-cookie',
    'masterkey',
    'secret',
    'secretkey',
    'privatekey',
    'apikey',
    'ciphertext',
    'authtag',
    'iv',
    'payload',
    'binarypayload',
    'dek',
    'kek',
    'mnemonic',
    'seedphrase',
    'passphrase',
    'pqcsalt',
    'salt',
    'totp',
    'totpsecret',
    'recoverycodes',
    'backupcodes',
    'twofactorsecret',
    'twofactorcode',
    'encryptedmetadata',
  ];

  const clone = Array.isArray(input) ? [...input] : { ...input };

  for (const [key, value] of Object.entries(clone)) {
    const normalizedKey = key.toLowerCase();
    if (hiddenKeys.includes(normalizedKey) || hiddenKeys.some((k) => normalizedKey.includes(k))) {
      clone[key] = '[Filtered]';
      continue;
    }

    if (value && typeof value === 'object') {
      clone[key] = redactSensitiveData(value);
    }
  }

  return clone;
};

export const initSentry = () => {
  if (!isEnabled || initialized) return false;

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
      if (event.request) {
        event.request.data = redactSensitiveData(event.request.data);
        event.request.headers = redactSensitiveData(event.request.headers);
      }
      if (event.extra) {
        event.extra = redactSensitiveData(event.extra);
      }
      return event;
    },
  });

  initialized = true;
  return true;
};

export const sentryRequestHandler = () => {
  if (!isEnabled) return (_req, _res, next) => next();
  return (req, _res, next) => {
    Sentry.withScope((scope) => {
      scope.setTag('request_id', req.requestId || 'unknown');
      next();
    });
  };
};

export const sentryTracingHandler = () => {
  if (!isEnabled) return (_req, _res, next) => next();
  return (req, res, next) => {
    Sentry.startSpanManual(
      {
        op: 'http.server',
        name: `${req.method} ${req.path}`,
      },
      (span) => {
        res.on('finish', () => {
          span.setAttribute('http.status_code', res.statusCode);
          span.end();
        });
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
  return Sentry.captureException(error, context);
};

export const captureMessage = (message, level = 'info') => {
  if (!isEnabled) return null;
  return Sentry.captureMessage(message, level);
};

export const setUserContext = (user) => {
  if (!isEnabled) return;
  Sentry.setUser(user || null);
};

export const addBreadcrumb = (breadcrumb) => {
  if (!isEnabled) return;
  Sentry.addBreadcrumb(breadcrumb);
};

export const registerProcessHandlers = (shutdown) => {
  if (!isEnabled) return;

  process.on('unhandledRejection', (reason) => {
    captureException(reason, { tags: { source: 'unhandledRejection' } });
  });

  process.on('uncaughtException', async (error) => {
    captureException(error, { tags: { source: 'uncaughtException' } });
    try {
      await Sentry.close(2000);
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
  return Sentry.close(timeoutMs);
};

export const sentryIsEnabled = () => isEnabled;
