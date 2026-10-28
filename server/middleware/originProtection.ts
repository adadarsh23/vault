import express from 'express';
import ipRangeCheck from 'ip-range-check';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { isAllowedCorsOrigin } from '../utils/cors.ts';

/**
 * Origin Protection Middleware
 *
 * Restricts access to the origin server so it's only reachable via trusted CDN IPs.
 * This prevents attackers from bypassing the CDN's Web Application Firewall (WAF)
 * or DDoS protection by hitting the server's public IP directly.
 */

const DEFAULT_CDN_RANGES = ['74.220.48.0/24', '74.220.56.0/24'];

const resolveAllowedCdnRanges = (): string[] => {
  const envRanges = process.env.ALLOWED_CDN_RANGES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return envRanges && envRanges.length > 0 ? envRanges : DEFAULT_CDN_RANGES;
};

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const isHealthCheckPath = (pathname: string): boolean => {
  return (
    pathname === '/health' ||
    pathname === '/ready' ||
    pathname === '/api/health' ||
    pathname === '/api/ready'
  );
};

export const originProtection = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const disableOriginProtection =
    process.env.DISABLE_ORIGIN_PROTECTION === '1' ||
    process.env.DISABLE_ORIGIN_PROTECTION?.toLowerCase() === 'true';

  if (disableOriginProtection || !isProduction) {
    return next();
  }

  // Extract the actual connecting IP (not X-Forwarded-For)
  const connectingIp = req.socket?.remoteAddress || 'unknown';
  const normalizedIp = connectingIp.replace(/^::ffff:/, '');

  // 1. Always allow localhost and container/load balancer health checks
  if (LOCALHOST_IPS.has(normalizedIp) || isHealthCheckPath(req.path)) {
    return next();
  }

  // 2. Allow media streaming & access routes
  const isMediaRoute =
    req.path.startsWith('/api/vault/files/access/') ||
    req.path.startsWith('/api/vault/files/') ||
    req.path.startsWith('/api/vault/media/') ||
    req.path.startsWith('/api/vault/avatar/') ||
    req.path.startsWith('/api/avatar/');

  if (isMediaRoute) {
    return next();
  }

  // 3. Allow requests originating from authorized CORS origins
  const rawOrigin = req.get('origin') || req.get('referer');
  if (rawOrigin) {
    try {
      const candidate = new URL(rawOrigin).origin;
      if (isAllowedCorsOrigin(candidate)) {
        return next();
      }
    } catch {
      // Ignore invalid URL formatting
    }
  }

  // 4. Verify whether connecting IP is within trusted CDN CIDR ranges
  const cdnRanges = resolveAllowedCdnRanges();
  let isFromCDN = false;
  try {
    isFromCDN = Boolean(normalizedIp && ipRangeCheck(normalizedIp, cdnRanges));
  } catch {
    isFromCDN = false;
  }

  if (!isFromCDN) {
    logger.warn('Origin Protection: Blocked direct access attempt', {
      ip: normalizedIp,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });

    return next(
      new AppError(
        403,
        'ORIGIN_PROTECTED',
        'Direct access to origin server is prohibited. Please use the designated CDN endpoint.',
      ),
    );
  }

  return next();
};
