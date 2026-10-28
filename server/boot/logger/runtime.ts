import process from 'process';
import { ansi, colorize, isProduction } from './colors.ts';

/**
 * Validates and normalizes a public URL string.
 * Ensures the protocol is http or https and strips any trailing slashes.
 * Rejects invalid URLs or malicious schemes (e.g., javascript:, data:).
 */
export const normalizePublicUrl = (value?: string): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const cleanOrigin = parsed.origin;
    const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${cleanOrigin}${cleanPath}`;
  } catch {
    return null;
  }
};

/**
 * Resolves the corresponding health check endpoint URL for a given public base URL.
 */
export const toHealthUrl = (value?: string): string | null => {
  const base = normalizePublicUrl(value);
  if (!base) return null;
  return `${base}/health`;
};

const envFlag = (name: string, required = false): string => {
  const present = Boolean(process.env[name]?.trim());
  const badge = present
    ? colorize('[OK]', ansi.green)
    : required
      ? colorize('[MISS]', ansi.yellow)
      : colorize('[N/A]', ansi.gray);
  return `${badge} ${name}`;
};

const envEitherFlag = (names: string[], required = false, isOptional = false): string => {
  const present = names.some((name) => Boolean(process.env[name]?.trim()));
  const badge = present
    ? colorize('[OK]', ansi.green)
    : isOptional
      ? colorize('[SKIP]', ansi.cyan)
      : required
        ? colorize('[MISS]', ansi.yellow)
        : colorize('[N/A]', ansi.gray);
  return `${badge} ${names.join(' | ')}`;
};

/**
 * Generates environment configuration status badges for startup diagnostics.
 * NOTE: Values, secrets, tokens, and database passwords are NEVER rendered.
 */
export const getEnvChecks = (): string[] => {
  const isProd = isProduction();
  const rawSkipMongo = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const isSkipMongo =
    !isProd &&
    (rawSkipMongo === '1' ||
      rawSkipMongo === 'true' ||
      rawSkipMongo === 'yes' ||
      rawSkipMongo === 'on');

  return [
    envFlag('JWT_SECRET', true),
    envFlag('REFRESH_TOKEN_SECRET', isProd),
    envEitherFlag(['MONGODB_URI', 'MONGODB_URL', 'MONGO_URI', 'MONGO_URL'], true, isSkipMongo),
    envFlag('CLIENT_URL', isProd),
    envFlag('PUBLIC_URL', isProd),
    envFlag('VITE_APP_PUBLIC_URL', isProd),
    envFlag('RECAPTCHA_SECRET_KEY', isProd),
    envFlag('VAULT_ENCRYPTION_KEY', isProd),
    envFlag('AUTH_PEPPER', isProd),
    envFlag('CSRF_SECRET', isProd),
    envFlag('SIGNED_URL_SECRET', isProd),
    envFlag('TRUST_PROXY', false),
  ];
};
