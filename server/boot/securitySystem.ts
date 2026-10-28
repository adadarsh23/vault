import type { Express, NextFunction, Request, Response } from 'express';
import { Server as HTTPServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';

import {
  securityMiddleware,
  fileUploadSecurityMiddleware,
  performanceSecurityMiddleware,
  auditLogMiddleware,
} from '../middleware/securityMiddleware.ts';

import { securityRouter } from '../routes/securityRoutes.ts';
import { securityDashboardService } from '../services/securityDashboardService.ts';

import {
  createAdaptiveRateLimitService,
  type AdaptiveRateLimitService,
  type RedisLikeClient,
} from '../services/adaptiveRateLimitService.ts';

import { getClientIp } from '../utils/requestIp.ts';
import { verifyAccessToken } from '../utils/auth.ts';
import { logger } from '../utils/logger.ts';

const METRICS_INTERVAL_MS = 30_000;
const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DASHBOARD_ORIGIN = 'http://localhost:3000';

let adaptiveRateLimiter: AdaptiveRateLimitService | null = null;
let socketServer: SocketServer | null = null;
let ownsSocketServer = false;
let monitoringStarted = false;
let initializationPromise: Promise<void> | null = null;

let metricsTimer: ReturnType<typeof setInterval> | null = null;
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;

let metricsRunning = false;
let maintenanceRunning = false;

export interface SecuritySystemOptions {
  redisClient?: RedisLikeClient;
  existingSocketServer?: SocketServer;
  failClosed?: boolean;
}

/**
 * Validates and normalizes the dashboard URL.
 */
function getDashboardOrigin(): string {
  const configuredOrigin = process.env.DASHBOARD_URL?.trim() || DEFAULT_DASHBOARD_ORIGIN;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredOrigin);
  } catch {
    throw new Error('DASHBOARD_URL must be a valid absolute URL.');
  }

  if (
    parsedUrl.protocol !== 'https:' &&
    parsedUrl.hostname !== 'localhost' &&
    parsedUrl.hostname !== '127.0.0.1'
  ) {
    throw new Error('DASHBOARD_URL must use HTTPS outside localhost.');
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('DASHBOARD_URL must contain only the origin.');
  }

  return parsedUrl.origin;
}

function getPositiveInterval(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

/**
 * Register security middleware and supporting services.
 *
 * Mount this early in the middleware pipeline before application routes.
 */
export async function initializeSecuritySystem(
  app: Express,
  server: HTTPServer,
  options?: SecuritySystemOptions | RedisLikeClient,
): Promise<void> {
  if (monitoringStarted) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  const opts: SecuritySystemOptions =
    options && 'get' in options && typeof options.get === 'function'
      ? { redisClient: options as RedisLikeClient }
      : (options as SecuritySystemOptions) || {};

  initializationPromise = initializeSecuritySystemInternal(app, server, opts);

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

async function initializeSecuritySystemInternal(
  app: Express,
  server: HTTPServer,
  options: SecuritySystemOptions,
): Promise<void> {
  logger.info('[SECURITY] Initializing enterprise security services.');

  const dashboardOrigin = getDashboardOrigin();
  const metricsInterval = getPositiveInterval('SECURITY_METRICS_INTERVAL_MS', METRICS_INTERVAL_MS);
  const maintenanceInterval = getPositiveInterval(
    'SECURITY_MAINTENANCE_INTERVAL_MS',
    MAINTENANCE_INTERVAL_MS,
  );
  const failClosed = options.failClosed ?? process.env.SECURITY_FAIL_CLOSED === 'true';

  let io: SocketServer;

  if (options.existingSocketServer) {
    io = options.existingSocketServer;
    ownsSocketServer = false;
  } else {
    io = new SocketServer(server, {
      cors: {
        origin: dashboardOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      maxHttpBufferSize: 1_000_000,
      connectTimeout: 10_000,
    });
    ownsSocketServer = true;
  }

  socketServer = io;

  try {
    // Authenticate WebSocket connections before admission
    io.use(async (socket, next) => {
      try {
        const authToken =
          socket.handshake.auth?.token ||
          (typeof socket.handshake.headers.authorization === 'string'
            ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
            : null);

        if (!authToken) {
          return next(new Error('Authentication required for security dashboard.'));
        }

        const payload = verifyAccessToken(authToken);
        socket.data.userId = payload.sub;
        socket.data.username = payload.username;
        socket.data.sessionId = payload.sessionId;
        return next();
      } catch (err) {
        logger.warn(
          `[SECURITY] Unauthorized dashboard socket attempt from ${socket.handshake.address}`,
        );
        return next(new Error('Invalid or expired dashboard security token.'));
      }
    });

    securityDashboardService.initializeWebSocket(io);

    adaptiveRateLimiter = createAdaptiveRateLimitService(options.redisClient);

    // 1. Audit logging
    app.use(auditLogMiddleware);

    // 2. Adaptive rate limiting (runs early to protect downstream handlers)
    app.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!adaptiveRateLimiter) {
          res.status(503).json({
            error: 'Service Unavailable',
            message: 'Security rate limit services are not ready.',
          });
          return;
        }

        // Use hardened IP extraction that respects trusted proxy topology
        const identifier = getClientIp(req);

        // Strict classification for authentication vs general API traffic
        const isAuthRoute =
          req.path === '/auth' ||
          req.path.startsWith('/auth/') ||
          req.path === '/api/auth' ||
          req.path.startsWith('/api/auth/');

        const category = isAuthRoute ? 'auth' : 'api';
        const userId = (req as any).user?.userId || (req as any).user?._id?.toString?.();

        const result = await adaptiveRateLimiter.checkRateLimit(identifier, category, userId);

        res.setHeader('Cache-Control', 'no-store');

        const retryAfterSeconds = Math.max(1, Math.ceil((result.resetTime - Date.now()) / 1000));

        if (result.action === 'block') {
          res.setHeader('Retry-After', String(retryAfterSeconds));
          res.setHeader('RateLimit-Limit', '0');
          res.setHeader('RateLimit-Remaining', '0');
          res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

          res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: retryAfterSeconds,
          });
          return;
        }

        res.setHeader('RateLimit-Remaining', String(Math.max(0, result.remaining)));
        res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

        next();
      } catch (error) {
        logger.error('[SECURITY] Rate-limit check failure:', error);

        if (failClosed) {
          res.status(503).json({
            error: 'Service Unavailable',
            message: 'Security validation is temporarily unavailable.',
          });
          return;
        }

        // Resilient fail-open posture: attach alert header and proceed
        res.setHeader('X-Security-Fallback', 'rate-limit-bypass');
        next();
      }
    });

    // 3. Request security checks (fingerprinting, bot detection)
    app.use(securityMiddleware);

    // 4. File-upload validation
    app.use(fileUploadSecurityMiddleware);

    // 5. Performance monitoring
    app.use(performanceSecurityMiddleware);

    // 6. Security administration routes
    app.use('/api/security', securityRouter);

    // 7. Start periodic tasks only after successful wiring
    startSecurityMonitoringTasks(io, metricsInterval, maintenanceInterval);

    monitoringStarted = true;
    logger.info('[SECURITY] Security system fully initialized and armed.');
  } catch (error) {
    stopSecurityMonitoringTasks();

    if (ownsSocketServer && socketServer) {
      socketServer.close();
    }
    socketServer = null;
    adaptiveRateLimiter = null;

    logger.error('[SECURITY] Initialization failed:', error);
    throw error;
  }
}

/**
 * Prevent overlapping executions when scheduled operations take longer than interval.
 */
function startSecurityMonitoringTasks(
  io: SocketServer,
  metricsInterval: number,
  maintenanceInterval: number,
): void {
  if (metricsTimer || maintenanceTimer) {
    return;
  }

  metricsTimer = setInterval(async () => {
    if (metricsRunning) {
      return;
    }

    metricsRunning = true;
    try {
      const metrics = await securityDashboardService.getCurrentMetrics();
      io.to('dashboard:threats').emit('metrics_update', metrics);
    } catch (error) {
      logger.error('[SECURITY] Failed to publish dashboard metrics:', error);
    } finally {
      metricsRunning = false;
    }
  }, metricsInterval);

  maintenanceTimer = setInterval(async () => {
    if (maintenanceRunning) {
      return;
    }

    maintenanceRunning = true;
    try {
      logger.info('[SECURITY] Running scheduled security maintenance...');
      // Safely perform maintenance tasks without blocking
    } catch (error) {
      logger.error('[SECURITY] Maintenance task failed:', error);
    } finally {
      maintenanceRunning = false;
    }
  }, maintenanceInterval);

  // Allow process to terminate naturally if only monitoring timers are queued
  metricsTimer.unref?.();
  maintenanceTimer.unref?.();
}

/**
 * Stop periodic jobs and gracefully close security resources.
 */
export async function shutdownSecuritySystem(): Promise<void> {
  stopSecurityMonitoringTasks();

  const io = socketServer;
  const shouldClose = ownsSocketServer;

  socketServer = null;
  adaptiveRateLimiter = null;
  monitoringStarted = false;
  initializationPromise = null;
  ownsSocketServer = false;

  if (io && shouldClose) {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  }

  logger.info('[SECURITY] Security services stopped gracefully.');
}

function stopSecurityMonitoringTasks(): void {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }

  if (maintenanceTimer) {
    clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  }
}

export { adaptiveRateLimiter, securityDashboardService };
