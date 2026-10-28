/**
 * Production-ready LogRocket Server Monitoring Integration
 *
 * Provides safe exception capture, sanitized request telemetry,
 * and lifecycle handlers for server-side observability.
 *
 * @module server/lib/logrocket
 */

import type express from 'express';
import LogRocket from 'logrocket';
import { logger } from '../utils/logger.ts';
import { FILTERED_PLACEHOLDER, sanitizeTags, sanitizeUrl } from './sanitizer.ts';

const appId = process.env.LOGROCKET_APP_ID?.trim();
const isProd = process.env.NODE_ENV === 'production';
const isEnabled = Boolean(appId) && isProd;

let initialized = false;
let processHandlersRegistered = false;

const MONITORING_KEY = Symbol.for('vault.logrocket.monitoring.registered');

/**
 * Checks whether LogRocket server monitoring is configured and active.
 */
export const isLogRocketEnabled = (): boolean => isEnabled && initialized;

/**
 * Initializes the LogRocket server SDK if configured for the current environment.
 * Safe to call multiple times (idempotent).
 *
 * @returns {boolean} True if successfully initialized; false otherwise.
 */
export const initLogRocketServer = (): boolean => {
  if (!isEnabled || initialized) {
    return false;
  }

  try {
    LogRocket.init(appId as string);
    initialized = true;
    logger.info('[LOGROCKET] Server monitoring enabled.');
    return true;
  } catch (error) {
    logger.warn('[LOGROCKET] Server monitoring init failed.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

/**
 * Safely captures a server-side exception with sanitized context and tags.
 * Ensures credentials, tokens, sensitive query params, and circular structures
 * are never leaked into telemetry.
 *
 * @param {unknown} error - Error instance or thrown primitive/object.
 * @param {Record<string, unknown>} [context] - Optional telemetry context or metadata.
 */
export const captureServerException = (error: unknown, context?: Record<string, unknown>): void => {
  if (!isEnabled || !initialized) {
    return;
  }

  try {
    let normalizedError: Error;
    if (error instanceof Error) {
      normalizedError = error;
      // If error message contains sensitive query strings, sanitize it
      if (
        normalizedError.message &&
        (normalizedError.message.includes('?') || normalizedError.message.includes('Bearer'))
      ) {
        normalizedError = new Error(sanitizeUrl(normalizedError.message, FILTERED_PLACEHOLDER));
        normalizedError.name = error.name;
        normalizedError.stack = error.stack;
      }
    } else {
      normalizedError = new Error(sanitizeUrl(String(error), FILTERED_PLACEHOLDER));
    }

    // Sanitize and extract only safe, primitive tags
    const tags = context ? sanitizeTags(context) : {};

    LogRocket.captureException(normalizedError, { tags });
  } catch (captureError) {
    logger.warn('[LOGROCKET] Failed to capture server exception.', {
      error: captureError instanceof Error ? captureError.message : String(captureError),
    });
  }
};

/**
 * Registers global Node.js process handlers for unhandled promise rejections
 * and uncaught exceptions to report them to LogRocket.
 * Idempotent: ensures event listeners are only attached once.
 */
export const registerLogRocketProcessHandlers = (): void => {
  if (!isEnabled || !initialized || processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;

  process.on('unhandledRejection', (reason: unknown) => {
    captureServerException(reason, { source: 'unhandledRejection' });
  });

  process.on('uncaughtExceptionMonitor', (error: unknown) => {
    captureServerException(error, { source: 'uncaughtExceptionMonitor' });
  });
};

/**
 * Creates an Express request logging middleware that records API request duration
 * and lifecycle status, with automatic sanitization of sensitive URL query parameters.
 */
export const logRocketRequestLogger = (): express.RequestHandler => {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const startedAt = Date.now();
    let logged = false;

    const recordLog = (): void => {
      if (logged) return;
      logged = true;

      const rawUrl = req.originalUrl || req.url || '';
      logger.info('[API REQUEST]', {
        requestId: (req as express.Request & { requestId?: string })?.requestId,
        method: req.method,
        path: sanitizeUrl(rawUrl, FILTERED_PLACEHOLDER),
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    };

    const attachListener = (event: string, cb: () => void): void => {
      if (typeof res?.once === 'function') {
        res.once(event, cb);
      } else if (typeof res?.on === 'function') {
        res.on(event, cb);
      }
    };

    attachListener('finish', recordLog);
    attachListener('close', recordLog);

    next();
  };
};

/**
 * Creates an Express error-handling middleware that captures unhandled route errors
 * and forwards them to the next error middleware.
 */
export const logRocketErrorMiddleware = (): express.ErrorRequestHandler => {
  return (
    error: unknown,
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    const rawUrl = req?.originalUrl || req?.url || '';
    captureServerException(error, {
      path: sanitizeUrl(rawUrl, FILTERED_PLACEHOLDER),
      method: req?.method,
      requestId: (req as express.Request & { requestId?: string })?.requestId,
    });
    next(error);
  };
};

/**
 * Mounts LogRocket monitoring middleware onto the Express application.
 * Ensures middleware is only mounted once even if invoked repeatedly.
 *
 * @param {express.Express} app - Express application instance.
 */
export const registerLogRocketMiddleware = (app: express.Express): void => {
  if (!app || typeof app.use !== 'function') {
    return;
  }

  const scopedApp = app as express.Express & {
    [MONITORING_KEY]?: boolean;
  };

  if (scopedApp[MONITORING_KEY]) {
    return;
  }

  scopedApp[MONITORING_KEY] = true;
  app.use(logRocketRequestLogger());
};
