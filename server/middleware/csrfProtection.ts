import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

type SameSitePolicy = 'strict' | 'lax' | 'none';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME?.trim() || 'vault_csrf_secret';
const CSRF_COOKIE_PATH = process.env.CSRF_COOKIE_PATH?.trim() || '/';

const resolveCsrfSecret = (): string => {
  const secret = process.env.CSRF_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (IS_PRODUCTION) {
    throw new Error('CSRF_SECRET environment variable must be configured in production.');
  }
  return 'vault_super_secret_csrf_key_2026';
};

const CSRF_SECRET = resolveCsrfSecret();

const resolveCsrfCookieSameSite = (): SameSitePolicy => {
  const raw = process.env.CSRF_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (raw === 'strict' || raw === 'lax' || raw === 'none') {
    return raw;
  }
  return 'lax';
};

const resolveCsrfCookieSecure = (): boolean => {
  const raw = process.env.CSRF_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }
  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }
  return IS_PRODUCTION;
};

const readBooleanEnv = (value: string | undefined): boolean | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return null;
};

const isKnownTestRunner = (): boolean =>
  Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID || process.env.JEST_WORKER_ID);

const shouldSkipCsrfInCurrentRuntime = (): boolean => {
  if (process.env.NODE_ENV !== 'test') {
    return false;
  }

  const explicitBypass = readBooleanEnv(process.env.CSRF_TEST_BYPASS);
  if (explicitBypass !== null) {
    return explicitBypass;
  }

  return isKnownTestRunner();
};

const generateTokenAndSecret = (): { secret: string; token: string } => {
  const secret = crypto.randomBytes(32).toString('hex');
  const token = crypto.createHmac('sha256', CSRF_SECRET).update(secret).digest('hex');
  return { secret, token };
};

const verifyToken = (secret: string | undefined, token: string | undefined): boolean => {
  if (!secret || !token || typeof secret !== 'string' || typeof token !== 'string') {
    return false;
  }
  try {
    const expectedToken = crypto.createHmac('sha256', CSRF_SECRET).update(secret).digest('hex');
    const expectedBuf = Buffer.from(expectedToken);
    const tokenBuf = Buffer.from(token);

    if (expectedBuf.length !== tokenBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, tokenBuf);
  } catch {
    return false;
  }
};

const writeCsrfTokenResponseHeaders = (res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const extractHeaderToken = (req: express.Request): string | undefined => {
  const headerCandidates = [
    req.headers['x-csrf-token'],
    req.headers['csrf-token'],
    req.headers['x-xsrf-token'],
  ];

  for (const candidate of headerCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (
      Array.isArray(candidate) &&
      typeof candidate[0] === 'string' &&
      candidate[0].trim().length > 0
    ) {
      return candidate[0].trim();
    }
  }

  if (req.body && typeof req.body._csrf === 'string' && req.body._csrf.trim().length > 0) {
    const bodyToken = req.body._csrf.trim();
    delete req.body._csrf;
    return bodyToken;
  }

  return undefined;
};

/**
 * Installs cookie parsing and CSRF token validation for /api routes.
 * Uses modern Double-Submit Cookie pattern with HMAC timing-safe validation.
 */
export const installCsrfProtection = (app: express.Express): void => {
  app.use(cookieParser());

  if (shouldSkipCsrfInCurrentRuntime()) {
    app.get('/api/auth/csrf-token', (_req: express.Request, res: express.Response) => {
      writeCsrfTokenResponseHeaders(res);
      return res.status(200).json({
        success: true,
        data: { csrfToken: 'test-csrf-bypass' },
      });
    });
    return;
  }

  app.get('/api/auth/csrf-token', (_req: express.Request, res: express.Response) => {
    writeCsrfTokenResponseHeaders(res);
    const { secret, token } = generateTokenAndSecret();

    res.cookie(CSRF_COOKIE_NAME, secret, {
      httpOnly: true,
      secure: resolveCsrfCookieSecure(),
      sameSite: resolveCsrfCookieSameSite(),
      path: CSRF_COOKIE_PATH,
    });

    return res.status(200).json({
      success: true,
      data: { csrfToken: token },
    });
  });

  app.use('/api', (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    // Avatar presigned upload & presign endpoints authenticate via HMAC signature and query tokens
    const currentUrl = req.originalUrl || req.path || '';
    if (
      currentUrl.startsWith('/api/avatar/upload') ||
      req.path.startsWith('/avatar/upload') ||
      currentUrl.startsWith('/api/avatar/presign') ||
      req.path.startsWith('/avatar/presign')
    ) {
      return next();
    }

    const secret = req.cookies?.[CSRF_COOKIE_NAME];
    const token = extractHeaderToken(req);

    if (!verifyToken(secret, token)) {
      logger.warn('[CSRF] Invalid or missing CSRF token.', {
        method: req.method,
        path: req.originalUrl,
        hasCookie: Boolean(secret),
        hasToken: Boolean(token),
        ip: req.ip,
      });

      return next(AppError.forbidden('Invalid or missing CSRF token.', 'CSRF_TOKEN_INVALID'));
    }

    next();
  });
};
