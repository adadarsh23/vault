import express from 'express';
import { isAllowedCorsOrigin } from '../utils/cors.ts';
import { AppError } from '../utils/appError.ts';

const parseOrigin = (value: string | undefined): string | null => {
  if (!value || !value.trim()) return null;
  try {
    return new URL(value).origin;
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

  const origin = parseOrigin(req.get('origin'));
  const refererOrigin = parseOrigin(req.get('referer'));
  const candidateOrigin = origin || refererOrigin;
  const fetchSite = req.get('sec-fetch-site')?.trim().toLowerCase();

  // Extra browser signal: block explicit cross-site browser navigation/fetch attempts.
  if (fetchSite === 'cross-site') {
    throw AppError.forbidden('Cross-site request is not allowed.', 'CSRF_BLOCKED');
  }

  // Non-browser clients may omit Origin/Referer; keep compatibility for API tooling.
  if (!candidateOrigin) {
    return next();
  }

  if (!isAllowedCorsOrigin(candidateOrigin)) {
    throw AppError.forbidden('Request origin is not allowed.', 'ORIGIN_FORBIDDEN');
  }

  return next();
};
