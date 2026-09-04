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

/**
 * Invalidate session cache for a user when sessions are revoked or changed
 */
export const clearSessionCacheForUser = (_userId?: string) => {
  // Direct database session verification is used for immediate revocation enforcement
};

const extractQueryAuthToken = (req: express.Request): string | undefined => {
  // Security Hardening: Only allow query auth tokens for dedicated media/stream routes
  const path = req.path || req.originalUrl || '';
  const isMediaStreamRoute =
    path.includes('/media/') ||
    path.includes('/stream/') ||
    path.includes('/session-stream') ||
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
  next: express.NextFunction,
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
  next: express.NextFunction,
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

    const userWithSession = await User.findOne(
      {
        _id: payload.sub,
        sessions: {
          $elemMatch: {
            sessionId: payload.sessionId,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
      },
      {
        _id: 1,
        username: 1,
        role: 1,
        lastActiveAt: 1,
        'meta.lastCredentialChangeAt': 1,
        sessions: {
          $elemMatch: {
            sessionId: payload.sessionId,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
      },
    )
      .lean()
      .exec();

    if (!userWithSession) {
      logger.warn('[Auth] User or active session not found during session check', {
        userId: payload.sub,
        sessionId: payload.sessionId,
      });
      throw AppError.unauthorized(
        'This session has been revoked or expired. Please sign in again.',
        'SESSION_REVOKED',
      );
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
        'SESSION_REVOKED',
      );
    }

    // Immediate token invalidation check if password/credentials changed after token issuance
    if (
      (userWithSession as any).meta?.lastCredentialChangeAt &&
      (payload as any).iat &&
      (payload as any).iat * 1000 <
        new Date((userWithSession as any).meta.lastCredentialChangeAt).getTime()
    ) {
      throw AppError.unauthorized(
        'Credentials have been updated. Please sign in again.',
        'SESSION_REVOKED',
      );
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

/**
 * Enforces server-verified administrator privileges for protected admin operations.
 * Never trusts client headers or client state for authorization.
 */
export const requireAdmin = async (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const authUser = (req as AuthenticatedRequest).user;
    if (!authUser?.userId) {
      throw AppError.unauthorized('Authentication required.', 'UNAUTHORIZED');
    }

    const user = await User.findById(authUser.userId).select('+role username').lean().exec();
    const adminUsernames = (process.env.ADMIN_USERNAMES || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const adminUserIds = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const isRoleAdmin = (user as any)?.role === 'admin';
    const isUsernameAdmin = user?.username && adminUsernames.includes(user.username.toLowerCase());
    const isIdAdmin = adminUserIds.includes(authUser.userId);

    if (!isRoleAdmin && !isUsernameAdmin && !isIdAdmin) {
      throw new AppError(403, 'FORBIDDEN_ADMIN_ONLY', 'Administrator privileges required.');
    }

    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError(403, 'FORBIDDEN_ADMIN_ONLY', 'Administrator privileges required.'));
  }
};
