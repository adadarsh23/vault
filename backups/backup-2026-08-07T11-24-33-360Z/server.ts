import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import os from 'os';
import { monitorEventLoopDelay } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { customMongoSanitize } from './server/middleware/mongoSanitize.ts';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

import { connectToMongo } from './server/mongo.ts';
import { resolvePort, listenWithFallback } from './server/network.ts';
import { registerSocketHandlers } from './server/socket.ts';
import { registerVaultRoutes } from './server/routes/vaultRoutes.ts';
import { authRouter } from './server/routes/authRoutes.ts';
import masterKeyRouter from './server/routes/masterKeyRoutes.ts';
import { contactRouter } from './server/routes/contactRoutes.ts';
import { systemRouter } from './server/routes/systemRoutes.ts';
import { twoFactorRouter } from './server/routes/twoFactorRoutes.ts';
import { securityRouter } from './server/routes/securityRoutes.ts';
import { notificationRouter } from './server/routes/notificationRoutes.ts';
import { avatarRouter } from './server/routes/avatarRoutes.ts';

import { setupFrontendMiddleware } from './server/vite.ts';
import { installBodyParsers } from './server/middleware/bodyParsers.ts';
import { installCsrfProtection } from './server/middleware/csrfProtection.ts';
import { requireAuth } from './server/middleware/authMiddleware.ts';
import { errorHandler } from './server/middleware/errorHandler.ts';
import { getHealthStatus, getReadinessStatus } from './server/controllers/healthController.ts';
import { originProtection } from './server/middleware/originProtection.ts';
import { getAllowedCorsOrigins, isAllowedCorsOrigin } from './server/utils/cors.ts';
import { getUploadRoot } from './server/utils/fileStorage.ts';
import { startKeepAlive } from './server/keep-alive.ts';
import { logger } from './server/utils/logger.ts';
import { validateRuntimeEnv } from './server/utils/env.ts';
import { getClientIp } from './server/utils/requestIp.ts';
import { deepCompressionOptions } from './server/utils/compression.ts';
import {
  renderStartupBanner,
  createBootAnimator,
  renderStartupSummary,
  startDevHeartbeat,
  createRuntimeMetrics,
  type StartupPhaseTiming,
} from './server/boot/startup.ts';
import {
  addBreadcrumb as sentryAddBreadcrumb,
  captureException as sentryCaptureException,
  flushSentry,
  initSentry,
  sentryErrorHandler,
  sentryRequestHandler,
  sentryTracingHandler,
} from './server/lib/sentry.js';
import {
  captureServerException,
  initLogRocketServer,
  logRocketErrorMiddleware,
  registerLogRocketMiddleware,
} from './server/lib/logrocket.ts';

/**
 * HELMET CONFIGURATION
 */
const buildHelmetConfig = (): Parameters<typeof helmet>[0] => {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredOrigins = getAllowedCorsOrigins();
  const selfAndConfiguredOrigins = ["'self'", ...configuredOrigins];
  const mediaAndImageSources = [...selfAndConfiguredOrigins, 'blob:', 'data:', 'https:'];
  const connectSources = [
    ...selfAndConfiguredOrigins,
    'blob:',
    'wss:',
    ...(isProduction ? [] : ['ws:']),
    // Maps / geocoding
    'https://nominatim.openstreetmap.org',
    // reCAPTCHA
    'https://www.google.com',
    'https://www.gstatic.com',
    'https://www.recaptcha.net',
    // Password breach checking
    'https://api.pwnedpasswords.com',
    // Analytics / monitoring
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://region1.google-analytics.com',
    'https://stats.g.doubleclick.net',
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://*.logrocket.com',
    'https://*.logr-in.com',
  ];

  return {
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    originAgentCluster: true,
    frameguard: { action: 'deny' },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xssFilter: false,
    hidePoweredBy: true,
    ieNoOpen: true,
    referrerPolicy: {
      policy: isProduction ? 'no-referrer' : 'strict-origin-when-cross-origin',
    },
    contentSecurityPolicy: {
      useDefaults: false, // Explicitly disable defaults to prevent collisions
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        connectSrc: connectSources,
        imgSrc: mediaAndImageSources,
        mediaSrc: mediaAndImageSources,
        scriptSrc: isProduction
          ? [
              "'self'",
              "'wasm-unsafe-eval'",
              'https://www.googletagmanager.com',
              'https://cdn.logr-in.com',
              'https://www.google.com',
              'https://www.gstatic.com',
              'https://www.recaptcha.net',
            ]
          : [
              "'self'",
              "'unsafe-inline'",
              "'unsafe-eval'",
              'blob:',
              'https://www.googletagmanager.com',
              'https://cdn.logr-in.com',
              'https://www.google.com',
              'https://www.gstatic.com',
              'https://www.recaptcha.net',
            ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:', 'https://fonts.googleapis.com'],
        scriptSrcAttr: ["'none'"],
        fontSrc: ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com'],
        frameSrc: [
          "'self'",
          'blob:',
          'https://view.officeapps.live.com',
          'https://*.google.com',
          'https://*.google.co.in',
          'https://recaptcha.google.com',
          'https://www.recaptcha.net',
        ],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        ...(isProduction ? { upgradeInsecureRequests: [] as string[] } : {}),
      },
    },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  };
};

const resolveTrustProxy = (): boolean | number => {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();

  if (!raw) {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  if (raw === 'true' || raw === '1') {
    return 1;
  }

  if (raw === 'false' || raw === '0') {
    return false;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return process.env.NODE_ENV === 'production' ? 1 : false;
};

const resolveKeepAliveEnabled = (): boolean => {
  const raw = process.env.KEEP_ALIVE_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === 'production';
  }

  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }

  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
};

const resolveCompressionEnabled = (): boolean => {
  const raw = process.env.ENABLE_COMPRESSION?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV !== 'development';
  }

  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }

  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }

  return process.env.NODE_ENV !== 'development';
};

const resolveEventLoopLagThresholdMs = (): number => {
  const parsed = Number.parseInt(process.env.EVENT_LOOP_LAG_THRESHOLD_MS || '250', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 250;
};

const resolveOverloadProtectionEnabled = (): boolean => {
  const raw = process.env.ENABLE_OVERLOAD_PROTECTION?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === 'production';
  }

  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') {
    return true;
  }

  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
};

const resolveSkipMongoConnect = (): boolean => {
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const overloadHtmlPath = path.resolve(process.cwd(), 'overload.html');
let overloadHtmlCache: string | null = null;

const renderOverloadHtml = (): string => {
  try {
    if (overloadHtmlCache) return overloadHtmlCache;
    overloadHtmlCache = fs.readFileSync(overloadHtmlPath, 'utf8');
    return overloadHtmlCache;
  } catch (error) {
    logger.warn('[OVERLOAD] Failed to load overload.html. Using inline fallback.', {
      overloadHtmlPath,
      error,
    });
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>503 Service Unavailable</title></head><body><main><h1>503 Service Unavailable</h1><p>The server is temporarily overloaded and cannot process this request right now.</p><p>Please wait a few seconds and refresh.</p><p>If this continues, check <code>/health</code> and server logs for overload details.</p></main></body></html>`;
  }
};

const isStaticAssetRequestPath = (requestPath: string): boolean => {
  if (
    requestPath.startsWith('/assets/') ||
    requestPath === '/sw.js' ||
    requestPath === '/sw-register.js' ||
    requestPath === '/favicon.ico' ||
    requestPath === '/site.webmanifest'
  ) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(requestPath);
};

const setOverloadResponseHeaders = (res: express.Response): void => {
  res.setHeader('Retry-After', '5');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/**
 * RATE LIMITING
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    error: { code: 'TOO_MANY_REQUESTS' },
  },
});

let processErrorHandlersRegistered = false;
const exitProcess = (code: number) => {
  setImmediate(() => process.exit(code));
};

const registerProcessErrorHandlers = () => {
  if (processErrorHandlersRegistered) {
    return;
  }

  processErrorHandlersRegistered = true;

  process.on('unhandledRejection', (reason) => {
    captureServerException(reason, { source: 'unhandledRejection' });
    sentryCaptureException(reason, { tags: { source: 'unhandledRejection' } });
    logger.error('[FATAL] Unhandled Rejection', { reason });
    void flushSentry(2000).finally(() => exitProcess(1));
  });

  process.on('uncaughtException', (error) => {
    captureServerException(error, { source: 'uncaughtException' });
    sentryCaptureException(error, { tags: { source: 'uncaughtException' } });
    logger.error('[FATAL] Uncaught Exception', { error });
    void flushSentry(2000).finally(() => exitProcess(1));
  });
};

async function startServer() {
  initSentry();
  initLogRocketServer();
  registerProcessErrorHandlers();
  const startupAnimator = createBootAnimator();
  const runtimeMetrics = createRuntimeMetrics();
  const bootStartedAt = Date.now();
  const phaseTimings: StartupPhaseTiming[] = [];
  let requestCount = 0;

  const runPhase = async (name: string, task: () => Promise<void> | void) => {
    const startedAt = Date.now();
    await task();
    phaseTimings.push({ name, durationMs: Date.now() - startedAt });
  };

  renderStartupBanner();
  startupAnimator.start('Validating environment', 'Checking secrets and runtime flags');

  try {
    startupAnimator.update('Validating environment', 'Checking runtime flags');
    await runPhase('Environment', () => validateRuntimeEnv());

    // Validate JWT configuration
    startupAnimator.update('Validating JWT configuration', 'Checking token signing secrets');
    await runPhase('JWT Diagnostics', async () => {
      const { logJwtDiagnostics } = await import('./server/utils/jwtDiagnostics.ts');
      logJwtDiagnostics();
    });

    const skipMongoConnect = resolveSkipMongoConnect();
    if (skipMongoConnect) {
      phaseTimings.push({ name: 'MongoDB Init (skipped)', durationMs: 0 });
      logger.warn(
        '[MONGO] SKIP_MONGO_CONNECT is enabled. Continuing startup without database connection.'
      );
    } else {
      startupAnimator.update('Connecting to MongoDB', 'Negotiating database session');
      await runPhase('MongoDB Init', async () => {
        await connectToMongo();
      });
    }

    startupAnimator.update('Creating application shell', 'Configuring HTTP server and middleware');
    const app = express();
    const httpServer = createServer(app);
    const trustProxy = resolveTrustProxy();
    const shutdownController = new AbortController();
    const eventLoopLagThresholdMs = resolveEventLoopLagThresholdMs();
    const overloadProtectionEnabled = resolveOverloadProtectionEnabled();
    const eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 20 });
    eventLoopDelayMonitor.enable();
    let latestEventLoopLagMs = 0;
    const eventLoopLagSampler = setInterval(() => {
      latestEventLoopLagMs = eventLoopDelayMonitor.percentile(99) / 1_000_000;
      eventLoopDelayMonitor.reset();
    }, 1000);
    eventLoopLagSampler.unref();
    let shutdownInProgress = false;
    let lastOverloadLogAt = 0;

    app.set('shutdownSignal', shutdownController.signal);

    // Defend against slowloris-style socket starvation.
    httpServer.requestTimeout = 30_000;
    httpServer.headersTimeout = 35_000;
    httpServer.keepAliveTimeout = 5_000;

    httpServer.on('connection', (socket) => {
      runtimeMetrics.onConnectionOpen();
      socket.on('close', () => runtimeMetrics.onConnectionClose());
    });
    httpServer.on('error', (error) => {
      logger.error('[HTTP SERVER ERROR]', { error });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('[MONGO] Connection disconnected.');
    });
    mongoose.connection.on('error', (error) => {
      logger.error('[MONGO] Connection error.', { error });
    });

    // Security & Optimization
    await runPhase('Middleware Init', () => {
      app.use(sentryRequestHandler());
      app.use(sentryTracingHandler());
      registerLogRocketMiddleware(app);
      app.disable('x-powered-by');
      if (process.env.NODE_ENV !== 'production') {
        app.set('etag', false);
      }
      app.set('trust proxy', trustProxy);
      app.use(helmet(buildHelmetConfig()));
      app.use(originProtection); // Enforce CDN-only access in production
      app.use(
        cors({
          origin: (origin, callback) => {
            if (!origin || isAllowedCorsOrigin(origin)) return callback(null, true);
            return callback(new Error('Origin is not allowed by CORS.'));
          },
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-CSRF-Token',
            'X-XSRF-Token',
            'X-Vault-Category',
            'X-Vault-Title',
            'X-Vault-Metadata',
            'X-Request-Id',
            'Tus-Resumable',
            'Upload-Length',
            'Upload-Metadata',
            'Upload-Offset',
          ],
          exposedHeaders: ['Location', 'Tus-Resumable', 'Upload-Offset', 'Upload-Length'],
        })
      );
      if (resolveCompressionEnabled()) {
        app.use(compression(deepCompressionOptions));
      }
      app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
      app.use((_req, res, next) => {
        res.setTimeout(30_000);
        next();
      });
    });

    // Request Tracking
    app.use((req, res, next) => {
      requestCount++;
      const finishTracking = runtimeMetrics.onRequestStart();
      const requestId = randomUUID();
      let trackingFinished = false;
      const finalizeTracking = () => {
        if (trackingFinished) return;
        trackingFinished = true;
        finishTracking(res.statusCode);
      };
      (req as any).requestId = requestId;
      res.setHeader('x-request-id', requestId);
      res.on('finish', finalizeTracking);
      res.on('close', finalizeTracking);
      next();
    });

    app.use((req, res, next) => {
      const shouldSkipBreadcrumb =
        req.path === '/health' || req.path === '/ready' || isStaticAssetRequestPath(req.path);
      if (!shouldSkipBreadcrumb) {
        sentryAddBreadcrumb({
          category: 'http',
          message: `${req.method} ${req.originalUrl}`,
          level: 'info',
          data: { requestId: (req as any).requestId },
        });
      }
      if (req.path === '/health' || req.path === '/ready') {
        return next();
      }

      if (!overloadProtectionEnabled) {
        return next();
      }

      const lagMs = Number.isFinite(latestEventLoopLagMs) ? latestEventLoopLagMs : 0;
      if (lagMs <= eventLoopLagThresholdMs) {
        return next();
      }

      const now = Date.now();
      if (now - lastOverloadLogAt >= 5000) {
        lastOverloadLogAt = now;
        logger.warn('[OVERLOAD] Event loop lag threshold exceeded.', {
          lagMs: Math.round(lagMs),
          thresholdMs: eventLoopLagThresholdMs,
          path: req.originalUrl,
          method: req.method,
        });
      }

      const isApiRequest = req.path.startsWith('/api');
      const isHtmlNavigation =
        req.accepts(['html', 'json']) === 'html' && !!req.headers.accept?.includes('text/html');
      const isAssetRequest = isStaticAssetRequestPath(req.path);

      // Never block static frontend files. Returning 503 for module/font files
      // causes hard boot failures in browsers during brief load spikes.
      if (isAssetRequest) {
        return next();
      }

      if (!isApiRequest && isHtmlNavigation) {
        setOverloadResponseHeaders(res);
        return res.status(503).type('html').send(renderOverloadHtml());
      }

      setOverloadResponseHeaders(res);
      return res.status(503).json({
        success: false,
        message: 'Server overloaded. Please retry shortly.',
        error: { code: 'SERVER_OVERLOADED' },
      });
    });

    await runPhase('Body, CSRF, And Sanitize', () => {
      installBodyParsers(app);
      installCsrfProtection(app);
      app.use(customMongoSanitize); // Prevent NoSQL injection
    });

    // Diagnostic Logging for Auth Errors
    app.use((req, res, next) => {
      let logged = false;
      const logAuthError = () => {
        if (logged) return;
        logged = true;
        if (res.statusCode === 401 || res.statusCode === 403) {
          logger.warn(`Auth Error [${res.statusCode}]: ${req.method} ${req.originalUrl}`, {
            ip: getClientIp(req),
            hasAuthHeader: !!req.get('authorization'),
            queryKeys: Object.keys(req.query),
            uid: req.query.uid,
          });
        }
      };

      res.on('finish', logAuthError);
      res.on('close', logAuthError);
      next();
    });

    app.use((req, res, next) => {
      if (shutdownInProgress && req.path === '/ready') {
        return res.status(503).json({
          success: false,
          status: 'shutting_down',
        });
      }
      next();
    });

    await runPhase('Socket Init', () => {
      registerSocketHandlers(httpServer);
    });

    // Routes
    await runPhase('Routes Load', () => {
      app.get('/health', getHealthStatus);
      app.get('/api/health', getHealthStatus);
      app.get('/ready', getReadinessStatus);
      app.get('/api/ready', getReadinessStatus);
      app.use('/uploads', requireAuth, express.static(getUploadRoot()));

      app.use('/api', (req, res, next) => {
        // Let auth-specific rate limiters handle refresh/login endpoints.
        // Prevent global API throttling from breaking session restoration.
        if (req.path === '/auth/refresh') {
          return next();
        }
        return apiLimiter(req, res, next);
      });
      app.use('/api/auth', authRouter);
      app.use('/api/master-key', masterKeyRouter);
      app.use('/api/contact', contactRouter);
      app.use('/api/system', systemRouter);
      app.use('/api/2fa', twoFactorRouter);
      app.use('/api/security', securityRouter);
      app.use('/api/notifications', notificationRouter);
      app.use('/api/avatar', avatarRouter);
      registerVaultRoutes(app);
    });

    // Frontend (must be after API)
    await runPhase('Frontend Middleware', () => setupFrontendMiddleware(app, httpServer));

    // Global Error Handler (must be last)
    await runPhase('Error Handler', () => {
      app.use(logRocketErrorMiddleware());
      app.use(sentryErrorHandler());
      app.use(errorHandler);
    });

    startupAnimator.update('Binding network port', 'Publishing secure endpoints');
    const port = await listenWithFallback(
      httpServer,
      '0.0.0.0',
      resolvePort(process.env.PORT, 4000)
    );

    // Finalize Startup
    const networkUrls: string[] = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal)
          networkUrls.push(`http://${net.address}:${port}`);
      }
    }

    const keepAliveState = startKeepAlive(process.env.PUBLIC_URL, 13, {
      enabled: resolveKeepAliveEnabled(),
      silentWhenDisabled: true,
    });

    startupAnimator.succeed('Startup complete', 'Vault runtime initialized');
    renderStartupSummary({
      port,
      trustProxy,
      networkUrls,
      bootDurationMs: Date.now() - bootStartedAt,
      keepAliveTarget: keepAliveState.enabled
        ? (keepAliveState.target ?? process.env.PUBLIC_URL)
        : undefined,
      phaseTimings,
      runtimeMetrics: runtimeMetrics.snapshot(),
    });

    startDevHeartbeat({
      port,
      requestCounter: () => requestCount,
    });

    // Graceful Shutdown
    const runShutdownPhase = async (
      phase: 'http_close' | 'mongo_disconnect' | 'socket_cleanup',
      task: () => Promise<void> | void
    ) => {
      const startedAt = Date.now();
      logger.info('[SHUTDOWN] Phase started.', { phase });
      try {
        await task();
        logger.info('[SHUTDOWN] Phase completed.', {
          phase,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        logger.error('[SHUTDOWN] Phase failed.', {
          phase,
          durationMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    };

    const shutdown = async (signal: string) => {
      if (shutdownInProgress) {
        return;
      }
      shutdownInProgress = true;
      shutdownController.abort(new Error('Server shutdown in progress.'));
      logger.warn(`[SHUTDOWN] Signal received: ${signal}`);
      logger.info('[SHUTDOWN] Closing HTTP server...');
      const forcedExitTimer = setTimeout(() => {
        httpServer.closeIdleConnections?.();
        httpServer.closeAllConnections?.();
        exitProcess(1);
      }, 10_000);
      forcedExitTimer.unref();

      try {
        await runShutdownPhase('http_close', async () => {
          await new Promise<void>((resolve, reject) => {
            httpServer.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          });
        });
        await runShutdownPhase('mongo_disconnect', async () => {
          logger.info('[SHUTDOWN] Disconnecting MongoDB...');
          await mongoose.disconnect();
        });
        await runShutdownPhase('socket_cleanup', () => {
          clearInterval(eventLoopLagSampler);
          httpServer.closeIdleConnections?.();
          httpServer.closeAllConnections?.();
          eventLoopDelayMonitor.disable();
        });
        logger.info('[SHUTDOWN] Cleanup complete.', {
          phase: 'complete',
        });
        await flushSentry(2000);
        exitProcess(0);
      } catch (error) {
        logger.error('[SHUTDOWN] Error during graceful shutdown.', { error });
        await flushSentry(2000);
        exitProcess(1);
      } finally {
        clearTimeout(forcedExitTimer);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    startupAnimator.fail(
      'Startup failed',
      error instanceof Error ? error.message : 'Unknown error'
    );
    logger.error('Failed to start server.', { error });
    exitProcess(1);
  }
}

startServer();
