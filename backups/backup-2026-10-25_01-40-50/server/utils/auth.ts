import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { logger } from './logger.ts';

dotenv.config();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
const JWT_ACTIVE_KID = process.env.JWT_ACTIVE_KID?.trim() || 'k1';
const JWT_PRIVATE_KEYS_JSON = process.env.JWT_PRIVATE_KEYS_JSON?.trim();
const JWT_PUBLIC_KEYS_JSON = process.env.JWT_PUBLIC_KEYS_JSON?.trim();
const REQUIRE_ES256_IN_PRODUCTION =
  (process.env.REQUIRE_ES256_IN_PRODUCTION?.trim().toLowerCase() || 'false') === 'true';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'vault_refresh_token';
const REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth';
const REFRESH_COOKIE_DOMAIN = parseHostname(process.env.REFRESH_COOKIE_DOMAIN?.trim()) || undefined;
const REFRESH_COOKIE_SECURE =
  process.env.REFRESH_COOKIE_SECURE?.trim() === 'true'
    ? true
    : process.env.REFRESH_COOKIE_SECURE?.trim() === 'false'
      ? false
      : process.env.NODE_ENV === 'production';
const REFRESH_COOKIE_SAME_SITE = (process.env.REFRESH_COOKIE_SAME_SITE?.trim().toLowerCase() ||
  (IS_PRODUCTION ? 'strict' : 'lax')) as 'strict' | 'lax' | 'none';

const parseKeyRing = (raw: string | undefined): Record<string, string> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([keyId, key]) => Boolean(keyId && typeof key === 'string' && key.trim()))
        .map(([keyId, key]) => [keyId, key.replace(/\\n/g, '\n')]),
    );
  } catch {
    throw new Error('Invalid JSON in JWT key ring configuration.');
  }
};

const privateKeyRing = (() => {
  const fromJson = parseKeyRing(JWT_PRIVATE_KEYS_JSON);
  if (Object.keys(fromJson).length > 0) return fromJson;
  if (JWT_PRIVATE_KEY) return { [JWT_ACTIVE_KID]: JWT_PRIVATE_KEY };
  return {};
})();
const publicKeyRing = (() => {
  const fromJson = parseKeyRing(JWT_PUBLIC_KEYS_JSON);
  if (Object.keys(fromJson).length > 0) return fromJson;
  if (JWT_PUBLIC_KEY) return { [JWT_ACTIVE_KID]: JWT_PUBLIC_KEY };
  return {};
})();
const hasEs256Keys = Boolean(privateKeyRing[JWT_ACTIVE_KID]);
const ES256_ENABLED = hasEs256Keys && (!IS_PRODUCTION || REQUIRE_ES256_IN_PRODUCTION);

if (!JWT_SECRET && !hasEs256Keys) {
  throw new Error('JWT_SECRET must be configured.');
}
if (IS_PRODUCTION && REQUIRE_ES256_IN_PRODUCTION && !hasEs256Keys) {
  throw new Error(
    'ES256 key ring must be configured in production when REQUIRE_ES256_IN_PRODUCTION is enabled.',
  );
}
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET;
const REFRESH_TOKEN_PRIVATE_KEY =
  process.env.REFRESH_TOKEN_PRIVATE_KEY?.replace(/\\n/g, '\n') || JWT_PRIVATE_KEY;
const REFRESH_TOKEN_PUBLIC_KEY =
  process.env.REFRESH_TOKEN_PUBLIC_KEY?.replace(/\\n/g, '\n') || JWT_PUBLIC_KEY;
const refreshEs256Enabled =
  Boolean(REFRESH_TOKEN_PRIVATE_KEY) && (!IS_PRODUCTION || REQUIRE_ES256_IN_PRODUCTION);
const JWT_ALGORITHM: jwt.Algorithm = ES256_ENABLED ? 'ES256' : 'HS256';
const REFRESH_JWT_ALGORITHM: jwt.Algorithm = refreshEs256Enabled ? 'ES256' : 'HS256';
const jwtSigningKey = ES256_ENABLED ? privateKeyRing[JWT_ACTIVE_KID] : JWT_SECRET || '';
const jwtVerificationKey = ES256_ENABLED
  ? publicKeyRing[JWT_ACTIVE_KID] || JWT_SECRET || ''
  : JWT_SECRET || '';
const refreshSigningKey = refreshEs256Enabled
  ? REFRESH_TOKEN_PRIVATE_KEY || ''
  : REFRESH_TOKEN_SECRET || '';
const refreshVerificationKey = refreshEs256Enabled
  ? REFRESH_TOKEN_PUBLIC_KEY || ''
  : REFRESH_TOKEN_SECRET || '';
if (IS_PRODUCTION && REQUIRE_ES256_IN_PRODUCTION && !REFRESH_TOKEN_PRIVATE_KEY) {
  throw new Error(
    'REFRESH_TOKEN_PRIVATE_KEY must be configured in production when REQUIRE_ES256_IN_PRODUCTION is enabled.',
  );
}
if (ES256_ENABLED && !publicKeyRing[JWT_ACTIVE_KID]) {
  throw new Error('JWT_PUBLIC_KEY/JWT_PUBLIC_KEYS_JSON must include JWT_ACTIVE_KID.');
}
if (REFRESH_JWT_ALGORITHM === 'ES256' && !REFRESH_TOKEN_PUBLIC_KEY) {
  throw new Error('REFRESH_TOKEN_PUBLIC_KEY must be configured when using ES256 refresh tokens.');
}
if (IS_PRODUCTION && JWT_ALGORITHM === 'HS256' && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be at least 32 characters in production for HS256.');
}
if (
  IS_PRODUCTION &&
  REFRESH_JWT_ALGORITHM === 'HS256' &&
  (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET.length < 32)
) {
  throw new Error('REFRESH_TOKEN_SECRET must be at least 32 characters in production for HS256.');
}
if (!['strict', 'lax', 'none'].includes(REFRESH_COOKIE_SAME_SITE)) {
  throw new Error('REFRESH_COOKIE_SAME_SITE must be one of: strict, lax, none.');
}
if (REFRESH_COOKIE_SAME_SITE === 'none' && !REFRESH_COOKIE_SECURE && IS_PRODUCTION) {
  throw new Error(
    'REFRESH_COOKIE_SECURE must be true when REFRESH_COOKIE_SAME_SITE is none in production.',
  );
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  sessionId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  username: string;
  sessionId: string;
  deviceId: string;
  type: 'refresh';
}

export interface MfaTokenPayload {
  sub: string;
  username: string;
  type: 'mfa';
}

export const getTokenFingerprint = (token: string): string => {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
};

export const createAccessToken = (
  payload: Omit<AccessTokenPayload, 'type'>,
  expiresIn?: jwt.SignOptions['expiresIn'],
): string => {
  const signOptions: jwt.SignOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: (expiresIn !== undefined
      ? expiresIn
      : JWT_EXPIRES_IN) as jwt.SignOptions['expiresIn'],
  };
  if (JWT_ALGORITHM === 'ES256') {
    signOptions.keyid = JWT_ACTIVE_KID;
  }

  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      sessionId: payload.sessionId,
      type: 'access',
    },
    jwtSigningKey,
    signOptions,
  );
};

export const createRefreshToken = (payload: Omit<RefreshTokenPayload, 'type'>): string => {
  const signOptions: jwt.SignOptions = {
    algorithm: REFRESH_JWT_ALGORITHM,
    expiresIn: REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };
  if (REFRESH_JWT_ALGORITHM === 'ES256') {
    signOptions.keyid = JWT_ACTIVE_KID;
  }
  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      type: 'refresh',
    },
    refreshSigningKey,
    signOptions,
  );
};

export const createMfaToken = (payload: Omit<MfaTokenPayload, 'type'>): string => {
  const signOptions: jwt.SignOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: '5m',
  };
  if (JWT_ALGORITHM === 'ES256') {
    signOptions.keyid = JWT_ACTIVE_KID;
  }

  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      type: 'mfa',
    },
    jwtSigningKey,
    signOptions,
  );
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decodedHeader = jwt.decode(token, { complete: true }) as {
      header?: { kid?: string };
    } | null;
    const kid = decodedHeader?.header?.kid;
    const verificationKey =
      JWT_ALGORITHM === 'ES256'
        ? (() => {
            const resolvedKid = kid || JWT_ACTIVE_KID;
            const key = publicKeyRing[resolvedKid];
            if (!key) {
              throw new Error(`Unknown or missing JWT kid: ${resolvedKid}`);
            }
            return key;
          })()
        : jwtVerificationKey;
    const decoded = jwt.verify(token, verificationKey, {
      algorithms: [JWT_ALGORITHM],
    }) as any;

    if (
      typeof decoded !== 'object' ||
      decoded == null ||
      decoded.type !== 'access' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.sessionId !== 'string'
    ) {
      throw new Error('Invalid access token structure.');
    }

    return {
      sub: decoded.sub,
      username: typeof decoded.username === 'string' ? decoded.username : 'unknown',
      sessionId: decoded.sessionId,
      type: 'access',
    };
  } catch (error) {
    logger.error('JWT Verification Failed', {
      error: (error as Error).message,
      tokenFingerprint: getTokenFingerprint(token),
      keyAlgorithm: JWT_ALGORITHM,
    });
    throw error;
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const decodedHeader = jwt.decode(token, { complete: true }) as {
      header?: { kid?: string };
    } | null;
    const verificationKey =
      REFRESH_JWT_ALGORITHM === 'ES256' ? refreshVerificationKey : refreshVerificationKey;
    if (REFRESH_JWT_ALGORITHM === 'ES256' && decodedHeader?.header?.kid) {
      const kid = decodedHeader.header.kid;
      if (kid !== JWT_ACTIVE_KID) {
        throw new Error(`Unexpected refresh token kid: ${kid}`);
      }
    }

    const decoded = jwt.verify(token, verificationKey, {
      algorithms: [REFRESH_JWT_ALGORITHM],
    }) as jwt.JwtPayload | string;
    if (
      typeof decoded !== 'object' ||
      decoded == null ||
      decoded.type !== 'refresh' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.sessionId !== 'string' ||
      typeof decoded.deviceId !== 'string'
    ) {
      throw new Error('Invalid refresh token structure.');
    }

    return {
      sub: decoded.sub,
      username: typeof decoded.username === 'string' ? decoded.username : 'unknown',
      sessionId: decoded.sessionId,
      deviceId: decoded.deviceId,
      type: 'refresh',
    };
  } catch (error) {
    logger.error('Refresh Token Verification Failed', {
      error: (error as Error).message,
      tokenFingerprint: getTokenFingerprint(token),
      keyAlgorithm: REFRESH_JWT_ALGORITHM,
      hasRefreshSecret: Boolean(REFRESH_TOKEN_SECRET || REFRESH_TOKEN_PRIVATE_KEY),
    });
    throw error;
  }
};

export const verifyMfaToken = (token: string): MfaTokenPayload => {
  const decodedHeader = jwt.decode(token, { complete: true }) as {
    header?: { kid?: string };
  } | null;
  const kid = decodedHeader?.header?.kid;
  const verificationKey =
    JWT_ALGORITHM === 'ES256'
      ? (() => {
          const resolvedKid = kid || JWT_ACTIVE_KID;
          const key = publicKeyRing[resolvedKid];
          if (!key) {
            throw new Error(`Unknown or missing JWT kid: ${resolvedKid}`);
          }
          return key;
        })()
      : jwtVerificationKey;
  const decoded = jwt.verify(token, verificationKey, {
    algorithms: [JWT_ALGORITHM],
  }) as any;
  if (
    typeof decoded !== 'object' ||
    decoded == null ||
    decoded.type !== 'mfa' ||
    typeof decoded.sub !== 'string'
  ) {
    throw new Error('Invalid MFA token.');
  }

  return {
    sub: decoded.sub,
    username: typeof decoded.username === 'string' ? decoded.username : 'unknown',
    type: 'mfa',
  };
};

export const getRefreshCookieName = (): string => REFRESH_COOKIE_NAME;

const shouldUseDevelopmentCookiePolicy = (req?: express.Request): boolean => {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (!req) {
    return true;
  }

  const originHost = parseHostname(req.get('origin'));
  const hostHost = parseHostname(req.get('host'));

  return isLocalHostname(originHost) || isLocalHostname(hostHost);
};

export const getRefreshCookieOptions = (): express.CookieOptions => ({
  httpOnly: true,
  secure: REFRESH_COOKIE_SECURE,
  sameSite: REFRESH_COOKIE_SAME_SITE,
  path: REFRESH_COOKIE_PATH,
  ...(REFRESH_COOKIE_DOMAIN ? { domain: REFRESH_COOKIE_DOMAIN } : {}),
});

export const getRefreshCookieOptionsForRequest = (req?: express.Request): express.CookieOptions => {
  if (!shouldUseDevelopmentCookiePolicy(req)) {
    // Production/runtime cookie policy:
    // - keep env-configured defaults
    // - auto-upgrade to SameSite=None for cross-site HTTPS frontends (e.g. Vercel -> Render)
    //   because strict/lax cookies are not sent on cross-site XHR/fetch refresh calls.
    const base = getRefreshCookieOptions();
    const origin = req?.get('origin');
    const host = req?.get('host');
    const originHost = parseHostname(origin);
    const hostHost = parseHostname(host);
    const isCrossSiteRequest = Boolean(originHost && hostHost && originHost !== hostHost);
    const isHttps =
      req?.secure ||
      req?.protocol === 'https' ||
      req?.get('x-forwarded-proto')?.toLowerCase() === 'https' ||
      IS_PRODUCTION;

    if (isCrossSiteRequest) {
      return {
        ...base,
        sameSite: 'none',
        secure: true,
      };
    }

    return {
      ...base,
      secure: isHttps ? true : base.secure,
    };
  }

  return {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
};

export const getRefreshCookieMaxAgeMs = (): number => {
  const match = String(REFRESH_TOKEN_EXPIRES_IN)
    .trim()
    .match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 30 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60 * 1000
        : unit === 'h'
          ? 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

  return value * multiplier;
};

export const buildRefreshCookieOptions = (req?: express.Request): express.CookieOptions => ({
  ...getRefreshCookieOptionsForRequest(req),
  maxAge: getRefreshCookieMaxAgeMs(),
});

export const buildClearedRefreshCookieOptions = (req?: express.Request): express.CookieOptions => ({
  ...getRefreshCookieOptionsForRequest(req),
  maxAge: 0,
  expires: new Date(0),
});

export const readCookie = (req: express.Request, cookieName: string): string | null => {
  if ((req as any).cookies && typeof (req as any).cookies[cookieName] === 'string') {
    return (req as any).cookies[cookieName];
  }
  if ((req as any).signedCookies && typeof (req as any).signedCookies[cookieName] === 'string') {
    return (req as any).signedCookies[cookieName];
  }

  const rawHeader = req.get('cookie') || (req.headers as any)?.cookie;
  if (!rawHeader) {
    return null;
  }

  const cookieHeader = Array.isArray(rawHeader) ? rawHeader.join('; ') : String(rawHeader);
  const targetLower = cookieName.toLowerCase();

  const entry = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => {
      const eqIdx = item.indexOf('=');
      if (eqIdx === -1) return false;
      const key = item.slice(0, eqIdx).trim().toLowerCase();
      return (
        key === targetLower ||
        key === 'vault_refresh_token' ||
        key === 'refreshtoken' ||
        key === 'refresh_token'
      );
    });

  if (!entry) {
    return null;
  }

  const eqIdx = entry.indexOf('=');
  return decodeURIComponent(entry.slice(eqIdx + 1).trim());
};

function parseHostname(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname;
  } catch {
    try {
      return new URL(`http://${trimmed}`).hostname;
    } catch {
      const withoutBrackets = trimmed.replace(/^\[|\]$/g, '');
      if (withoutBrackets.includes(':')) {
        return withoutBrackets;
      }
      return withoutBrackets.split(':')[0] || null;
    }
  }
}

function isLocalHostname(hostname: string | null): boolean {
  const normalized = hostname?.replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}
