import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import os from 'os';
import { monitorEventLoopDelay } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { customMongoSanitize } from './server/middleware/mongoSanitize.ts';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

import { connectToMongo } from './server/mongo.ts';
import { multiClusterPool } from './server/services/multiClusterPool.ts';
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
import { integrityRouter } from './server/routes/integrityRoutes.ts';

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
  acquireBootLock,
  setBootState,
  sanitizeStartupError,
  createShutdownManager,
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

  // Document & Office Viewers (Google Docs/Drive, Microsoft Office 365, Adobe, Mozilla PDF.js)
  const documentViewerSources = [
    'https://docs.google.com',
    'https://drive.google.com',
    'https://*.google.com',
    'https://*.google.co.in',
    'https://*.googleusercontent.com',
    'https://*.googleapis.com',
    'https://lh3.googleusercontent.com',
    'https://view.officeapps.live.com',
    'https://*.officeapps.live.com',
    'https://*.office.com',
    'https://*.office365.com',
    'https://*.live.com',
    'https://*.microsoft.com',
    'https://*.onedrive.live.com',
    'https://*.sharepoint.com',
    'https://*.1drv.ms',
    'https://*.msauth.net',
    'https://*.msftauth.net',
    'https://documentservices.adobe.com',
    'https://*.adobe.com',
    'https://*.documentcloud.adobe.com',
    'https://acrobat.adobe.com',
    'https://mozilla.github.io',
    'https://*.mozilla.org',
    'https://*.mozilla.net',
  ];

  // Map & Geo Services
  const mapSources = [
    'https://nominatim.openstreetmap.org',
    'https://*.openstreetmap.org',
    'https://*.tile.openstreetmap.org',
    'https://api.open-meteo.com',
  ];

  // Security, reCAPTCHA & Auth
  const securityAndAuthSources = [
    'https://www.google.com',
    'https://*.google.com',
    'https://www.gstatic.com',
    'https://*.gstatic.com',
    'https://recaptcha.google.com',
    'https://www.recaptcha.net',
    'https://*.recaptcha.net',
    'https://challenges.cloudflare.com',
    'https://*.hcaptcha.com',
    'https://api.pwnedpasswords.com',
  ];

  // CDNs, Web Workers, Packages, Cloud Storage & Syntax Highlighters
  const cdnPackageSources = [
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://fastly.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://esm.sh',
    'https://cdn.skypack.dev',
    'https://jspm.dev',
    'https://cdn.tailwindcss.com',
    'https://raw.githubusercontent.com',
    'https://*.githubusercontent.com',
    'https://*.github.com',
    'https://*.githubassets.com',
    'https://*.gitlab.com',
    'https://*.dropbox.com',
    'https://*.dropboxusercontent.com',
    'https://*.box.com',
    'https://*.box.net',
    'https://*.amazonaws.com',
    'https://*.cloudfront.net',
    'https://*.supabase.co',
    'https://*.firebaseio.com',
  ];

  // Analytics & Monitoring
  const telemetrySources = [
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://region1.google-analytics.com',
    'https://stats.g.doubleclick.net',
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://*.sentry.io',
    'https://*.logrocket.com',
    'https://*.logr-in.com',
  ];

  // Video & Embed Media Sources
  const mediaEmbedSources = [
    'https://www.youtube.com',
    'https://*.youtube.com',
    'https://*.youtube-nocookie.com',
    'https://player.vimeo.com',
    'https://*.vimeo.com',
    'https://*.canva.com',
    'https://*.figma.com',
  ];

  const connectSources = [
    ...selfAndConfiguredOrigins,
    'blob:',
    'data:',
    'wss:',
    ...(isProduction ? [] : ['ws:']),
    ...mapSources,
    ...securityAndAuthSources,
    ...documentViewerSources,
    ...cdnPackageSources,
    ...telemetrySources,
  ];

  const frameSources = [
    "'self'",
    'blob:',
    'data:',
    ...documentViewerSources,
    ...securityAndAuthSources,
    ...mapSources,
    ...mediaEmbedSources,
  ];

  const childSources = [
    "'self'",
    'blob:',
    'data:',
    ...cdnPackageSources,
    ...documentViewerSources,
    ...securityAndAuthSources,
    ...mapSources,
    ...mediaEmbedSources,
  ];

  const workerSources = [
    "'self'",
    'blob:',
    'data:',
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://fastly.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://esm.sh',
    'https://cdn.skypack.dev',
  ];

  const scriptSources = [
    'blob:',
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://fastly.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://esm.sh',
    'https://cdn.skypack.dev',
    'https://cdn.tailwindcss.com',
    'https://www.googletagmanager.com',
    'https://cdn.logr-in.com',
    'https://www.google.com',
    'https://*.google.com',
    'https://docs.google.com',
    'https://www.gstatic.com',
    'https://*.gstatic.com',
    'https://recaptcha.google.com',
    'https://www.recaptcha.net',
    'https://*.recaptcha.net',
    'https://challenges.cloudflare.com',
    'https://*.hcaptcha.com',
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
          ? ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'", ...scriptSources]
          : ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "'unsafe-eval'", ...scriptSources],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https:',
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
        ],
        scriptSrcAttr: ["'none'"],
        fontSrc: [
          "'self'",
          'https:',
          'data:',
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
        ],
        frameSrc: frameSources,
        manifestSrc: ["'self'"],
        workerSrc: workerSources,
        childSrc: childSources,
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
  const parsed = Number.parseInt(process.env.EVENT_LOOP_LAG_THRESHOLD_MS || '1000', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 1000;
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
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const overloadHtmlPath = path.resolve(process.cwd(), 'overload.html');
let overloadHtmlCache: string | null = null;

const FALLBACK_OVERLOAD_HTML = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>503 Service Unavailable</title></head><body><main><h1>503 Service Unavailable</h1><p>The server is temporarily overloaded and cannot process this request right now.</p><p>Please wait a few seconds and refresh.</p><p>If this continues, check <code>/health</code> and server logs for overload details.</p></main></body></html>`;

const serviceBusyJsPath = path.resolve(process.cwd(), 'public', 'service-busy.js');
const buildServiceBusyJsPath = path.resolve(process.cwd(), 'build', 'service-busy.js');
let serviceBusyJsCache: string | null = null;

const preloadOverloadAssets = async (): Promise<void> => {
  try {
    overloadHtmlCache = await fs.promises.readFile(overloadHtmlPath, 'utf8');
  } catch (error) {
    logger.warn('[OVERLOAD] Failed to load overload.html. Using inline fallback.', {
      overloadHtmlPath,
      error,
    });
    overloadHtmlCache = FALLBACK_OVERLOAD_HTML;
  }

  try {
    if (fs.existsSync(serviceBusyJsPath)) {
      serviceBusyJsCache = await fs.promises.readFile(serviceBusyJsPath, 'utf8');
    } else if (fs.existsSync(buildServiceBusyJsPath)) {
      serviceBusyJsCache = await fs.promises.readFile(buildServiceBusyJsPath, 'utf8');
    }
  } catch {
    serviceBusyJsCache = '';
  }
};

const renderOverloadHtml = (): string => {
  return overloadHtmlCache || FALLBACK_OVERLOAD_HTML;
};

const renderServiceBusyJs = (): string => {
  return serviceBusyJsCache || '';
};

const isStaticAssetRequestPath = (requestPath: string): boolean => {
  if (
    requestPath.startsWith('/assets/') ||
    requestPath === '/sw.js' ||
    requestPath === '/sw-register.js' ||
    requestPath === '/service-busy.js' ||
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
  windowMs: Number.parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000,
  max: () => {
    const configured = Number.parseInt(process.env.API_RATE_LIMIT_MAX || '', 10);
    if (process.env.NODE_ENV !== 'production') {
      return Number.isFinite(configured) && configured > 5000 ? configured : 50000;
    }
    return Number.isFinite(configured) && configured > 0 ? configured : 2000;
  },
  skip: (req) => {
    if (process.env.DISABLE_RATE_LIMITING === 'true') {
      return true;
    }
    // In local development, bypass rate limiting for localhost requests to avoid dev lockouts
    if (process.env.NODE_ENV !== 'production') {
      const clientIp = req.ip || req.socket.remoteAddress || '';
      if (
        clientIp === '127.0.0.1' ||
        clientIp === '::1' ||
        clientIp === '::ffff:127.0.0.1' ||
        clientIp.includes('127.0.0.1')
      ) {
        return true;
      }
    }
    return false;
  },
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    const userId = (req as any)?.user?.userId;
    if (userId) {
      return `user_${userId}`;
    }
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return `token_${authHeader.slice(7, 40)}`;
    }
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
  },
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
  if (!acquireBootLock()) {
    logger.warn(
      '[BOOT] Server startup is already in progress or completed. Ignoring duplicate startup call.',
    );
    return;
  }

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
    await runPhase('Preload Overload Assets', () => preloadOverloadAssets());

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
        '[MONGO] SKIP_MONGO_CONNECT is enabled. Continuing startup without database connection.',
      );
    } else {
      startupAnimator.update('Connecting to MongoDB', 'Negotiating database session');
      await runPhase('MongoDB Init', async () => {
        await connectToMongo();
        void multiClusterPool.initialize().catch((err) => {
          logger.warn('[MultiClusterPool] Background warmup warning:', err?.message || err);
        });
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

    // Generous timeouts for large encrypted media streams & GridFS chunks
    httpServer.requestTimeout = 300_000; // 5 minutes
    httpServer.headersTimeout = 310_000;
    httpServer.keepAliveTimeout = 65_000;

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
          exposedHeaders: [
            'Location',
            'Tus-Resumable',
            'Upload-Offset',
            'Upload-Length',
            'Content-Range',
            'Accept-Ranges',
            'Content-Length',
            'Content-Type',
            'Retry-After',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
          ],
        }),
      );
      app.use(originProtection); // Enforce CDN-only access in production
      if (resolveCompressionEnabled()) {
        app.use(compression(deepCompressionOptions));
      }
      app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
      app.use((req, res, next) => {
        // Set higher response socket timeout for media access & streaming endpoints
        const isMediaStreamPath =
          req.path.includes('/api/vault/files/access') ||
          req.path.includes('/api/vault/media') ||
          req.path.includes('/uploads');
        res.setTimeout(isMediaStreamPath ? 300_000 : 60_000);
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

      if (req.path === '/service-busy.js') {
        const script = renderServiceBusyJs();
        if (script) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).send(script);
        }
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
        res.status(503).json({
          success: false,
          status: 'shutting_down',
        });
        return;
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
        // Let auth-specific rate limiters handle authentication endpoints.
        // Prevent global API throttling from breaking login/registration/refresh flows.
        if (req.path.startsWith('/auth')) {
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
      app.use('/api/vault/integrity', integrityRouter);
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
      resolvePort(process.env.PORT, 4000),
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
    setBootState('READY');
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
    const runShutdownPhase = async (phase: string, task: () => Promise<void> | void) => {
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

    const shutdownManager = createShutdownManager({
      httpServer,
      timeoutMs: 10_000,
      exitProcess,
      logger,
      onPhase: runShutdownPhase,
      onComplete: async () => {
        clearInterval(eventLoopLagSampler);
        eventLoopDelayMonitor.disable();
        await flushSentry(2000);
      },
    });

    shutdownController.signal.addEventListener('abort', () => {
      void shutdownManager.shutdown('ABORT_SIGNAL');
    });

    shutdownManager.registerSignalHandlers();
  } catch (error) {
    setBootState('FAILED');
    const { sanitizedMessage } = sanitizeStartupError(error);
    startupAnimator.fail('Startup failed', sanitizedMessage);
    logger.error('Failed to start server.', { error: sanitizedMessage });
    exitProcess(1);
  }
}

startServer();
