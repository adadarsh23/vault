import express from 'express';
import ipRangeCheck from 'ip-range-check';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

/**
 * Origin Protection Middleware
 *
 * Restricts access to the origin server so it's only reachable via trusted CDN IPs.
 * This prevents attackers from bypassing the CDN's Web Application Firewall (WAF)
 * or DDoS protection by hitting the server's public IP directly.
 */

const ALLOWED_CDN_RANGES = ['74.220.48.0/24', '74.220.56.0/24'];

const LOCALHOST_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

export const originProtection = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Extract the actual connecting IP (not the X-Forwarded-For)
  // We want the IP that is DIRECTLY hitting the server.
  const connectingIp = req.socket.remoteAddress || 'unknown';
  const normalizedIp = connectingIp.replace(/^::ffff:/, '');

  // 1. Always allow localhost for internal health checks or local dev
  // Also allow the /health path to be accessed directly for provider health checks
  if (LOCALHOST_IPS.includes(normalizedIp) || !isProduction || req.path === '/health') {
    return next();
  }

  // 2. Check if the connecting IP is within the trusted CDN ranges
  const isFromCDN = ipRangeCheck(normalizedIp, ALLOWED_CDN_RANGES);

  if (!isFromCDN) {
    logger.warn('Origin Protection: Blocked direct access attempt', {
      ip: normalizedIp,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });

    // Throw a 403 Forbidden - the server is effectively invisible to public traffic
    throw new AppError(
      403,
      'ORIGIN_PROTECTED',
      'Direct access to origin server is prohibited. Please use the designated CDN endpoint.'
    );
  }

  next();
};
