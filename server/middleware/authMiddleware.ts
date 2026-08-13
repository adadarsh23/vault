import express from 'express';
import { getTokenFingerprint, readCookie, verifyAccessToken } from '../utils/auth.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { User } from '../models/user.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

const MAX_AUTH_TOKEN_LENGTH = (() => {
  const parsed = Number.parseInt(process.env.MAX_AUTH_TOKEN_LENGTH || '8192', 10);
  return Number.isFinite(parsed) && parsed >= 512 ? parsed : 8192;
})();

const looksLikeJwt = (candidate: string): boolean => {
  const token = candidate.trim();
  if (!token || token.length > MAX_AUTH_TOKEN_LENGTH) {
    return false;
  }

  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

const decodeQueryParamSafely = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const hasMalformedAuthTokenQuery = (req: express.Request): boolean => {
  const match = req.url.match(/[?&]auth_token=([^&]*)/);
  return Boolean(match && decodeQueryParamSafely(match[1]) === null);
};

interface CachedSession {
  userWithSession: any;
  cachedAt: number;
}

const SESSION_CACHE_TTL_MS = 60 * 1000; // 1-minute in-memory cache TTL for session verification
const MAX_SESSION_CACHE_ENTRIES = 5000;
const sessionCache = new Map<string, CachedSession>();

const setBoundedSessionCache = (key: string, value: CachedSession) => {
  if (sessionCache.size >= MAX_SESSION_CACHE_ENTRIES && !sessionCache.has(key)) {
    const oldestKey = sessionCache.keys().next().value;
    if (oldestKey) {
      sessionCache.delete(oldestKey);
    }
  }
  sessionCache.set(key, value);
};

/**
 * Invalidate session cache for a user when sessions are revoked or changed
 */
export const clearSessionCacheForUser = (userId?: string) => {
  if (!userId) {
    sessionCache.clear();
    return;
  }
  for (const key of sessionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      sessionCache.delete(key);
    }
  }
};

const extractQueryAuthToken = (req: express.Request): string | undefined => {
  // Security Hardening: Only allow query auth tokens for dedicated media/stream routes
  const path = req.path || req.originalUrl || '';
  const isMediaStreamRoute =
    path.includes('/media/') ||
    path.includes('/stream/') ||
    path.includes('/hls/') ||
    path.includes('/files/access/') ||
    path.includes('/files/signed-url/') ||
    path.includes('/files/') ||
    path.includes('/avatar/');
  const allowQueryTokens = process.env.ALLOW_QUERY_AUTH_TOKENS === 'true' || isMediaStreamRoute;

  if (!allowQueryTokens) {
    return undefined;
  }

  if (typeof req.query.auth_token === 'string') {
    return req.query.auth_token.trim();
  }

  // Manual URL parsing fallback for strict media environments
  const match = req.url.match(/[?&]auth_token=([^&]+)/);
  if (!match) {
    return undefined;
  }

  const decoded = decodeQueryParamSafely(match[1]);
  if (!decoded) {
    logger.warn('[Auth] Failed to decode auth_token query parameter.', {
      path: req.originalUrl,
    });
    return undefined;
  }

  return decoded.trim();
};

/**
 * Middleware to require authentication for routes.
 * Verifies JWT access token and checks session validity in database.
 */
/**
 * Optional identification middleware - populates req.user if a token is present
 * but DOES NOT throw an error if it's missing or invalid.
 */
export const resolveIdentity = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.get('Authorization')?.split(' ')[1];
  const token = authHeader || extractQueryAuthToken(req);

  if (token && typeof token === 'string' && token.includes('.')) {
    try {
      const payload = verifyAccessToken(token);
      (req as any).user = {
        userId: payload.sub,
        username: payload.username,
        sessionId: payload.sessionId,
      };
    } catch (e) {
      // Quietly ignore parsing errors for optional resolution
    }
  }
  next();
};

export const requireAuth = async (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.get('authorization');
  let token: string | undefined;

  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]) {
      token = bearerMatch[1].trim();
    }
  }

  // Fallback to query param if header is missing (e.g. for media tags)
  if (!token) {
    token = extractQueryAuthToken(req);
  }

  // Fallback: accept bearer token from cookie for integrations that attach it as a cookie.
  // Primary flow still uses Authorization header + refresh-cookie rotation.
  if (!token) {
    const cookieToken = readCookie(req, 'vault_access_token');
    if (cookieToken && looksLikeJwt(cookieToken)) {
      token = cookieToken.trim();
    }
  }

  if (!token) {
    // Express may omit a malformed query value while parsing the URL.  Preserve
    // the distinction between no credentials and an invalid credential.
    if (hasMalformedAuthTokenQuery(req)) {
      throw AppError.unauthorized('Authentication token is invalid.', 'INVALID_TOKEN');
    }
    throw AppError.unauthorized('Authentication token is required.', 'AUTH_REQUIRED');
  }
  if (!looksLikeJwt(token)) {
    throw AppError.unauthorized('Authentication token is invalid.', 'INVALID_TOKEN');
  }

  try {
    const payload = verifyAccessToken(token);
    const clientIp = getClientIp(req);

    // Security Intelligence: Track IP drift for this user
    anomalyDetectionService.trackIpDrift(payload.sub, clientIp);

    const cacheKey = `${payload.sub}:${payload.sessionId}`;
    const nowTs = Date.now();
    let userWithSession: any;

    const cached = sessionCache.get(cacheKey);
    if (cached && nowTs - cached.cachedAt < SESSION_CACHE_TTL_MS) {
      userWithSession = cached.userWithSession;
    } else {
      userWithSession = await User.findById(payload.sub, {
        _id: 1,
        username: 1,
        lastActiveAt: 1,
        sessions: {
          $elemMatch: {
            sessionId: payload.sessionId,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
      }).exec();

      if (userWithSession) {
        setBoundedSessionCache(cacheKey, { userWithSession, cachedAt: nowTs });
      }
    }

    if (!userWithSession) {
      logger.warn('[Auth] User not found during session check', { userId: payload.sub });
      throw AppError.unauthorized('User not found.', 'USER_NOT_FOUND');
    }

    const activeSession = Array.isArray((userWithSession as any).sessions)
      ? (userWithSession as any).sessions[0]
      : null;
    if (!activeSession) {
      logger.warn('[Auth] Session invalid or revoked', {
        userId: payload.sub,
        sessionId: payload.sessionId,
      });
      throw AppError.unauthorized(
        'This session has been revoked or expired. Please sign in again.',
        'SESSION_REVOKED'
      );
    }

    // Auto-update user activity
    let isModified = false;

    const now = new Date();
    const lastActive = userWithSession.lastActiveAt;
    if (!lastActive || now.getTime() - lastActive.getTime() > 60 * 1000) {
      // update at most once per minute
      userWithSession.lastActiveAt = now;
      isModified = true;
    }

    if (isModified) {
      // Use direct update/save to persist the activity
      await userWithSession.save().catch((err: any) => {
        logger.error('[Auth] Failed to save updated user activity', {
          userId: payload.sub,
          error: err.message,
        });
      });
    }

    (req as AuthenticatedRequest).user = {
      userId: payload.sub,
      username:
        typeof (userWithSession as any).username === 'string'
          ? (userWithSession as any).username
          : payload.username,
      sessionId: payload.sessionId,
    };

    return next();
  } catch (error) {
    // Security Intelligence: Track failed verification attempts for brute-force detection
    anomalyDetectionService.trackAuthFailure(getClientIp(req));

    if (error instanceof AppError) throw error;

    const name = error instanceof Error ? error.name : 'UnknownError';
    const message =
      name === 'TokenExpiredError'
        ? 'Authentication token expired. Please sign in again.'
        : 'Authentication token is invalid.';
    const code = name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';

    logger.error('[Auth] requireAuth failed', {
      name,
      message,
      tokenFingerprint: getTokenFingerprint(token),
    });
    throw AppError.unauthorized(message, code);
  }
};
