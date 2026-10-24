import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { User, UserDocument } from '../models/user.ts';
import { RefreshToken } from '../models/RefreshToken.ts';
import { getMasterKeyModel } from '../models/masterKey.ts';
import { issueUserSession, parseDeviceNameFromUserAgent } from './authService.ts';
import { verifyRefreshToken } from '../utils/auth.ts';
import { comparePassword, decryptText, encryptText, hashPassword } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { mirrorUserToAllClusters } from './multiClusterAggregator.ts';
import { sessionRealtimeService } from './sessionRealtimeService.ts';
import { revokeSocketSessions } from '../socket.ts';
import { convertBase64ToAvatar } from './avatarStorageService.ts';

const SESSION_REFRESH_FAILED = 'Session could not be refreshed. Please sign in again.';
const PROFILE_FIELD_ENCRYPTION_PREFIX = 'enc:v1:';
const NONE_PROFILE_VALUE = 'none';
const MIN_PASSWORD_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 64;
const STRONG_PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+=\[\];:,.<>?{}|\-])\S+$/;

const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const normalizeProfileValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    return NONE_PROFILE_VALUE;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : NONE_PROFILE_VALUE;
};

const isEncryptedProfileValue = (value: string): boolean =>
  value.startsWith(PROFILE_FIELD_ENCRYPTION_PREFIX);

const encodeProfileValueForStorage = (value: string): string => {
  if (value === NONE_PROFILE_VALUE) {
    return NONE_PROFILE_VALUE;
  }

  const encrypted = encryptText(value);
  const encoded = Buffer.from(JSON.stringify(encrypted), 'utf8').toString('base64url');
  return `${PROFILE_FIELD_ENCRYPTION_PREFIX}${encoded}`;
};

const decodeProfileValueFromStorage = (value: unknown): string => {
  const normalized = normalizeProfileValue(value);

  if (normalized.toLowerCase() === NONE_PROFILE_VALUE) {
    return NONE_PROFILE_VALUE;
  }

  if (!isEncryptedProfileValue(normalized)) {
    return normalized;
  }

  const payload = normalized.slice(PROFILE_FIELD_ENCRYPTION_PREFIX.length);
  if (!payload) {
    return NONE_PROFILE_VALUE;
  }

  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Parameters<typeof decryptText>[0];
    const decrypted = decryptText(parsed).trim();
    return decrypted.length > 0 ? decrypted : NONE_PROFILE_VALUE;
  } catch (error) {
    logger.warn('Failed to decrypt profile field; using fallback.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NONE_PROFILE_VALUE;
  }
};

const normalizeNewPassword = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw AppError.badRequest('Current and new password are required.', 'INVALID_PASSWORD');
  }

  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw AppError.badRequest(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      'AUTH_WEAK_PASSWORD',
    );
  }

  if (!STRONG_PASSWORD_PATTERN.test(value)) {
    throw AppError.badRequest(
      'Password must include uppercase, lowercase, number, and special character, and cannot contain spaces.',
      'AUTH_WEAK_PASSWORD',
    );
  }

  return value;
};

const migrateLegacyPlaintextProfileFields = async (user: UserDocument): Promise<void> => {
  // Fast path: skip entirely if both fields are already encrypted/clean and not base64.
  const nameStored = normalizeProfileValue((user as any).profileName);
  const photoStored = normalizeProfileValue((user as any).profilePhoto);
  const decodedPhoto = decodeProfileValueFromStorage(photoStored);
  const photoHasBase64 = decodedPhoto.startsWith('data:image/');

  const nameIsClean = nameStored === NONE_PROFILE_VALUE || isEncryptedProfileValue(nameStored);
  const photoIsClean =
    !photoHasBase64 && (photoStored === NONE_PROFILE_VALUE || isEncryptedProfileValue(photoStored));
  if (nameIsClean && photoIsClean) {
    return;
  }

  let changed = false;

  for (const field of ['profileName', 'profilePhoto'] as const) {
    const currentStored = normalizeProfileValue((user as any)[field]);

    if (field === 'profilePhoto' && photoHasBase64) {
      const publicPath = await convertBase64ToAvatar(String(user._id), decodedPhoto);
      if (publicPath) {
        (user as any).profilePhoto = encodeProfileValueForStorage(publicPath);
        changed = true;
        continue;
      }
    }

    if (currentStored === NONE_PROFILE_VALUE || isEncryptedProfileValue(currentStored)) {
      continue;
    }

    const normalizedDecrypted = decodeProfileValueFromStorage(currentStored);
    (user as any)[field] = encodeProfileValueForStorage(normalizedDecrypted);
    changed = true;
  }

  if (!changed) {
    return;
  }

  try {
    await user.save();
  } catch (error) {
    logger.warn('Failed to migrate legacy plaintext profile fields.', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (user as any)?._id,
    });
  }
};

const toTimestamp = (value: unknown): number | null => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

const normalizeSessionEntries = (
  user: UserDocument,
  options: { requireRefreshTokenHash?: boolean } = {},
): { removedInvalidSessions: number } => {
  const sessions = Array.isArray((user as any).sessions)
    ? ((user as any).sessions as Array<Record<string, unknown>>)
    : [];
  const requireRefreshTokenHash = options.requireRefreshTokenHash === true;

  const normalized: Array<Record<string, unknown>> = [];
  let removedInvalidSessions = 0;

  for (const rawSession of sessions) {
    if (!rawSession || typeof rawSession !== 'object') {
      removedInvalidSessions += 1;
      continue;
    }

    const sessionId = typeof rawSession.sessionId === 'string' ? rawSession.sessionId.trim() : '';
    const deviceId = typeof rawSession.deviceId === 'string' ? rawSession.deviceId.trim() : '';
    const expiresAtMs = toTimestamp(rawSession.expiresAt);
    const refreshTokenHash =
      typeof rawSession.refreshTokenHash === 'string' ? rawSession.refreshTokenHash.trim() : '';

    if (
      !sessionId ||
      !deviceId ||
      expiresAtMs === null ||
      (requireRefreshTokenHash && !refreshTokenHash)
    ) {
      removedInvalidSessions += 1;
      continue;
    }

    normalized.push(rawSession);
  }

  (user as any).sessions = normalized as any;
  return { removedInvalidSessions };
};

const ensureUserState = (
  user: UserDocument,
  options: { requireRefreshTokenHash?: boolean } = {},
): UserDocument => {
  if (!user.sessions) {
    (user as any).sessions = [];
  }
  if (!user.loginHistory) {
    (user as any).loginHistory = [];
  }
  if (!user.meta) {
    (user as any).meta = {
      lastLoginAt: null,
      lastSyncAt: null,
      activeDevices: [],
      masterKey: null,
      masterKeyHash: null,
    };
  }
  const meta = (user as any).meta;
  if (!Array.isArray(meta.activeDevices)) {
    meta.activeDevices = [];
  }

  const { removedInvalidSessions } = normalizeSessionEntries(user, options);
  if (removedInvalidSessions > 0) {
    logger.warn('Pruned invalid legacy session entries from user state.', {
      userId: (user as any)?._id,
      removedInvalidSessions,
      requireRefreshTokenHash: options.requireRefreshTokenHash === true,
    });
  }

  return user;
};

const syncActiveDevices = (user: UserDocument) => {
  const now = Date.now();
  const hydratedUser = ensureUserState(user);
  const meta = hydratedUser.meta as NonNullable<UserDocument['meta']>;
  meta.activeDevices = Array.from(
    new Set(
      (hydratedUser.sessions || [])
        .filter(
          (session: any) =>
            !session.revokedAt &&
            (toTimestamp(session.expiresAt) ?? 0) > now &&
            typeof session.deviceId === 'string' &&
            session.deviceId.trim(),
        )
        .map((session: any) => session.deviceId),
    ),
  );
};

const buildSessionSummaries = (user: UserDocument, currentSessionId?: string) =>
  (user.sessions || [])
    .filter(
      (session: any) => !session.revokedAt && (toTimestamp(session.expiresAt) ?? 0) > Date.now(),
    )
    .sort(
      (left: any, right: any) =>
        (toTimestamp(right.lastUsedAt) ?? 0) - (toTimestamp(left.lastUsedAt) ?? 0),
    )
    .map((session: any) => ({
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt ?? null,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isCurrent: session.sessionId === currentSessionId,
      deviceName:
        session.deviceName || parseDeviceNameFromUserAgent(session.userAgent) || 'Web Client',
    }));

const getUserOrThrow = async (
  userId: string,
  select?: string,
  options: { requireRefreshTokenHash?: boolean } = {},
): Promise<UserDocument> => {
  const query = User.findById(userId);
  if (select) {
    query.select(`+password +masterKey ${select}`);
  } else {
    query.select('+password +masterKey');
  }

  const user = await query.exec();
  if (!user) {
    throw AppError.notFound('User not found.', 'USER_NOT_FOUND');
  }

  return ensureUserState(user, options);
};

export const refreshAuthenticatedSession = async (input: {
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  let payload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch (error) {
    logger.warn('Failed to verify refresh token during session refresh', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw AppError.unauthorized(SESSION_REFRESH_FAILED, 'SESSION_REFRESH_FAILED');
  }

  const tokenHash = hashRefreshToken(input.refreshToken);
  const existingTokenDoc = await RefreshToken.findOne({ tokenHash });

  let user: UserDocument;
  try {
    user = await getUserOrThrow(payload.sub, '+sessions.refreshTokenHash', {
      requireRefreshTokenHash: true,
    });
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 404) {
      throw AppError.unauthorized(SESSION_REFRESH_FAILED, 'SESSION_REFRESH_FAILED');
    }
    throw err;
  }

  const session = user.sessions?.find((entry: any) => entry.sessionId === payload.sessionId);
  const familyId = existingTokenDoc?.familyId || (session as any)?.familyId || payload.sessionId;
  const now = new Date();

  const isReuseAttack = Boolean(
    (existingTokenDoc && existingTokenDoc.isRevoked) ||
    (session && session.revokedAt) ||
    (session && session.refreshTokenHash !== tokenHash),
  );

  if (isReuseAttack) {
    logger.error('CRITICAL SECURITY BREACH: Refresh token reuse attack detected!', {
      userId: user._id,
      familyId,
      sessionId: payload.sessionId,
    });

    if (familyId) {
      await RefreshToken.updateMany({ familyId }, { $set: { isRevoked: true } });
    }

    if (user.sessions) {
      user.sessions.forEach((s: any) => {
        if (s.familyId === familyId || s.sessionId === payload.sessionId) {
          s.revokedAt = new Date();
        }
      });
      syncActiveDevices(user);
      await user.save().catch(() => {});
    }

    throw new AppError(
      403,
      'TOKEN_REUSE_DETECTED',
      'Token reuse detected. Session lineage revoked.',
    );
  }

  if (!session) {
    throw AppError.unauthorized(SESSION_REFRESH_FAILED, 'SESSION_REFRESH_FAILED');
  }

  if ((toTimestamp(session.expiresAt) ?? 0) <= Date.now()) {
    session.revokedAt = new Date();
    if (existingTokenDoc) {
      existingTokenDoc.isRevoked = true;
      await existingTokenDoc.save();
    }
    syncActiveDevices(user);
    await user.save();
    throw AppError.unauthorized(SESSION_REFRESH_FAILED, 'SESSION_REFRESH_FAILED');
  }

  if (existingTokenDoc) {
    existingTokenDoc.isRevoked = true;
    existingTokenDoc.rotatedAt = now;
    await existingTokenDoc.save();
  }
  await RefreshToken.updateMany(
    { tokenHash, isRevoked: false },
    { $set: { isRevoked: true, rotatedAt: now } },
  );

  // Rotate session and tokens
  const rotatedSession = issueUserSession(user, {
    deviceId: session.deviceId,
    ipAddress: input.ipAddress ?? session.ipAddress,
    userAgent: input.userAgent ?? session.userAgent,
    existingSessionId: session.sessionId,
    familyId,
    deviceName: session.deviceName,
  });

  const rawUserId = user._id?.toString ? user._id.toString() : String(user._id || '');
  if (mongoose.Types.ObjectId.isValid(rawUserId)) {
    await RefreshToken.create({
      userId: user._id,
      familyId: rotatedSession.familyId,
      sessionId: rotatedSession.sessionId,
      tokenHash: hashRefreshToken(rotatedSession.refreshToken),
      isRevoked: false,
      ip: input.ipAddress ?? session.ipAddress ?? 'unknown',
      userAgent: input.userAgent ?? session.userAgent ?? 'unknown',
      expiresAt: rotatedSession.expiresAt,
    }).catch((err) => {
      logger.warn('Failed to save rotated RefreshToken document in DB', { error: err });
    });
  }

  await user.save();

  return {
    token: rotatedSession.accessToken,
    accessToken: rotatedSession.accessToken,
    refreshToken: rotatedSession.refreshToken,
    sessionId: rotatedSession.sessionId,
    familyId: rotatedSession.familyId,
    user: {
      id: user._id,
      username: user.username,
      meta: user.meta,
      twoFactorEnabled: user.twoFactorEnabled === true,
    },
  };
};

export const revokeCurrentSession = async (refreshToken: string): Promise<{ revoked: boolean }> => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return { revoked: false };
  }

  const tokenHash = hashRefreshToken(refreshToken);
  await RefreshToken.updateMany({ tokenHash }, { $set: { isRevoked: true } });

  const user = await getUserOrThrow(payload.sub);
  const session = user.sessions?.find((entry: any) => entry.sessionId === payload.sessionId);
  if (!session || session.revokedAt) {
    return { revoked: false };
  }

  session.revokedAt = new Date();
  syncActiveDevices(user);
  await user.save();

  if (payload.sessionId) {
    await RefreshToken.updateMany(
      { sessionId: payload.sessionId },
      { $set: { isRevoked: true } },
    ).catch(() => {});

    try {
      sessionRealtimeService.notifySessionRevoked(payload.sub, [payload.sessionId], 'LOGOUT');
      revokeSocketSessions(payload.sub, [payload.sessionId], 'LOGOUT');
    } catch {
      /* ignore realtime failure */
    }
  }

  return { revoked: true };
};

export const revokeAuthenticatedSessions = async (input: {
  userId: string;
  currentSessionId?: string;
  targetSessionId?: string;
  targetDeviceId?: string;
  revokeAllOther?: boolean;
  revokeCurrent?: boolean;
  ipAddress?: string;
}) => {
  if (!input.revokeAllOther && !input.targetSessionId && !input.targetDeviceId) {
    throw AppError.badRequest(
      'Provide sessionId, deviceId, or revokeAllOther=true.',
      'SESSION_TARGET_REQUIRED',
    );
  }

  const user = await getUserOrThrow(input.userId);
  const now = new Date();
  let revokedCount = 0;
  const revokedSessionIds: string[] = [];

  for (const session of user.sessions || []) {
    const matches = input.revokeAllOther
      ? input.revokeCurrent === true || session.sessionId !== input.currentSessionId
      : input.targetSessionId
        ? session.sessionId === input.targetSessionId
        : session.deviceId === input.targetDeviceId;

    if (!matches || session.revokedAt) {
      continue;
    }

    if (session.sessionId === input.currentSessionId && input.revokeCurrent !== true) {
      continue;
    }

    session.revokedAt = now;
    revokedCount += 1;
    if (session.sessionId) {
      revokedSessionIds.push(session.sessionId);
    }
  }

  if (revokedCount === 0) {
    throw AppError.notFound('No matching active device session was found.', 'SESSION_NOT_FOUND');
  }

  syncActiveDevices(user);
  await user.save();

  // Invalidate refresh tokens for revoked sessions
  if (revokedSessionIds.length > 0) {
    await RefreshToken.updateMany(
      { sessionId: { $in: revokedSessionIds } },
      { $set: { isRevoked: true, rotatedAt: now } },
    ).catch((err) => {
      logger.warn('Failed to mark RefreshToken documents as revoked in DB', { err });
    });

    // Real-time Push to instantly disconnect and block revoked sessions
    try {
      sessionRealtimeService.notifySessionRevoked(
        input.userId,
        revokedSessionIds,
        'REVOKED_BY_USER',
      );
      revokeSocketSessions(input.userId, revokedSessionIds, 'REVOKED_BY_USER');
    } catch (realtimeErr) {
      logger.warn('Failed to broadcast realtime session revocation', { realtimeErr });
    }
  }

  return {
    revokedCount,
    sessions: buildSessionSummaries(user, input.currentSessionId),
  };
};

export const changeAuthenticatedPassword = async (input: {
  userId: string;
  currentPassword: unknown;
  newPassword: unknown;
  ipAddress?: string;
}) => {
  if (typeof input.currentPassword !== 'string' || typeof input.newPassword !== 'string') {
    throw AppError.badRequest('Current and new password are required.', 'INVALID_PASSWORD');
  }
  const currentPassword = input.currentPassword;
  if (!currentPassword.trim()) {
    throw AppError.badRequest('Current password is required.', 'INVALID_PASSWORD');
  }
  const nextPassword = normalizeNewPassword(input.newPassword);

  if (currentPassword === nextPassword) {
    throw AppError.badRequest(
      'New password must be different from current password.',
      'PASSWORD_UNCHANGED',
    );
  }

  const user = await getUserOrThrow(input.userId, '+password +masterKey +meta.masterKey');
  let currentHash = '';
  if (typeof user.password === 'string') {
    currentHash = user.password;
  } else if (
    user.password &&
    typeof user.password === 'object' &&
    'cipherText' in (user.password as any) &&
    'iv' in (user.password as any)
  ) {
    try {
      currentHash = decryptText(user.password as any);
    } catch (decryptErr) {
      logger.warn('Failed to decrypt legacy password hash in change password', {
        error: decryptErr,
      });
    }
  }
  const isValid = currentHash ? await comparePassword(currentPassword, currentHash) : false;
  if (!isValid) {
    throw AppError.unauthorized('Current password is incorrect.', 'INVALID_CREDENTIALS');
  }

  const rawMasterKey = (user as any).masterKey || (user as any).meta?.masterKey;
  if (rawMasterKey) {
    try {
      const decryptedMasterKey = decryptText(rawMasterKey as any);
      if (decryptedMasterKey && decryptedMasterKey === nextPassword) {
        throw AppError.badRequest(
          'Account password and master key must not be identical.',
          'AUTH_SAME_CREDENTIALS',
        );
      }
    } catch {
      // Ignore decryption failure if masterKey format differs
    }
  }

  try {
    const MasterKeyModel = getMasterKeyModel(user.username);
    const cloudMasterKeyDoc = await MasterKeyModel.findOne({
      userId: user._id.toString(),
      isDeleted: false,
    })
      .select({ masterKeyHash: 1 })
      .lean()
      .exec();
    if (cloudMasterKeyDoc?.masterKeyHash) {
      const decryptedHash =
        typeof cloudMasterKeyDoc.masterKeyHash === 'string'
          ? cloudMasterKeyDoc.masterKeyHash
          : decryptText(cloudMasterKeyDoc.masterKeyHash as any);
      const matchesMasterKey = await comparePassword(nextPassword, decryptedHash);
      if (matchesMasterKey) {
        throw AppError.badRequest(
          'Account password and master key must not be identical.',
          'AUTH_SAME_CREDENTIALS',
        );
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
  }

  const nextHash = await hashPassword(nextPassword);
  user.password = nextHash as any;
  const now = new Date();
  for (const session of user.sessions || []) {
    if (!session.revokedAt) {
      session.revokedAt = now;
    }
  }
  if (user.meta) {
    user.meta.lastCredentialChangeAt = now;
  }
  syncActiveDevices(user);
  await user.save();

  // Invalidate all active RefreshToken records in DB for security
  try {
    await RefreshToken.updateMany({ userId: user._id }, { $set: { isRevoked: true } });
  } catch (err) {
    logger.warn('Failed to revoke RefreshToken documents during password change', { error: err });
  }

  // Mirror new user credential state across all database clusters
  void mirrorUserToAllClusters(user);

  return { changed: true };
};

export const getAuthenticatedUserProfile = async (userId: string, currentSessionId?: string) => {
  const user = await getUserOrThrow(userId);
  await migrateLegacyPlaintextProfileFields(user);
  const profileName = decodeProfileValueFromStorage((user as any).profileName);
  const profilePhoto = decodeProfileValueFromStorage((user as any).profilePhoto);

  return {
    id: user._id,
    username: user.username,
    profileName,
    profilePhoto,
    profileDetails: {
      createdAt: (user as any).profileDetails?.createdAt ?? user.createdAt,
      updatedAt: (user as any).profileDetails?.updatedAt ?? user.updatedAt,
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    meta: user.meta,
    twoFactorEnabled: user.twoFactorEnabled === true,
    sessions: buildSessionSummaries(user, currentSessionId),
  };
};

export const updateAuthenticatedUserProfile = async (input: {
  userId: string;
  profileName?: string;
  profilePhoto?: string;
}) => {
  const user = await getUserOrThrow(input.userId);
  const now = new Date();
  let changed = false;

  if (!(user as any).profileDetails) {
    (user as any).profileDetails = {
      createdAt: now,
      updatedAt: now,
    };
  }
  if (!(user as any).profileDetails.createdAt) {
    (user as any).profileDetails.createdAt = now;
  }

  if (typeof input.profileName === 'string') {
    const nextName = input.profileName.trim();
    const normalizedName = nextName || NONE_PROFILE_VALUE;
    const currentStoredName = normalizeProfileValue((user as any).profileName);
    const currentName = decodeProfileValueFromStorage(currentStoredName);
    const currentIsLegacyPlaintext =
      currentStoredName !== NONE_PROFILE_VALUE && !isEncryptedProfileValue(currentStoredName);

    if (currentName !== normalizedName || currentIsLegacyPlaintext) {
      (user as any).profileName = encodeProfileValueForStorage(normalizedName);
      changed = true;
    }
  }

  if (typeof input.profilePhoto === 'string') {
    let nextPhoto = input.profilePhoto.trim();
    if (nextPhoto.startsWith('data:image/')) {
      const publicPath = await convertBase64ToAvatar(String(user._id), nextPhoto);
      if (publicPath) {
        nextPhoto = publicPath;
      }
    }
    const normalizedPhoto = nextPhoto || NONE_PROFILE_VALUE;
    const currentStoredPhoto = normalizeProfileValue((user as any).profilePhoto);
    const currentPhoto = decodeProfileValueFromStorage(currentStoredPhoto);
    const currentIsLegacyPlaintext =
      currentStoredPhoto !== NONE_PROFILE_VALUE && !isEncryptedProfileValue(currentStoredPhoto);

    if (currentPhoto !== normalizedPhoto || currentIsLegacyPlaintext) {
      (user as any).profilePhoto = encodeProfileValueForStorage(normalizedPhoto);
      changed = true;
    }
  }

  if (changed) {
    (user as any).profileDetails.updatedAt = now;
    await user.save();
  }

  const profileName = decodeProfileValueFromStorage((user as any).profileName);
  const profilePhoto = decodeProfileValueFromStorage((user as any).profilePhoto);

  return {
    id: user._id,
    username: user.username,
    profileName,
    profilePhoto,
    profileDetails: {
      createdAt: (user as any).profileDetails?.createdAt ?? user.createdAt,
      updatedAt: (user as any).profileDetails?.updatedAt ?? user.updatedAt,
    },
    updatedAt: user.updatedAt,
  };
};

export const renameDeviceSession = async (userId: string, deviceId: string, deviceName: string) => {
  const normalizedDeviceId = deviceId.trim();
  const normalizedDeviceName = deviceName.trim();

  if (!normalizedDeviceId || !normalizedDeviceName) {
    throw AppError.badRequest('deviceId and deviceName are required.', 'INVALID_INPUT');
  }

  const user = await getUserOrThrow(userId);
  let updated = false;

  for (const session of user.sessions || []) {
    if (session.deviceId === normalizedDeviceId && !session.revokedAt) {
      session.deviceName = normalizedDeviceName;
      updated = true;
    }
  }

  if (!updated) {
    throw AppError.notFound('No matching active device session was found.', 'SESSION_NOT_FOUND');
  }

  await user.save();

  return {
    success: true,
    sessions: buildSessionSummaries(user),
  };
};
