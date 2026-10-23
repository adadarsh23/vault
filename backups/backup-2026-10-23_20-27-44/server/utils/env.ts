import { logger } from './logger.ts';

const trimEnv = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const requiredInAllEnvironments = ['JWT_SECRET'];
const requiredInProduction = [
  'CLIENT_URL',
  'PUBLIC_URL',
  'VITE_APP_PUBLIC_URL',
  'RECAPTCHA_SECRET_KEY',
  'REFRESH_TOKEN_SECRET',
  'VAULT_ENCRYPTION_KEY',
  'AUTH_PEPPER',
  'CSRF_SECRET',
  'SIGNED_URL_SECRET',
];
const mongoKeys = ['MONGODB_URI', 'MONGODB_URL', 'MONGO_URI', 'MONGO_URL'];
const registrationLookupTemplateKeys = [
  'FREE_IP_API_URL_TEMPLATE',
  'IPWHOIS_URL_TEMPLATE',
  'IPINFO_IO_URL_TEMPLATE',
  'IPAPI_CO_URL_TEMPLATE',
  'IPGEOLOCATION_URL_TEMPLATE',
];

const isMongoOptionalMode = (): boolean => {
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const skipMongo = raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  return skipMongo;
};

export const validateRuntimeEnv = (): void => {
  const missingKeys: string[] = [];

  for (const key of requiredInAllEnvironments) {
    if (!trimEnv(process.env[key])) {
      missingKeys.push(key);
    }
  }

  if (!isMongoOptionalMode() && !mongoKeys.some((key) => trimEnv(process.env[key]))) {
    missingKeys.push('MONGODB_URI, MONGODB_URL, or MONGO_URI');
  }

  if (process.env.NODE_ENV === 'production') {
    if (isMongoOptionalMode()) {
      throw new Error(
        'SKIP_MONGO_CONNECT is not permitted in production. MongoDB must be configured and connected.',
      );
    }

    const isCaptchaBypass =
      process.env.SKIP_RECAPTCHA === 'true' ||
      process.env.SKIP_CAPTCHA === 'true' ||
      process.env.SKIP_RECAPTCHA_VERIFICATION === 'true';

    if (isCaptchaBypass) {
      throw new Error(
        'SKIP_CAPTCHA / SKIP_RECAPTCHA is not permitted in production. reCAPTCHA verification is strictly mandatory.',
      );
    }

    for (const key of requiredInProduction) {
      if (!trimEnv(process.env[key])) {
        missingKeys.push(key);
      }
    }

    if (!trimEnv(process.env.TRUST_PROXY)) {
      logger.warn(
        'TRUST_PROXY is not configured. Production defaults to 1 trusted proxy hop so rate limiting and audit IPs stay safer behind Render/Nginx.',
      );
    }

    if (trimEnv(process.env.TRUST_PROXY)?.toLowerCase() === 'true') {
      logger.warn(
        'TRUST_PROXY=true is overly permissive for IP-based rate limiting. Prefer TRUST_PROXY=1 unless you intentionally trust more than one proxy hop.',
      );
    }

    const refreshCookieSameSite = trimEnv(process.env.REFRESH_COOKIE_SAME_SITE)?.toLowerCase();
    if (refreshCookieSameSite && !['strict', 'lax', 'none'].includes(refreshCookieSameSite)) {
      logger.warn('REFRESH_COOKIE_SAME_SITE must be one of: strict, lax, none.');
    }

    if (
      refreshCookieSameSite === 'none' &&
      trimEnv(process.env.REFRESH_COOKIE_SECURE)?.toLowerCase() === 'false'
    ) {
      logger.warn(
        'REFRESH_COOKIE_SECURE should not be false when REFRESH_COOKIE_SAME_SITE=none, or browsers may reject the cookie.',
      );
    }

    const registrationProfileCaptureEnabled = trimEnv(
      process.env.REGISTRATION_PROFILE_CAPTURE_ENABLED,
    )?.toLowerCase();
    if (
      registrationProfileCaptureEnabled &&
      !['1', 'true', 'yes', 'on', '0', 'false', 'no', 'off'].includes(
        registrationProfileCaptureEnabled,
      )
    ) {
      logger.warn(
        'REGISTRATION_PROFILE_CAPTURE_ENABLED is set to an unrecognized value. Use true/false so signup metadata capture is deterministic.',
      );
    }

    for (const key of registrationLookupTemplateKeys) {
      const value = trimEnv(process.env[key]);
      if (value && !value.includes('{ip}') && key !== 'IPGEOLOCATION_URL_TEMPLATE') {
        logger.warn(
          `${key} should include the {ip} placeholder so IP-specific registration lookups resolve correctly.`,
        );
      }
    }

    if (
      trimEnv(process.env.IPGEOLOCATION_URL_TEMPLATE) &&
      !trimEnv(process.env.IPGEOLOCATION_URL_TEMPLATE)?.includes('{apiKey}')
    ) {
      logger.warn(
        'IPGEOLOCATION_URL_TEMPLATE should include the {apiKey} placeholder so the configured API key can be injected.',
      );
    }
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment configuration: ${missingKeys.join(', ')}`);
  }
};
