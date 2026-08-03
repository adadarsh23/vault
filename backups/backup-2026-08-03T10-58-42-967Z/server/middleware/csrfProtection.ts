import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';

type SameSitePolicy = 'strict' | 'lax' | 'none';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME?.trim() || 'vault_csrf_secret';
const CSRF_COOKIE_PATH = process.env.CSRF_COOKIE_PATH?.trim() || '/';
const CSRF_SECRET = process.env.CSRF_SECRET || 'vault_super_secret_csrf_key_2026';

const resolveCsrfCookieSameSite = (): SameSitePolicy => {
  const raw = process.env.CSRF_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (raw === 'strict' || raw === 'lax' || raw === 'none') {
    return raw;
  }
  return IS_PRODUCTION ? 'none' : 'lax';
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
  if (!secret || !token) return false;
  try {
    const expectedToken = crypto.createHmac('sha256', CSRF_SECRET).update(secret).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(token));
  } catch {
    return false;
  }
};

const writeCsrfTokenResponseHeaders = (res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/**
 * Installs cookie parsing and CSRF token validation for /api routes.
 * Uses modern Double-Submit Cookie pattern with HMAC timing-safe validation.
 */
export const installCsrfProtection = (app: express.Express): void => {
  app.use(cookieParser());

  if (shouldSkipCsrfInCurrentRuntime()) {
    app.get('/api/auth/csrf-token', (_req, res) => {
      writeCsrfTokenResponseHeaders(res);
      return res.status(200).json({
        success: true,
        data: { csrfToken: 'test-csrf-bypass' },
      });
    });
    return;
  }

  app.get('/api/auth/csrf-token', (req, res) => {
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

  app.use('/api', (req, res, next) => {
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    const secret = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken =
      (req.headers['x-csrf-token'] as string) ||
      (req.headers['csrf-token'] as string) ||
      (req.body && (req.body._csrf as string));

    if (!verifyToken(secret, headerToken)) {
      const csrfError = new Error('Invalid or missing CSRF token.');
      (csrfError as any).status = 403;
      (csrfError as any).statusCode = 403;
      (csrfError as any).code = 'CSRF_TOKEN_INVALID';
      return next(csrfError);
    }

    next();
  });
};
