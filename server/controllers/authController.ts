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
  createAccessToken,
  createRefreshToken,
  getTokenFingerprint,
  getRefreshCookieName,
  readCookie,
} from '../utils/auth.ts';
import { AppError } from '../utils/appError.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { sendSuccess } from '../responses.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { logger } from '../utils/logger.ts';

const isTestRuntime = (): boolean => {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return true;
  }

  return process.argv.some((arg) => arg.includes('vitest'));
};

const isMongoOptionalMode = (): boolean => {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const skipMongo = raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  return skipMongo && !isTestRuntime();
};

const REFRESH_COOKIE_NAME = getRefreshCookieName();

export const applyRefreshCookie = (
  req: express.Request,
  res: express.Response,
  refreshToken: string
) => {
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
  const identifier = req.body?.email || req.body?.username;
  if (!identifier || !req.body?.password) {
    throw AppError.badRequest(
      'Username or email and password are required.',
      'AUTH_MISSING_CREDENTIALS'
    );
  }

  if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
    throw AppError.badRequest('Password must be at least 8 characters.', 'AUTH_WEAK_PASSWORD');
  }

  if (isMongoOptionalMode()) {
    const username = (req.body?.username || identifier.split('@')[0]).trim().toLowerCase();
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      username,
      email: req.body?.email || (identifier.includes('@') ? identifier : `${username}@example.com`),
    };
    const sessionId = 'mock-e2e-session-id';
    const accessToken = createAccessToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
    });
    const refreshToken = createRefreshToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
      deviceId: req.body?.deviceId || 'mock-device-id',
    });
    applyRefreshCookie(req, res, refreshToken);
    return res.status(201).json({
      success: true,
      message: 'Registered successfully',
      token: accessToken,
      accessToken,
      sessionId,
      user: mockUser,
      data: {
        token: accessToken,
        accessToken,
        sessionId,
        user: mockUser,
      },
    });
  }

  if (typeof req.body?.masterKey !== 'string' || !req.body.masterKey.trim()) {
    throw AppError.badRequest(
      'Master key is required for registration.',
      'AUTH_MISSING_MASTER_KEY'
    );
  }
  const masterKey = req.body.masterKey.trim();

  if (req.body.password && masterKey && req.body.password === masterKey) {
    throw AppError.badRequest(
      'Account password and master key must not be identical.',
      'AUTH_SAME_CREDENTIALS'
    );
  }

  try {
    const result = await registerUser({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName || req.body.profileName,
      masterKey,
      pqcSalt: req.body.pqcSalt,
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent'),
      deviceId: req.body.deviceId,
      websiteMetadata: getWebsiteMetadata(req),
    });

    applyRefreshCookie(req, res, result.refreshToken);
    const statusCode = result.created === false ? 200 : 201;

    const publicPayload = toPublicAuthPayload(result);
    return res.status(statusCode).json({
      success: true,
      message: result.created === false ? 'Logged in successfully' : 'Registered successfully',
      token: result.token,
      accessToken: result.token,
      sessionId: result.sessionId,
      user: result.user,
      data: {
        ...publicPayload,
        token: result.token,
        accessToken: result.token,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError && error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
        message: 'Email already registered',
      });
    }
    throw toOperationalAuthError(error);
  }
};

export const login = async (req: express.Request, res: express.Response) => {
  const identifier = req.body?.username || req.body?.email;
  if (!identifier || !req.body?.password) {
    throw AppError.badRequest(
      'Username or email and password are required.',
      'AUTH_MISSING_CREDENTIALS'
    );
  }

  if (isMongoOptionalMode()) {
    const username = identifier.trim().toLowerCase();
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      username,
      email: username.includes('@') ? username : `${username}@example.com`,
    };
    const sessionId = 'mock-e2e-session-id';
    const accessToken = createAccessToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
    });
    const refreshToken = createRefreshToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
      deviceId: req.body?.deviceId || 'mock-device-id',
    });
    applyRefreshCookie(req, res, refreshToken);
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token: accessToken,
      accessToken,
      sessionId,
      user: mockUser,
      data: {
        token: accessToken,
        accessToken,
        sessionId,
        user: mockUser,
      },
    });
  }

  try {
    let result: any;
    try {
      result = await authenticateUser({
        username: identifier,
        password: req.body.password,
        masterKey: req.body.masterKey,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent'),
        deviceId: req.body.deviceId,
      });
    } catch (authError: any) {
      const rawMasterKey = typeof req.body?.masterKey === 'string' ? req.body.masterKey.trim() : '';
      if (
        authError instanceof AppError &&
        authError.statusCode === 401 &&
        authError.code === 'INVALID_CREDENTIALS' &&
        rawMasterKey &&
        rawMasterKey !== req.body.password &&
        rawMasterKey.length >= 16
      ) {
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const userExists = await User.findOne({
          $or: [
            { username: identifier },
            { email: identifier },
            { username: new RegExp(`^${escaped}$`, 'i') },
            { email: new RegExp(`^${escaped}$`, 'i') },
          ],
        })
          .select('_id')
          .lean()
          .exec();

        if (!userExists) {
          logger.info('[Auth] User does not exist, onboarding account on first unlock', {
            username: identifier,
          });
          result = await registerUser({
            username: req.body.username || identifier,
            email: req.body.email,
            password: req.body.password,
            fullName: req.body.fullName || req.body.profileName,
            masterKey: rawMasterKey,
            pqcSalt: req.body.pqcSalt,
            ipAddress: getClientIp(req),
            userAgent: req.get('user-agent'),
            deviceId: req.body.deviceId,
            websiteMetadata: getWebsiteMetadata(req),
          });
        } else {
          throw authError;
        }
      } else {
        throw authError;
      }
    }

    if ('twoFactorRequired' in result && result.twoFactorRequired) {
      return sendSuccess(res, result, '2FA required', 200);
    }

    applyRefreshCookie(req, res, (result as any).refreshToken);
    const publicPayload = toPublicAuthPayload(result as any);
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token: (result as any).token,
      accessToken: (result as any).token,
      sessionId: (result as any).sessionId,
      user: (result as any).user,
      data: {
        ...publicPayload,
        token: (result as any).token,
        accessToken: (result as any).token,
      },
    });
  } catch (error) {
    anomalyDetectionService.trackAuthFailure(getClientIp(req), identifier);
    throw toOperationalAuthError(error);
  }
};

export const checkUsername = async (req: express.Request, res: express.Response) => {
  const username =
    typeof req.query?.username === 'string' ? req.query.username : req.body?.username;

  if (!username) {
    throw AppError.badRequest('Username is required.', 'INVALID_USERNAME');
  }

  if (isMongoOptionalMode()) {
    return sendSuccess(res, { exists: false, exactMatch: false }, 'Username check completed');
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

  if (isMongoOptionalMode()) {
    return sendSuccess(res, { salt: `${username}-vault-pqc-salt` }, 'Salt retrieved successfully');
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
  if (isMongoOptionalMode()) {
    const username = req.user?.username || 'demo-user';
    return sendSuccess(
      res,
      {
        id: req.user?.userId || '507f1f77bcf86cd799439011',
        username,
        email: `${username}@example.com`,
        profileName: username,
      },
      'User profile fetched successfully'
    );
  }

  const profile = await getAuthenticatedUserProfile(req.user.userId, req.user.sessionId);
  return sendSuccess(res, profile, 'User profile fetched successfully');
};

export const refreshSession = async (req: express.Request, res: express.Response) => {
  if (isMongoOptionalMode()) {
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      username: 'demo-user',
      email: 'demo-user@example.com',
    };
    const sessionId = 'mock-e2e-session-id';
    const accessToken = createAccessToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
    });
    const refreshToken = createRefreshToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
      deviceId: 'mock-device-id',
    });
    applyRefreshCookie(req, res, refreshToken);
    return sendSuccess(
      res,
      {
        token: accessToken,
        accessToken,
        sessionId,
        user: mockUser,
      },
      'Session refreshed successfully'
    );
  }

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
