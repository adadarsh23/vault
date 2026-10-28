import express from 'express';
import { isAllowedCorsOrigin } from '../utils/cors.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

const parseOrigin = (value: string | undefined): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null') return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
};

/**
 * CSRF guard for cookie-authenticated endpoints.
 * Rejects cross-site browser requests unless the Origin/Referer matches allowed frontend origins.
 */
export const requireTrustedBrowserOrigin = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  const rawOriginHeader = req.get('origin');
  const rawRefererHeader = req.get('referer');

  // Explicitly reject literal "null" origin sent by sandboxed contexts or malicious exploits
  if (rawOriginHeader?.trim().toLowerCase() === 'null') {
    logger.warn('[CSRF] Blocked request with explicit "null" origin.', {
      method,
      path: req.originalUrl,
      ip: req.ip,
    });
    return next(AppError.forbidden('Null origin is not allowed.', 'CSRF_BLOCKED'));
  }

  const origin = parseOrigin(rawOriginHeader);
  const refererOrigin = parseOrigin(rawRefererHeader);
  const candidateOrigin = origin || refererOrigin;
  const fetchSite = req.get('sec-fetch-site')?.trim().toLowerCase();

  // Extra browser signal: block explicit cross-site browser navigation/fetch attempts.
  if (fetchSite === 'cross-site') {
    logger.warn('[CSRF] Blocked cross-site browser request via Sec-Fetch-Site.', {
      method,
      path: req.originalUrl,
      fetchSite,
    });
    return next(AppError.forbidden('Cross-site request is not allowed.', 'CSRF_BLOCKED'));
  }

  // Non-browser clients or API tooling must supply an authorization header or x-vault-client header
  if (!candidateOrigin) {
    const hasAuth = req.get('authorization') || req.get('x-vault-client');
    if (hasAuth || process.env.NODE_ENV !== 'production') {
      return next();
    }
    logger.warn(
      '[CSRF] Missing origin or referer header on state-changing request in production.',
      {
        method,
        path: req.originalUrl,
      },
    );
    return next(AppError.forbidden('Missing origin or referer header.', 'CSRF_BLOCKED'));
  }

  if (!isAllowedCorsOrigin(candidateOrigin)) {
    logger.warn('[CSRF] Blocked request from disallowed origin.', {
      method,
      path: req.originalUrl,
      origin: candidateOrigin,
    });
    return next(AppError.forbidden('Request origin is not allowed.', 'ORIGIN_FORBIDDEN'));
  }

  return next();
};
