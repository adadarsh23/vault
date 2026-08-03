import crypto from 'node:crypto';
import { User } from '../models/user.ts';
import { ensureUserVaultCollections } from './legacyVaultService.ts';
import { upsertTotalUserMirror } from './totalUserMirrorService.ts';
import { verifyRefreshToken } from '../utils/auth.ts';
import { comparePassword, decryptText, encryptText, hashPassword } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { getAuthenticatedUserProfile as getAuthenticatedUserProfileFromAccountSession } from './accountSessionService.ts';
import {
  asDeviceId,
  buildSessionSummaries,
  buildStoredRegistrationProfile,
  CONFIG,
  ERROR_MESSAGES,
  executeWithStorageFailover,
  fetchRegistrationProfileWithTimeout,
  getUserOrThrow,
  hashRefreshToken,
  issueUserSession,
  logAndEmit,
  pruneExpiredSessions,
  publicUser,
  pushLoginHistory,
  retryLoadedUserMutation,
  sanitizePassword,
  sanitizeSessionId,
  sanitizeUsername,
  syncActiveDevicesFromSessions,
  withUserState,
  type AuthInput,
  type PasswordChangeInput,
  type RefreshInput,
  type RegistrationProfileSnapshot,
  type SessionRevokeInput,
  type UserStateDocument,
} from './vaultService.internal.ts';
// ============================================================================
// EXPORTED PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Registers new user account with password hashing and registration profile capture
 *
 * @param input - Registration input with username, password and device info
 * @returns Session tokens and public user profile
 * @throws {AppError} If registration fails (duplicate user, invalid input, etc.)
 *
 * @example
 * ```ts
 * const result = await registerUser({
 *   username: 'john_doe',
 *   password: 'SecurePassword123!',
 *   deviceId: 'device-uuid',
 *   ipAddress: '203.0.113.45',
 * })
 * ```
 */
export const registerUser = async (input: AuthInput) => {
  try {
    const username = sanitizeUsername(input.username);
    const password = sanitizePassword(input.password);

    const existing = await User.findOne({ username }).select('_id').lean().exec();

    if (existing) {
      logger.info('Username already exists', { username });
      // Perform dummy password comparison to prevent timing attacks
      await comparePassword(password, CONFIG.dummyPasswordHash);
      throw new AppError(400, 'REGISTRATION_FAILED', ERROR_MESSAGES.REGISTRATION_FAILED);
    }

    const hashedPassword = await hashPassword(password);
    const encryptedPassword = encryptText(hashedPassword);
    const userDeviceId = asDeviceId(input.deviceId);
    const rawMasterKey = typeof input.masterKey === 'string' ? input.masterKey : null;
    if (!rawMasterKey) {
      throw new AppError(400, 'INVALID_MASTER_KEY', 'Master Key is required.');
    }
    const encryptedMasterKey = encryptText(rawMasterKey);
    const masterKeyHash = encryptText(await hashPassword(rawMasterKey));

    // Retrieve or generate cryptographically secure random salt
    let pqcSalt =
      typeof input.pqcSalt === 'string' && input.pqcSalt.trim() ? input.pqcSalt.trim() : null;
    if (!pqcSalt) {
      pqcSalt = crypto.randomBytes(16).toString('hex');
    }

    // Capture registration profile with timeout to prevent hanging
    let registrationProfile: RegistrationProfileSnapshot = {
      provider: 'disabled',
      url: null,
      fetchedAt: new Date(),
      data: null,
      error: 'Registration profile capture disabled',
    };

    try {
      if (CONFIG.registrationProfileCaptureEnabled) {
        registrationProfile = await fetchRegistrationProfileWithTimeout({
          ipAddress: input.ipAddress ?? 'unknown',
          username,
          userAgent: input.userAgent ?? 'unknown',
          deviceId: userDeviceId,
          websiteMetadata: input.websiteMetadata,
        });
      }
    } catch (profileError) {
      logger.warn('Registration profile fetch failed during registration', {
        username,
        error: profileError instanceof Error ? profileError.message : String(profileError),
      });
      // Continue with disabled profile on failure
      registrationProfile = {
        provider: 'disabled',
        url: null,
        fetchedAt: new Date(),
        data: null,
        error: profileError instanceof Error ? profileError.message : 'Geolocation fetch failed',
      };
    }

    const now = new Date();
    const user = new User({
      username,
      password: encryptedPassword,
      masterKey: encryptedMasterKey,
      pqcSalt,
      registrationProfile: buildStoredRegistrationProfile(registrationProfile),
      loginHistory: [],
      meta: {
        registeredAt: now,
        lastLoginAt: null,
        lastFailedLoginAt: null,
        lastFailedLoginIp: null,
        lastSyncAt: null,
        lastCredentialChangeAt: now,
        activeDevices: [],
        accountStatus: 'active',
        profileVersion: 2,
      },
      activityLog: [],
      vault: {
        photos: [],
        videos: [],
        audios: [],
        notes: [],
        chats: [],
        todos: [],
        documents: [],
        passwords: [],
        secretKeys: [],
        otherFiles: [],
      },
      sessions: [],
    });

    // Safely log and emit event - shouldn't fail registration if it errors
    try {
      logAndEmit(user, 'REGISTER', 'auth', null, {
        ipAddress: input.ipAddress ?? 'unknown',
        deviceId: asDeviceId(input.deviceId),
      });
    } catch (emitError) {
      logger.warn('Failed to log registration event', {
        username,
        error: emitError instanceof Error ? emitError.message : String(emitError),
      });
    }

    try {
      const session = issueUserSession(user as UserStateDocument, {
        deviceId: userDeviceId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      await executeWithStorageFailover(() => user.save());
      await upsertTotalUserMirror({
        username,
        userId: user._id.toString(),
        createdDate: user.createdAt ?? now,
      });
      await ensureUserVaultCollections(username);

      logger.info('User registered successfully', { username });

      return {
        token: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.sessionId,
        created: true,
        user: publicUser(user),
        message: 'Account created successfully.',
      };
    } catch (error) {
      const candidate = error as { code?: number };
      // Duplicate key error - race condition between existence check and save
      if (candidate.code === 11000) {
        await comparePassword(password, CONFIG.dummyPasswordHash);
        throw new AppError(400, 'REGISTRATION_FAILED', ERROR_MESSAGES.REGISTRATION_FAILED);
      }
      throw error;
    }
  } catch (error) {
    // Log unexpected errors for debugging
    if (!(error instanceof AppError)) {
      logger.error('Unexpected error during user registration', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    throw error;
  }
};

export const getExactUsernameMatch = async (input: { username: unknown }) => {
  const username = sanitizeUsername(input.username);
  const exactUser = await User.findOne({ username }).select('_id username createdAt').lean().exec();

  if (!exactUser) {
    return {
      exists: false,
      exactMatch: false,
      username,
      userId: null,
      createdDate: null,
    };
  }

  return {
    exists: true,
    exactMatch: true,
    username: exactUser.username,
    userId: String(exactUser._id),
    createdDate: exactUser.createdAt ?? null,
  };
};

/**
 * Authenticates user with username and password
 * Creates new session token pair on successful authentication
 * Logs failed attempts for security auditing
 *
 * @param input - Username, password, and device/network info
 * @returns Session tokens and public user profile on success
 * @throws {AppError} If credentials are invalid
 */
export const authenticateUser = async (input: AuthInput) => {
  const username = sanitizeUsername(input.username);
  const password = sanitizePassword(input.password);
  return retryLoadedUserMutation({
    mutationName: 'authenticateUser',
    loadUser: async () => {
      const userDocument = await User.findOne({ username }).select('+password').exec();

      if (!userDocument) {
        // Perform dummy comparison to prevent timing attacks
        await comparePassword(password, CONFIG.dummyPasswordHash);
        throw new AppError(401, 'INVALID_CREDENTIALS', ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      return withUserState(userDocument);
    },
    operation: async (user) => {
      pruneExpiredSessions(user);
      const storedHash = decryptText(user.password as any);
      const isValidPassword = await comparePassword(password, storedHash);
      const loginEntry = {
        loggedInAt: new Date(),
        ipAddress: input.ipAddress ?? 'unknown',
        userAgent: input.userAgent ?? 'unknown',
        deviceId: asDeviceId(input.deviceId),
        status: isValidPassword ? 'SUCCESS' : 'FAILED',
        errorCode: isValidPassword ? null : 'INVALID_CREDENTIALS',
        failureReason: isValidPassword ? null : ERROR_MESSAGES.INVALID_CREDENTIALS,
        requestContext: {
          ipAddress: input.ipAddress ?? 'unknown',
          userAgent: input.userAgent ?? 'unknown',
        },
      };

      if (!isValidPassword) {
        user.meta.lastFailedLoginAt = loginEntry.loggedInAt;
        user.meta.lastFailedLoginIp = loginEntry.ipAddress;
        pushLoginHistory(user, loginEntry);
        throw new AppError(401, 'INVALID_CREDENTIALS', ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      user.meta.lastLoginAt = loginEntry.loggedInAt;
      const session = issueUserSession(user, {
        deviceId: loginEntry.deviceId,
        ipAddress: loginEntry.ipAddress,
        userAgent: loginEntry.userAgent,
      });
      pushLoginHistory(user, {
        ...loginEntry,
        sessionId: session.sessionId,
      });

      logAndEmit(user, 'LOGIN', 'auth', null, {
        ipAddress: loginEntry.ipAddress,
        deviceId: loginEntry.deviceId,
        userAgent: loginEntry.userAgent,
      });

      logger.info('User authentication succeeded', { username });

      return {
        result: {
          token: session.accessToken,
          refreshToken: session.refreshToken,
          sessionId: session.sessionId,
          user: publicUser(user),
        },
      };
    },
  });
};

/**
 * Refreshes authentication session using refresh token
 * Rotates refresh token for enhanced security
 * Detects token misuse and revokes compromised sessions
 *
 * @param input - Refresh token and device/network info
 * @returns New session tokens and updated user profile
 * @throws {AppError} If refresh token is invalid or revoked
 */
export const refreshAuthenticatedSession = async (input: RefreshInput) => {
  let payload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch (error) {
    logger.warn('Failed to refresh session - invalid token', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AppError(401, 'SESSION_REFRESH_FAILED', ERROR_MESSAGES.SESSION_REFRESH_FAILED);
  }

  return retryLoadedUserMutation({
    mutationName: 'refreshAuthenticatedSession',
    loadUser: () => getUserOrThrow(payload.sub),
    operation: async (user) => {
      pruneExpiredSessions(user);

      const session = user.sessions.find((entry) => entry.sessionId === payload.sessionId);
      if (!session) {
        throw new AppError(401, 'SESSION_REFRESH_FAILED', ERROR_MESSAGES.SESSION_REFRESH_FAILED);
      }

      // Check if session was revoked
      if (session.revokedAt) {
        throw new AppError(401, 'SESSION_REFRESH_FAILED', ERROR_MESSAGES.SESSION_REFRESH_FAILED);
      }

      // Check if session expired
      if (!(session.expiresAt instanceof Date) || session.expiresAt.getTime() <= Date.now()) {
        throw new AppError(401, 'SESSION_REFRESH_FAILED', ERROR_MESSAGES.SESSION_REFRESH_FAILED);
      }

      // Verify token hasn't been tampered with
      if (session.refreshTokenHash !== hashRefreshToken(input.refreshToken)) {
        // Token mismatch indicates possible token theft - revoke session
        session.revokedAt = new Date();
        syncActiveDevicesFromSessions(user);
        logger.warn('Potential token compromise detected, session revoked', {
          userId: user._id.toString(),
        });
        throw new AppError(401, 'SESSION_REFRESH_FAILED', ERROR_MESSAGES.SESSION_REFRESH_FAILED);
      }

      const rotatedSession = issueUserSession(user, {
        deviceId: session.deviceId,
        ipAddress: input.ipAddress ?? session.ipAddress,
        userAgent: input.userAgent ?? session.userAgent,
        existingSessionId: session.sessionId,
      });

      logAndEmit(user, 'REFRESH_SESSION', 'auth', null, {
        deviceId: session.deviceId,
        ipAddress: input.ipAddress ?? session.ipAddress,
        userAgent: input.userAgent ?? session.userAgent,
      });

      return {
        result: {
          token: rotatedSession.accessToken,
          refreshToken: rotatedSession.refreshToken,
          sessionId: rotatedSession.sessionId,
          user: publicUser(user),
        },
      };
    },
  });
};

/**
 * Revokes the current user session
 * Used for logout operations - graceful session termination
 *
 * @param refreshToken - Current refresh token to revoke
 * @returns Success status
 */
export const revokeCurrentSession = async (refreshToken: string): Promise<{ revoked: boolean }> => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    // Invalid token, session already revoked
    return { revoked: false };
  }

  return retryLoadedUserMutation<{ revoked: boolean }>({
    mutationName: 'revokeCurrentSession',
    loadUser: () => getUserOrThrow(payload.sub),
    operation: async (user) => {
      const session = user.sessions.find((entry) => entry.sessionId === payload.sessionId);
      if (!session || session.revokedAt) {
        return { result: { revoked: false }, skipSave: true };
      }

      session.revokedAt = new Date();
      syncActiveDevicesFromSessions(user);

      logAndEmit(user, 'LOGOUT', 'auth', null, {
        deviceId: session.deviceId,
      });

      return {
        result: { revoked: true },
      };
    },
  });
};

/**
 * Revokes one or more sessions for a user
 * Supports revoking specific session, all sessions on a device, or all sessions except current
 *
 * @param input - User ID and revocation target selector
 * @returns Revocation count and updated session list
 * @throws {AppError} If no sessions match the target criteria
 */
export const revokeAuthenticatedSessions = async (
  input: SessionRevokeInput
): Promise<{
  revokedCount: number;
  sessions: Array<Record<string, unknown>>;
}> => {
  return retryLoadedUserMutation({
    mutationName: 'revokeAuthenticatedSessions',
    loadUser: () => getUserOrThrow(input.userId),
    operation: async (user) => {
      pruneExpiredSessions(user);

      if (!input.revokeAllOther && !input.targetSessionId && !input.targetDeviceId) {
        throw new AppError(
          400,
          'SESSION_TARGET_REQUIRED',
          'Provide sessionId, deviceId, or revokeAllOther=true.'
        );
      }

      const targetSessionId = input.targetSessionId
        ? sanitizeSessionId(input.targetSessionId)
        : undefined;
      const now = new Date();
      let revokedCount = 0;

      user.sessions.forEach((session) => {
        const matches = input.revokeAllOther
          ? input.revokeCurrent
            ? true
            : session.sessionId !== input.currentSessionId
          : targetSessionId
            ? session.sessionId === targetSessionId
            : session.deviceId === input.targetDeviceId;

        if (!matches || session.revokedAt) {
          return;
        }

        if (session.sessionId === input.currentSessionId && !input.revokeCurrent) {
          return;
        }

        session.revokedAt = now;
        revokedCount += 1;
      });

      if (revokedCount === 0) {
        throw new AppError(
          404,
          'SESSION_NOT_FOUND',
          'No matching active device session was found.'
        );
      }

      syncActiveDevicesFromSessions(user);
      logAndEmit(user, 'REVOKE_SESSION', 'auth', null, {
        deviceId: input.targetDeviceId ?? 'multiple-devices',
        ipAddress: input.ipAddress ?? 'unknown',
        targetSessionId: targetSessionId ?? null,
        revokeAllOther: input.revokeAllOther === true,
        revokedCount,
      });

      logger.info('Sessions revoked', {
        userId: input.userId,
        revokedCount,
        targetDeviceId: input.targetDeviceId,
      });

      return {
        result: {
          revokedCount,
          sessions: buildSessionSummaries(user, input.currentSessionId) as Array<
            Record<string, unknown>
          >,
        },
      };
    },
  });
};

/**
 * Changes user password after validating current password
 * All existing sessions remain valid (could optionally be revoked)
 *
 * @param input - User ID, current password, and new password
 * @returns Success status
 * @throws {AppError} If current password is incorrect or new password is same
 */
export const changeAuthenticatedPassword = async (
  input: PasswordChangeInput
): Promise<{ updated: boolean }> => {
  const currentPassword = sanitizePassword(input.currentPassword);
  const password = sanitizePassword(input.newPassword);

  return retryLoadedUserMutation({
    mutationName: 'changeAuthenticatedPassword',
    loadUser: () => getUserOrThrow(input.userId, true),
    operation: async (user) => {
      const storedHash = decryptText(user.password as any);
      const isCurrentPasswordValid = await comparePassword(currentPassword, storedHash);
      if (!isCurrentPasswordValid) {
        throw new AppError(401, 'INVALID_CREDENTIALS', ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      const isSamePassword = await comparePassword(password, storedHash);
      if (isSamePassword) {
        throw new AppError(
          400,
          'PASSWORD_UNCHANGED',
          'New password must be different from the current password.'
        );
      }

      const hashedPassword = await hashPassword(password);
      user.password = encryptText(hashedPassword) as any;
      logAndEmit(user, 'CHANGE_PASSWORD', 'auth', null, {
        ipAddress: input.ipAddress ?? 'unknown',
      });

      logger.info('User password changed', { userId: input.userId });

      return {
        result: {
          updated: true,
        },
      };
    },
  });
};

/**
 * Fetches authenticated user's profile
 * Includes public user info and all active sessions
 *
 * @param userId - User ID to fetch profile for
 * @param currentSessionId - Optional session ID to mark as current
 * @returns Public user profile with session summaries
 */
export const getAuthenticatedUserProfile = async (userId: string, currentSessionId?: string) => {
  return getAuthenticatedUserProfileFromAccountSession(userId, currentSessionId);
};

/**
 * Updates the device name for all sessions matching a deviceId
 */
export const renameDeviceSession = async (
  userId: string,
  deviceId: string,
  deviceName: string
): Promise<{ success: boolean; sessions: Array<Record<string, unknown>> }> => {
  return retryLoadedUserMutation({
    mutationName: 'renameDeviceSession',
    loadUser: () => getUserOrThrow(userId),
    operation: async (user) => {
      let updatedCount = 0;
      user.sessions.forEach((session) => {
        if (session.deviceId === deviceId) {
          session.deviceName = deviceName;
          updatedCount += 1;
        }
      });

      if (updatedCount === 0) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'No matching device session was found.');
      }

      return {
        result: {
          success: true,
          sessions: buildSessionSummaries(user) as Array<Record<string, unknown>>,
        },
      };
    },
  });
};
