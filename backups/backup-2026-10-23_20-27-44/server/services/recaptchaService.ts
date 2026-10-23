import { AppError } from '../utils/appError.ts';
import { getAllowedCorsOrigins } from '../utils/cors.ts';
import { logger } from '../utils/logger.ts';

const RECAPTCHA_SITEVERIFY_URLS = [
  'https://www.google.com/recaptcha/api/siteverify',
  'https://www.recaptcha.net/recaptcha/api/siteverify',
];
const RECAPTCHA_REQUEST_TIMEOUT_MS = 6000;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 4096;

type GoogleSiteVerifyResponse = {
  success?: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

export interface RecaptchaVerificationResult {
  success: boolean;
  hostname: string | null;
  challengeTs: string | null;
  action: string | null;
  errorCodes: string[];
}

const readBooleanEnv = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const resolveRecaptchaSecret = (): string => {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    logger.error('[SECURITY] RECAPTCHA_SECRET_KEY is not configured.');
    throw AppError.internal(
      'Security verification is temporarily unavailable.',
      'CAPTCHA_CONFIG_MISSING',
    );
  }
  return secret;
};

const toHostnames = (origins: string[]): Set<string> => {
  const hosts = new Set<string>();
  const allowLocalHosts =
    process.env.NODE_ENV !== 'production' || readBooleanEnv(process.env.ALLOW_LOCAL_CORS_ORIGINS);
  const allowRecaptchaTestHost =
    process.env.NODE_ENV !== 'production' || readBooleanEnv(process.env.ALLOW_RECAPTCHA_TEST_HOST);

  if (allowLocalHosts) {
    hosts.add('localhost');
    hosts.add('127.0.0.1');
    hosts.add('::1');
  }

  if (allowRecaptchaTestHost) {
    hosts.add('testkey.google.com');
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname) {
        hosts.add(parsed.hostname.toLowerCase());
      }
    } catch {
      // Ignore invalid URLs.
    }
  }

  return hosts;
};

export const isAllowedCaptchaHostname = (hostname: string | null): boolean => {
  if (!hostname) {
    return false;
  }

  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const allowedCaptchaHostnames = toHostnames(getAllowedCorsOrigins());
  return allowedCaptchaHostnames.has(normalized);
};

export const readRecaptchaTokenFromBody = (rawValue: unknown): string => {
  if (typeof rawValue !== 'string') {
    throw AppError.badRequest(
      'CAPTCHA token is missing. Please complete the challenge.',
      'CAPTCHA_TOKEN_MISSING',
    );
  }

  const token = rawValue.trim();

  if (!token) {
    throw AppError.badRequest(
      'CAPTCHA token is missing. Please complete the challenge.',
      'CAPTCHA_TOKEN_MISSING',
    );
  }

  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    throw AppError.badRequest(
      'CAPTCHA token is malformed. Please try again.',
      'CAPTCHA_TOKEN_INVALID',
    );
  }

  return token;
};

export const verifyRecaptchaToken = async (input: {
  token: string;
  remoteIp?: string | null;
}): Promise<RecaptchaVerificationResult> => {
  const isNonProduction = process.env.NODE_ENV !== 'production';
  const shouldSkipCaptcha =
    isNonProduction &&
    (process.env.SKIP_RECAPTCHA === 'true' ||
      process.env.SKIP_CAPTCHA === 'true' ||
      readBooleanEnv(process.env.SKIP_RECAPTCHA_VERIFICATION));

  if (shouldSkipCaptcha) {
    logger.info(
      '[SECURITY] reCAPTCHA verification skipped via environment config (non-production only).',
    );
    return {
      success: true,
      hostname: 'localhost',
      challengeTs: new Date().toISOString(),
      action: null,
      errorCodes: [],
    };
  }

  const secret = resolveRecaptchaSecret();
  const requestBody = new URLSearchParams({
    secret,
    response: input.token,
  });

  if (input.remoteIp && input.remoteIp !== 'unknown') {
    requestBody.set('remoteip', input.remoteIp);
  }

  for (const siteVerifyUrl of RECAPTCHA_SITEVERIFY_URLS) {
    let response: Response;
    try {
      response = await fetch(siteVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody.toString(),
        signal: AbortSignal.timeout(RECAPTCHA_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      logger.warn('[SECURITY] reCAPTCHA verification request failed.', {
        endpoint: siteVerifyUrl,
        error,
      });
      continue;
    }

    if (!response.ok) {
      logger.warn('[SECURITY] reCAPTCHA siteverify returned a non-2xx response.', {
        endpoint: siteVerifyUrl,
        status: response.status,
        statusText: response.statusText,
      });
      continue;
    }

    let payload: GoogleSiteVerifyResponse;
    try {
      payload = (await response.json()) as GoogleSiteVerifyResponse;
    } catch (error) {
      logger.warn('[SECURITY] Failed to parse reCAPTCHA siteverify response.', {
        endpoint: siteVerifyUrl,
        error,
      });
      continue;
    }

    return {
      success: payload.success === true,
      hostname: typeof payload.hostname === 'string' ? payload.hostname : null,
      challengeTs: typeof payload.challenge_ts === 'string' ? payload.challenge_ts : null,
      action: typeof payload.action === 'string' ? payload.action : null,
      errorCodes: Array.isArray(payload['error-codes']) ? payload['error-codes'] : [],
    };
  }

  // Fallback for development environments where google.com / recaptcha.net siteverify requests time out locally
  const isDevEnvironment =
    process.env.NODE_ENV !== 'production' || readBooleanEnv(process.env.ALLOW_LOCAL_CORS_ORIGINS);

  if (isDevEnvironment && input.token && input.token.length >= MIN_TOKEN_LENGTH) {
    logger.warn(
      '[SECURITY] reCAPTCHA siteverify endpoints unreachable in local dev environment; allowing local verification fallback.',
    );
    return {
      success: true,
      hostname: 'localhost',
      challengeTs: new Date().toISOString(),
      action: null,
      errorCodes: [],
    };
  }

  throw new AppError(
    503,
    'CAPTCHA_VERIFY_UNAVAILABLE',
    'Security verification is temporarily unavailable. Please try again.',
  );
};
