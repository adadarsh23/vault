/**
 * INTEGRATION GUIDE
 *
 * How to integrate all security modules into your Express app
 */

import type { Express } from 'express';
import { Server as HTTPServer } from 'http';
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
  AdaptiveRateLimitService,
  type RedisLikeClient,
} from '../services/adaptiveRateLimitService.ts';
import { logger } from '../utils/logger.ts';

let adaptiveRateLimiter: AdaptiveRateLimitService | null = null;

/**
 * Initialize and register all security middleware/services
 */
export async function initializeSecuritySystem(
  app: Express,
  server: HTTPServer,
  redisClient?: RedisLikeClient,
): Promise<void> {
  logger.info('🔒 Initializing AI-powered security system...');

  // 1. Setup Socket.IO for real-time dashboard
  const io = new SocketServer(server, {
    cors: {
      origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  securityDashboardService.initializeWebSocket(io);
  logger.info('✓ Real-time dashboard initialized');

  // 2. Initialize adaptive rate limiting
  adaptiveRateLimiter = createAdaptiveRateLimitService(redisClient);
  logger.info('✓ Adaptive rate limiting initialized');

  // 3. MIDDLEWARE CHAIN (order matters!)
  // Apply security middleware in correct order

  // First: Audit logging
  app.use(auditLogMiddleware);

  // Second: Rate limiting (before auth)
  app.use(async (req, res, next) => {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const category = req.path.includes('/auth') ? 'auth' : 'api';

    const rateLimitResult = await adaptiveRateLimiter!.checkRateLimit(
      identifier,
      category,
      (req as any).user?.userId,
    );

    res.set('RateLimit-Limit', rateLimitResult.action === 'block' ? '0' : '100');
    res.set('RateLimit-Remaining', rateLimitResult.remaining.toString());
    res.set('RateLimit-Reset', rateLimitResult.resetTime.toString());

    if (rateLimitResult.action === 'block') {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'You have exceeded the rate limit. Please try again later.',
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
      });
      return;
    }

    next();
  });

  // Third: Security middleware (fingerprinting, anomaly detection)
  app.use(securityMiddleware);

  // Fourth: File upload security
  app.use(fileUploadSecurityMiddleware);

  // Fifth: Performance monitoring
  app.use(performanceSecurityMiddleware);

  // 4. Mount security routes
  app.use('/api/security', securityRouter);

  // 5. Setup background tasks
  startSecurityMonitoringTasks(redisClient, io);

  logger.info('✅ Security system fully initialized');
}

/**
 * Background monitoring and cleanup tasks
 */
function startSecurityMonitoringTasks(
  _redisClient: RedisLikeClient | undefined,
  io: SocketServer,
): void {
  // Refresh dashboard metrics every 30 seconds
  setInterval(async () => {
    try {
      const metrics = await securityDashboardService.getCurrentMetrics();
      io.to('dashboard:threats').emit('metrics_update', metrics);
    } catch (error) {
      logger.error('[MONITORING] Error updating metrics', error);
    }
  }, 30000);

  // Cleanup old blacklist entries (daily)
  setInterval(async () => {
    try {
      logger.info('[MAINTENANCE] Running security cleanup tasks');
      // TODO: Clean expired Redis entries
      // TODO: Archive old incidents (older than 90 days)
      // TODO: Update IP reputation from external sources
    } catch (error) {
      logger.error('[MAINTENANCE] Cleanup error', error);
    }
  }, 86400000); // 24 hours

  logger.info('✓ Background monitoring tasks started');
}

export { adaptiveRateLimiter, securityDashboardService };
