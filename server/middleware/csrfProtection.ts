import express from 'express';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';

type SameSitePolicy = 'strict' | 'lax' | 'none';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME?.trim() || 'vault_csrf_secret';
const CSRF_COOKIE_PATH = process.env.CSRF_COOKIE_PATH?.trim() || '/';

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

const csrfProtection = csurf({
  cookie: {
    key: CSRF_COOKIE_NAME,
    httpOnly: true,
    secure: resolveCsrfCookieSecure(),
    sameSite: resolveCsrfCookieSameSite(),
    path: CSRF_COOKIE_PATH,
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

const writeCsrfTokenResponseHeaders = (res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/**
 * Installs cookie parsing and CSRF token validation for /api routes.
 * Also exposes a token bootstrap endpoint for SPA clients.
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

  app.get('/api/auth/csrf-token', csrfProtection, (req, res) => {
    writeCsrfTokenResponseHeaders(res);
    return res.status(200).json({
      success: true,
      data: { csrfToken: req.csrfToken() },
    });
  });

  app.use('/api', csrfProtection);
};
