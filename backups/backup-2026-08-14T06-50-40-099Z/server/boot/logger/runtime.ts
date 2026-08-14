import { ansi, colorize, isProd } from './colors.ts';

export const normalizePublicUrl = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const toHealthUrl = (value?: string): string | null => {
  const base = normalizePublicUrl(value);
  if (!base) return null;
  return `${base}/health`;
};

const envFlag = (name: string, required = false) => {
  const present = Boolean(process.env[name]?.trim());
  const badge = present
    ? colorize('[OK]', ansi.green)
    : required
      ? colorize('[MISS]', ansi.yellow)
      : colorize('[N/A]', ansi.gray);
  return `${badge} ${name}`;
};

const envEitherFlag = (names: string[], required = false) => {
  const present = names.some((name) => Boolean(process.env[name]?.trim()));
  const badge = present
    ? colorize('[OK]', ansi.green)
    : required
      ? colorize('[MISS]', ansi.yellow)
      : colorize('[N/A]', ansi.gray);
  return `${badge} ${names.join(' | ')}`;
};

export const getEnvChecks = () => [
  envFlag('JWT_SECRET', true),
  envFlag('REFRESH_TOKEN_SECRET', isProd),
  envEitherFlag(['MONGODB_URI', 'MONGODB_URL'], true),
  envFlag('PUBLIC_URL', isProd),
  envFlag('CLIENT_URL', isProd),
  envFlag('VITE_APP_PUBLIC_URL', isProd),
  envFlag('VAULT_ENCRYPTION_KEY', isProd),
  envFlag('AUTH_PEPPER', isProd),
  envFlag('TRUST_PROXY', false),
];
