import { createHash, randomUUID } from 'crypto';
import { User, UserDocument } from '../models/user.ts';
import {
  createAccessToken,
  createRefreshToken,
  getRefreshCookieMaxAgeMs,
  createMfaToken,
} from '../utils/auth.ts';
import { comparePassword, hashPassword, encryptText, decryptText } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { initializeDefaultUserFolders } from './folderService.ts';
import { createNotification } from './notificationService.ts';

// Helper to hash refresh tokens
const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const FALLBACK_DEVICE_ID = 'unknown-device';

const normalizeSessionDeviceId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return FALLBACK_DEVICE_ID;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_DEVICE_ID;
};

const buildMetaState = (meta: UserDocument['meta']) => ({
  registeredAt: meta?.registeredAt ?? new Date(),
  lastLoginAt: meta?.lastLoginAt ?? null,
  lastFailedLoginAt: meta?.lastFailedLoginAt ?? null,
  lastFailedLoginIp: meta?.lastFailedLoginIp ?? null,
  lastSyncAt: meta?.lastSyncAt ?? null,
  lastCredentialChangeAt: meta?.lastCredentialChangeAt ?? new Date(),
  activeDevices: meta?.activeDevices ?? [],
  accountStatus: meta?.accountStatus ?? 'active',
  profileVersion: meta?.profileVersion ?? 2,
  masterKey: meta?.masterKey ?? null,
  masterKeyHash: meta?.masterKeyHash ?? null,
});

/**
 * Issues or rotates a user session
 */
export const issueUserSession = (
  user: UserDocument,
  input: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
    existingSessionId?: string;
    deviceName?: string;
  }
): {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getRefreshCookieMaxAgeMs());
  const sessionId = input.existingSessionId || randomUUID();
  const normalizedDeviceId = normalizeSessionDeviceId(input.deviceId);

  const refreshToken = createRefreshToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
    deviceId: normalizedDeviceId,
  });

  const refreshTokenHash = hashRefreshToken(refreshToken);

  const accessToken = createAccessToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
  });

  const sessionData = {
    sessionId,
    deviceId: normalizedDeviceId,
    deviceName: input.deviceName ?? '',
    refreshTokenHash,
    createdAt: now,
    lastUsedAt: now,
    lastRotatedAt: now,
    expiresAt,
    revokedAt: null,
    ipAddress: input.ipAddress ?? 'unknown',
    userAgent: input.userAgent ?? 'unknown',
    loginMethod: input.existingSessionId ? 'refresh' : 'password',
    requestContext: {
      ipAddress: input.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? 'unknown',
    },
  };

  // Ensure sessions array exists
  if (!user.sessions) user.sessions = [] as any;

  const sessionIndex = user.sessions.findIndex((s) => s.sessionId === sessionId);
  if (sessionIndex >= 0) {
    user.sessions[sessionIndex] = sessionData as any;
  } else {
    user.sessions.unshift(sessionData as any);
  }

  return { sessionId, accessToken, refreshToken, expiresAt };
};

/**
 * Authenticates user and returns tokens
 */
export const authenticateUser = async (input: {
  username: string;
  password: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const deviceId = normalizeSessionDeviceId(input.deviceId);
  const user = await User.findOne({ username: input.username.toLowerCase() })
    .select('+password')
    .exec();

  if (!user) {
    throw AppError.unauthorized('Invalid username or password.', 'INVALID_CREDENTIALS');
  }

  // Decrypt the stored scrypt hash (it was stored encrypted in DB)
  const storedHash = decryptText(user.password as any);

  // Compare with provided password
  const isValid = await comparePassword(input.password, storedHash);

  if (!isValid) {
    // Log failed attempt for existing user
    if (!user.loginHistory) user.loginHistory = [] as any;
    user.loginHistory.unshift({
      loggedInAt: new Date(),
      ipAddress: input.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? 'unknown',
      deviceId,
      status: 'FAILED',
      errorCode: 'INVALID_CREDENTIALS',
      failureReason: 'Invalid username or password.',
      requestContext: {
        ipAddress: input.ipAddress ?? 'unknown',
        userAgent: input.userAgent ?? 'unknown',
      },
    } as any);
    user.meta = {
      ...buildMetaState(user.meta),
      lastFailedLoginAt: new Date(),
      lastFailedLoginIp: input.ipAddress ?? 'unknown',
    };
    await user.save();

    throw AppError.unauthorized('Invalid username or password.', 'INVALID_CREDENTIALS');
  }

  // Check if 2FA is enabled
  if (user.twoFactorEnabled) {
    const mfaToken = createMfaToken({
      sub: user._id.toString(),
      username: user.username,
    });

    return {
      twoFactorRequired: true,
      userId: user._id,
      username: user.username,
      mfaToken,
    };
  }

  const session = issueUserSession(user, {
    deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  // Log successful login
  if (!user.loginHistory) user.loginHistory = [] as any;
  user.loginHistory.unshift({
    loggedInAt: new Date(),
    ipAddress: input.ipAddress ?? 'unknown',
    userAgent: input.userAgent ?? 'unknown',
    deviceId,
    sessionId: session.sessionId,
    status: 'SUCCESS',
    errorCode: null,
    failureReason: null,
    requestContext: {
      ipAddress: input.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? 'unknown',
    },
  } as any);

  // Limit history size to 50 entries
  if (user.loginHistory.length > 50) {
    user.loginHistory = user.loginHistory.slice(0, 50) as any;
  }

  user.meta = {
    ...buildMetaState(user.meta),
    lastLoginAt: new Date(),
  };

  await user.save();

  // Create login notification
  try {
    const ip = input.ipAddress || 'unknown';
    const deviceName = input.deviceId || 'Web Client';
    await createNotification(
      user._id.toString(),
      'device_login',
      'New Device Login',
      `A new login session was established on device "${deviceName}" from IP: ${ip}`
    );
  } catch (err) {
    logger.warn('Failed to create login notification', { error: err });
  }

  return {
    token: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user._id,
      username: user.username,
      meta: user.meta,
    },
  };
};

/**
 * Registers a new user with required vault fields
 */
export const registerUser = async (input: {
  username: string;
  password: string;
  masterKey: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  websiteMetadata?: any;
}) => {
  const deviceId = normalizeSessionDeviceId(input.deviceId);
  const { username, password, masterKey } = input;
  logger.info('Registration attempt started', { username });

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) {
    logger.warn('Registration rejected - username exists', { username });
    throw AppError.conflict('Username already exists.', 'USER_EXISTS');
  }

  // 1. Hash and then Encrypt the password (as per vault protocol)
  logger.debug('Hashing and encrypting password', { username });
  const hashedPassword = await hashPassword(password);
  const encryptedPassword = encryptText(hashedPassword);

  // 2. Encrypt the master key
  logger.debug('Encrypting master key', { username });
  const encryptedMasterKey = encryptText(masterKey);

  logger.debug('Creating new user document', { username });
  const user = new User({
    username: username.toLowerCase(),
    password: encryptedPassword,
    masterKey: encryptedMasterKey, // Also required by schema
    meta: {
      registeredAt: new Date(),
      lastLoginAt: new Date(),
      lastFailedLoginAt: null,
      lastFailedLoginIp: null,
      lastSyncAt: null,
      lastCredentialChangeAt: new Date(),
      activeDevices: [deviceId],
      accountStatus: 'active',
      profileVersion: 2,
      masterKey: encryptedMasterKey, // Backup
      masterKeyHash: encryptText(await hashPassword(masterKey)),
    },
    loginHistory: [
      {
        loggedInAt: new Date(),
        ipAddress: input.ipAddress ?? 'unknown',
        userAgent: input.userAgent ?? 'unknown',
        deviceId,
        status: 'SUCCESS',
        requestContext: {
          ipAddress: input.ipAddress ?? 'unknown',
          userAgent: input.userAgent ?? 'unknown',
        },
      },
    ],
    vault: {
      photos: [],
      videos: [],
      audios: [],
      documents: [],
      otherFiles: [],
      notes: [],
      chats: [],
      todos: [],
      passwords: [],
      secretKeys: [],
      location: [],
      contact: [],
    },
  });

  const session = issueUserSession(user, {
    deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  logger.debug('Saving user document to database', { username });
  await user.save();
  logger.info('User document saved successfully', { username });
  await initializeDefaultUserFolders(user._id.toString(), user.username);

  return {
    token: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user._id,
      username: user.username,
      meta: user.meta,
    },
    created: true,
  };
};
