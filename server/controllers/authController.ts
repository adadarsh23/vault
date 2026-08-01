import express from 'express';
import { User } from '../models/user.ts';
import crypto from 'node:crypto';
import { authenticateUser } from '../services/authService.ts'; // Updated path
import {
  changeAuthenticatedPassword,
  getAuthenticatedUserProfile,
  refreshAuthenticatedSession,
  revokeAuthenticatedSessions,
  revokeCurrentSession,
  renameDeviceSession,
  updateAuthenticatedUserProfile,
} from '../services/accountSessionService.ts';
import { getExactUsernameMatch, registerUser } from '../services/vaultService.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import {
  buildClearedRefreshCookieOptions,
  buildRefreshCookieOptions,
  getTokenFingerprint,
  getRefreshCookieName,
  readCookie,
} from '../utils/auth.ts';
import { AppError } from '../utils/appError.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { sendSuccess } from '../responses.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { logger } from '../utils/logger.ts';

const REFRESH_COOKIE_NAME = getRefreshCookieName();

const applyRefreshCookie = (req: express.Request, res: express.Response, refreshToken: string) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildRefreshCookieOptions(req));
};

const clearRefreshCookie = (req: express.Request, res: express.Response) => {
  res.cookie(REFRESH_COOKIE_NAME, '', buildClearedRefreshCookieOptions(req));
};

const REFRESH_FAILURE_CODE = 'SESSION_REFRESH_FAILED';
const REFRESH_FAILURE_MESSAGE = 'Session could not be refreshed. Please sign in again.';
const DB_FAILURE_CODE = 'DB_UNAVAILABLE';
const DB_FAILURE_MESSAGE =
  'Vault storage is temporarily unavailable. Please try again in a moment.';

const isMongoConnectivityFailure = (error: unknown): boolean => {
  const candidate = error as { name?: string; message?: string; code?: string };
  const message = String(candidate?.message || '').toLowerCase();
  return (
    candidate?.name === 'MongooseServerSelectionError' ||
    candidate?.name === 'MongoServerSelectionError' ||
    message.includes('server selection') ||
    message.includes('secureconnect') ||
    message.includes('timed out') ||
    message.includes('connecttimeoutms')
  );
};

const toOperationalAuthError = (error: unknown): unknown => {
  if (error instanceof AppError) {
    return error;
  }

  if (isMongoConnectivityFailure(error)) {
    return new AppError(503, DB_FAILURE_CODE, DB_FAILURE_MESSAGE);
  }

  return error;
};

const toPublicAuthPayload = <
  T extends {
    refreshToken?: string;
    token: string;
    sessionId?: string;
    created?: boolean;
    user: unknown;
    message?: string;
  },
>(
  result: T
) => {
  const { refreshToken: _refreshToken, ...publicResult } = result;
  return publicResult;
};

const getWebsiteMetadata = (req: express.Request) => ({
  origin: req.get('origin') || null,
  referer: req.get('referer') || null,
  host: req.get('host') || null,
  forwardedHost: req.get('x-forwarded-host') || null,
  protocol: req.get('x-forwarded-proto') || req.protocol || null,
  method: req.method,
  path: req.originalUrl,
  acceptLanguage: req.get('accept-language') || null,
  secFetchSite: req.get('sec-fetch-site') || null,
  secFetchMode: req.get('sec-fetch-mode') || null,
  secFetchDest: req.get('sec-fetch-dest') || null,
  secChUa: req.get('sec-ch-ua') || null,
  secChUaMobile: req.get('sec-ch-ua-mobile') || null,
  secChUaPlatform: req.get('sec-ch-ua-platform') || null,
});

export const register = async (req: express.Request, res: express.Response) => {
  if (!req.body?.username || !req.body?.password) {
    throw AppError.badRequest('Username and password are required.', 'AUTH_MISSING_CREDENTIALS');
  }

  if (typeof req.body.password !== 'string' || req.body.password.length < 16) {
    throw AppError.badRequest('Password must be at least 16 characters.', 'AUTH_WEAK_PASSWORD');
  }

  if (typeof req.body?.masterKey !== 'string' || req.body.masterKey.trim().length === 0) {
    throw AppError.badRequest('Master Key is required.', 'INVALID_MASTER_KEY');
  }
  const masterKey = req.body.masterKey.trim();

  try {
    const result = await registerUser({
      username: req.body.username,
      password: req.body.password,
      masterKey: masterKey,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      deviceId: req.body.deviceId,
      websiteMetadata: getWebsiteMetadata(req),
    });

    applyRefreshCookie(req, res, result.refreshToken);
    const statusCode = result.created === false ? 200 : 201;
    return sendSuccess(
      res,
      toPublicAuthPayload(result),
      result.created === false ? 'Logged in successfully' : 'Registered successfully',
      statusCode
    );
  } catch (error) {
    throw toOperationalAuthError(error);
  }
};

export const login = async (req: express.Request, res: express.Response) => {
  if (!req.body?.username || !req.body?.password) {
    throw AppError.badRequest('Username and password are required.', 'AUTH_MISSING_CREDENTIALS');
  }

  if (typeof req.body.password !== 'string' || req.body.password.length < 16) {
    throw AppError.badRequest('Password must be at least 16 characters.', 'AUTH_WEAK_PASSWORD');
  }

  try {
    const result = await authenticateUser({
      username: req.body.username,
      password: req.body.password,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      deviceId: req.body.deviceId,
    });

    if ('twoFactorRequired' in result && result.twoFactorRequired) {
      return sendSuccess(res, result, '2FA required', 200);
    }

    applyRefreshCookie(req, res, (result as any).refreshToken);
    return sendSuccess(res, toPublicAuthPayload(result as any), 'Logged in successfully');
  } catch (error) {
    // Security Intelligence: Track login failure for brute-force detection
    anomalyDetectionService.trackAuthFailure(getClientIp(req), req.body.username);
    throw toOperationalAuthError(error);
  }
};

export const checkUsername = async (req: express.Request, res: express.Response) => {
  const username =
    typeof req.query?.username === 'string' ? req.query.username : req.body?.username;

  if (!username) {
    throw AppError.badRequest('Username is required.', 'INVALID_USERNAME');
  }

  const result = await getExactUsernameMatch({ username });
  return sendSuccess(res, result, 'Username check completed');
};

export const getSalt = async (req: express.Request, res: express.Response) => {
  const username =
    typeof req.query?.username === 'string' ? req.query.username.trim().toLowerCase() : '';

  if (!username) {
    throw AppError.badRequest('Username is required.', 'INVALID_USERNAME');
  }

  const user = await User.findOne({ username }).select('pqcSalt').lean().exec();
  if (user) {
    const salt = user.pqcSalt || `${username}-vault-pqc-salt`;
    return sendSuccess(res, { salt }, 'Salt retrieved successfully');
  } else {
    // Deterministic dummy salt derivation to prevent timing analysis & username enumeration
    const hmacSecret = process.env.JWT_SECRET || 'dummy-secret-key-salt-derivation-fallback';
    const dummySalt = crypto.createHmac('sha256', hmacSecret).update(username).digest('hex');
    return sendSuccess(res, { salt: dummySalt }, 'Salt retrieved successfully');
  }
};

export const getMe = async (req: AuthenticatedRequest, res: express.Response) => {
  const profile = await getAuthenticatedUserProfile(req.user.userId, req.user.sessionId);
  return sendSuccess(res, profile, 'User profile fetched successfully');
};

export const refreshSession = async (req: express.Request, res: express.Response) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
  if (!refreshToken) {
    clearRefreshCookie(req, res);
    throw new AppError(401, REFRESH_FAILURE_CODE, REFRESH_FAILURE_MESSAGE);
  }

  try {
    const result = await refreshAuthenticatedSession({
      refreshToken,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
    });

    applyRefreshCookie(req, res, result.refreshToken);
    return sendSuccess(res, toPublicAuthPayload(result), 'Session refreshed successfully');
  } catch (error) {
    // Security Intelligence: Track session refresh failure
    anomalyDetectionService.trackAuthFailure(getClientIp(req));

    // Log JWT verification errors
    if (error instanceof Error) {
      if (error.message.includes('invalid signature')) {
        logger.warn('JWT signature verification failed during session refresh', {
          path: req.path,
          ip: getClientIp(req),
          error: error.message,
          tokenFingerprint: getTokenFingerprint(refreshToken),
        });
      } else if (error.message.includes('jwt expired')) {
        logger.info('Refresh token expired', {
          path: req.path,
          ip: getClientIp(req),
        });
      }
    }

    if (error instanceof AppError && error.statusCode === 401) {
      clearRefreshCookie(req, res);
      throw new AppError(401, REFRESH_FAILURE_CODE, REFRESH_FAILURE_MESSAGE);
    }
    throw error;
  }
};

export const logout = async (req: express.Request, res: express.Response) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
  if (refreshToken) {
    await revokeCurrentSession(refreshToken).catch((error) => {
      logger.warn('Failed to revoke current session during logout.', {
        path: req.path,
        ip: getClientIp(req),
        error,
      });
    });
  }

  clearRefreshCookie(req, res);
  // Hint browsers to clear cached auth-bound storage on explicit logout.
  // Safe because this endpoint is an explicit user-triggered sign-out action.
  res.setHeader('Clear-Site-Data', '"storage"');
  return sendSuccess(res, { loggedOut: true }, 'Logged out successfully');
};

export const revokeSessions = async (req: AuthenticatedRequest, res: express.Response) => {
  const revokeCurrent = req.body?.revokeCurrent === true;
  const result = await revokeAuthenticatedSessions({
    userId: req.user.userId,
    currentSessionId: req.user.sessionId,
    targetSessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
    targetDeviceId: typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined,
    revokeAllOther: req.body?.revokeAllOther === true,
    revokeCurrent,
    ipAddress: getClientIp(req),
  });

  if (revokeCurrent) {
    clearRefreshCookie(req, res);
  }

  return sendSuccess(res, result, 'Sessions revoked successfully');
};

export const changePassword = async (req: AuthenticatedRequest, res: express.Response) => {
  const result = await changeAuthenticatedPassword({
    userId: req.user.userId,
    currentPassword: req.body?.currentPassword,
    newPassword: req.body?.newPassword,
    ipAddress: getClientIp(req),
  });
  return sendSuccess(res, result, 'Password changed successfully');
};

export const updateDeviceName = async (req: AuthenticatedRequest, res: express.Response) => {
  if (typeof req.body?.deviceId !== 'string' || typeof req.body?.deviceName !== 'string') {
    throw AppError.badRequest('deviceId and deviceName are required.', 'INVALID_INPUT');
  }

  const result = await renameDeviceSession(req.user.userId, req.body.deviceId, req.body.deviceName);
  return sendSuccess(res, result, 'Device name updated successfully');
};

export const updateProfile = async (req: AuthenticatedRequest, res: express.Response) => {
  const result = await updateAuthenticatedUserProfile({
    userId: req.user.userId,
    profileName: req.body?.profileName,
    profilePhoto: req.body?.profilePhoto,
  });
  return sendSuccess(res, result, 'Profile updated successfully');
};
