/**
 * VaultService - Core business logic for vault management
 *
 * Handles user authentication, session management, vault operations, and data synchronization.
 * All functions validate inputs, manage transactions with retry logic, and emit proper events.
 *
 * @module vaultService
 */

import { createHash, randomUUID } from 'crypto';
import path from 'path';
import type {} from 'multer';
import { emitVaultEvent } from '../socket.ts';
import { User, UserDocument } from '../models/user.ts';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { isStorageFullError, switchToNextMongoUri } from '../mongo.ts';
import { saveActivityLog } from './activityLogService.ts';

import { createAccessToken, createRefreshToken, getRefreshCookieMaxAgeMs } from '../utils/auth.ts';
import { encryptText } from '../utils/crypto.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/** File categories that can be stored in vault */
export const FILE_CATEGORIES = new Set([
  'photo',
  'video',
  'audio',
  'document',
  'other-files',
] as const);

/** Encrypted data categories */
export const ENCRYPTED_CATEGORIES = new Set([
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'location',
  'contact',
] as const);

/**
 * Configuration object for environment-based constants
 * All values have sensible defaults for security and performance
 */
export const CONFIG = {
  maxActivityLogs: Number.parseInt(process.env.MAX_ACTIVITY_LOGS?.trim() || '500', 10),
  maxLoginHistory: Number.parseInt(process.env.MAX_LOGIN_HISTORY?.trim() || '20', 10),
  maxActiveDevices: Number.parseInt(process.env.MAX_ACTIVE_DEVICES?.trim() || '25', 10),
  maxItemIdLength: Number.parseInt(process.env.MAX_ITEM_ID_LENGTH?.trim() || '128', 10),
  maxTitleLength: Number.parseInt(process.env.MAX_TITLE_LENGTH?.trim() || '200', 10),
  maxNoteContentLength: Number.parseInt(
    process.env.MAX_NOTE_CONTENT_LENGTH?.trim() || '100000',
    10,
  ),
  maxTextFieldLength: Number.parseInt(process.env.MAX_TEXT_FIELD_LENGTH?.trim() || '1000', 10),
  maxFileNameLength: Number.parseInt(process.env.MAX_FILE_NAME_LENGTH?.trim() || '255', 10),
  sessionRetentionMs: Number.parseInt(process.env.SESSION_RETENTION_MS?.trim() || '604800000', 10),
  maxUserWriteRetries: Number.parseInt(process.env.MAX_USER_WRITE_RETRIES?.trim() || '3', 10),
  registrationProfileTimeoutMs: Number.parseInt(
    process.env.REGISTRATION_PROFILE_TIMEOUT_MS?.trim() || '10000',
    10,
  ),
  ipGeolocationApiKey: process.env.IPGEOLOCATION_API_KEY?.trim(),
  freeIpApiUrlTemplate:
    process.env.FREE_IP_API_URL_TEMPLATE?.trim() || 'https://free.freeipapi.com/api/json/{ip}',
  freeIpApiFallback:
    process.env.FREE_IP_API_URL_FALLBACK?.trim() || 'https://free.freeipapi.com/api/json',
  ipwhoisUrlTemplate: process.env.IPWHOIS_URL_TEMPLATE?.trim() || 'https://ipwho.is/{ip}',
  ipwhoisUrlFallback: process.env.IPWHOIS_URL_FALLBACK?.trim() || 'https://ipwho.is/',
  ipwhoisAppApiKey: process.env.IPWHOIS_APP_API_KEY?.trim(),
  ipwhoisAppUrlTemplate:
    process.env.IPWHOIS_APP_URL_TEMPLATE?.trim() || 'https://ipwhois.app/json/{ip}?key={apiKey}',
  ipwhoisAppUrlFallback:
    process.env.IPWHOIS_APP_URL_FALLBACK?.trim() || 'https://ipwhois.app/json/?key={apiKey}',
  ipApiComUrlTemplate: process.env.IP_API_COM_URL_TEMPLATE?.trim() || 'http://ip-api.com/json/{ip}',
  ipApiComUrlFallback: process.env.IP_API_COM_URL_FALLBACK?.trim() || 'http://ip-api.com/json/',
  ipgeolocationUrlTemplate:
    process.env.IPGEOLOCATION_URL_TEMPLATE?.trim() ||
    'https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}&ip={ip}',
  ipgeolocationUrlFallback:
    process.env.IPGEOLOCATION_URL_FALLBACK?.trim() ||
    'https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}',
  iplocateIoApiKey: process.env.IPLOCATE_IO_API_KEY?.trim(),
  iplocateIoUrlTemplate:
    process.env.IPLOCATE_IO_URL_TEMPLATE?.trim() ||
    'https://iplocate.io/api/lookup/{ip}?apikey={apiKey}',
  iplocateIoUrlFallback:
    process.env.IPLOCATE_IO_URL_FALLBACK?.trim() ||
    'https://iplocate.io/api/lookup?apikey={apiKey}',
  ipinfoIoUrlTemplate: process.env.IPINFO_IO_URL_TEMPLATE?.trim() || 'https://ipinfo.io/{ip}/json',
  ipinfoIoUrlFallback: process.env.IPINFO_IO_URL_FALLBACK?.trim() || 'https://ipinfo.io/json',
  ipapiCoUrlTemplate: process.env.IPAPI_CO_URL_TEMPLATE?.trim() || 'https://ipapi.co/{ip}/json/',
  ipapiCoUrlFallback: process.env.IPAPI_CO_URL_FALLBACK?.trim() || 'https://ipapi.co/json/',
  enableIpinfoIo: process.env.ENABLE_IPINFO_IO?.trim().toLowerCase() === 'true',
  enableIpapiCo: process.env.ENABLE_IPAPI_CO?.trim().toLowerCase() === 'true',
  enableIpwhoIs: process.env.ENABLE_IPWHO_IS?.trim().toLowerCase() === 'true',
  dummyPasswordHash:
    process.env.DUMMY_PASSWORD_HASH?.trim() ||
    '$2b$12$kBdayC1Q/sgRqxBzBn1u6OxfBuHHqqSQ/roJTvkTua.U9/o3pDP6K',
  registrationProfileCaptureEnabled:
    process.env.REGISTRATION_PROFILE_CAPTURE_ENABLED?.trim().toLowerCase() === 'true',
} as const;

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid username or password.',
  REGISTRATION_FAILED: 'Unable to create the account with the provided credentials.',
  SESSION_REFRESH_FAILED: 'Session could not be refreshed. Please sign in again.',
} as const;

// ============================================================================
// VALIDATION & SANITIZATION
// ============================================================================

export type FileCategory = 'photo' | 'video' | 'audio' | 'document' | 'other-files';
export type EncryptedCategory =
  'note' | 'chat' | 'todo' | 'password' | 'secret' | 'location' | 'contact';
export type VaultCategory = FileCategory | EncryptedCategory;
export type VaultCategoryAlias =
  | VaultCategory
  | 'notes'
  | 'chats'
  | 'passwords'
  | 'todos'
  | 'secretKeys'
  | 'secrets'
  | 'contacts'
  | 'locations'
  | 'photos'
  | 'videos'
  | 'audios'
  | 'documents'
  | 'files';

/**
 * Input structure for authentication operations
 */
export interface AuthInput {
  username: unknown;
  password: unknown;
  email?: unknown;
  fullName?: unknown;
  masterKey?: unknown;
  pqcSalt?: unknown;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: unknown;
  websiteMetadata?: Record<string, unknown>;
}

/**
 * Input for capturing geolocation data during registration
 */
export interface RegistrationProfileFetchInput {
  ipAddress?: string;
  username: string;
  userAgent?: string;
  deviceId: string;
  websiteMetadata?: Record<string, unknown>;
}

/**
 * Input for file upload to vault
 */
export interface FileSaveInput {
  userId: string;
  username?: string;
  category: string;
  file: Express.Multer.File;
  folder?: string;
  keepMetadata?: boolean;
  clientUpdatedAt?: string;
  deviceId?: string;
  ipAddress?: string;
}

/**
 * Input for encrypted vault item operations
 */
export interface EncryptedSaveInput {
  userId: string;
  category: string;
  itemId?: string;
  payload: Record<string, unknown>;
  deviceId?: string;
  ipAddress?: string;
}

/**
 * Input for vault item deletion
 */
export interface DeleteInput {
  userId: string;
  category: string;
  itemId: string;
  clientUpdatedAt?: string;
  deviceId?: string;
  ipAddress?: string;
}

/**
 * User document with guaranteed non-null vault state
 * Used internally to ensure type safety
 */
export type UserStateDocument = UserDocument & {
  meta: NonNullable<UserDocument['meta']>;
  vault: NonNullable<UserDocument['vault']>;
  activityLog: NonNullable<UserDocument['activityLog']>;
  loginHistory: NonNullable<UserDocument['loginHistory']>;
  sessions: NonNullable<UserDocument['sessions']>;
};

/**
 * Input for session refresh
 */
export interface RefreshInput {
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Input for session revocation
 */
export interface SessionRevokeInput {
  userId: string;
  currentSessionId?: string;
  targetSessionId?: string;
  targetDeviceId?: string;
  revokeAllOther?: boolean;
  revokeCurrent?: boolean;
  ipAddress?: string;
}

/**
 * Input for password change
 */
export interface PasswordChangeInput {
  userId: string;
  currentPassword: unknown;
  newPassword: unknown;
  ipAddress?: string;
}

/** Supported geolocation providers */
export type RegistrationProfileProvider =
  | 'free.freeipapi.com'
  | 'ipwho.is'
  | 'ipwhois.app'
  | 'ip-api.com'
  | 'api.ipgeolocation.io'
  | 'iplocate.io'
  | 'ipinfo.io'
  | 'ipapi.co'
  | 'disabled';

/**
 * Snapshot of registration profile data
 * Contains geolocation and device information captured at registration
 */
export interface RegistrationProfileSnapshot {
  provider: RegistrationProfileProvider | string;
  url: string | null;
  fetchedAt: Date;
  data: Record<string, unknown> | null;
  error: string | null;
}

export interface StoredRegistrationProfileSnapshot {
  provider: string;
  url: null;
  fetchedAt: Date;
  data: {
    clientIp?: string;
    requestIp?: string;
    isLoopbackIp?: boolean;
    isPrivateIp?: boolean;
    meta?: Record<string, unknown>;
    providers?: Array<{
      provider: string;
      succeeded: boolean;
      url?: string | null;
      fetchedAt?: Date;
      error?: string | null;
      responseKeys?: string[];
      data?: Record<string, unknown> | null;
    }>;
  } | null;
  error: string | null;
}

/**
 * Sanitizes and validates username input
 * @throws {AppError} If username is invalid
 */
export const sanitizeUsername = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_USERNAME', 'Username must be at least 3 characters.');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 64) {
    throw new AppError(400, 'INVALID_USERNAME', 'Username must be between 3 and 64 characters.');
  }

  if (!/^[a-z0-9._-]+$/i.test(normalized)) {
    throw new AppError(
      400,
      'INVALID_USERNAME',
      'Username may only contain letters, numbers, dots, underscores, and hyphens.',
    );
  }

  return normalized;
};

/**
 * Validates password meets minimum security requirements
 * @throws {AppError} If password is too weak
 */
export const STRONG_PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+=\[\];:,.<>?{}|\-])\S+$/;
export const MIN_PASSWORD_LENGTH = 16;
export const MAX_PASSWORD_LENGTH = 64;

export const sanitizePassword = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_PASSWORD', 'Password is required.');
  }

  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(
      400,
      'INVALID_PASSWORD',
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  if (!STRONG_PASSWORD_PATTERN.test(value)) {
    throw new AppError(
      400,
      'INVALID_PASSWORD',
      'Password must include uppercase, lowercase, number, and special character, and cannot contain spaces.',
    );
  }

  return value;
};

/**
 * Normalizes device identifier, defaults to 'unknown-device'
 */
export const asDeviceId = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : 'unknown-device';

/**
 * Checks if registration profile capture is enabled
 */
export const isRegistrationProfileCaptureEnabled = (): boolean => {
  const raw = process.env.REGISTRATION_PROFILE_CAPTURE_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

/**
 * Normalizes client IP address, stripping IPv6 wrapping and filtering private ranges
 * Returns null for private/local IPs
 */
export const normalizeClientIp = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/^::ffff:/, '').trim();
  if (
    !normalized ||
    normalized.toLowerCase() === 'unknown' ||
    normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return null;
  }

  return normalized;
};

/**
 * Builds URL from template by replacing placeholders with values
 */
export const buildRegistrationLookupUrl = (
  template: string,
  replacements: Record<string, string>,
): string =>
  Object.entries(replacements).reduce(
    (url, [key, value]) => url.replaceAll(`{${key}}`, encodeURIComponent(value)),
    template,
  );

/**
 * Sanitizes URLs by redacting sensitive parameters (API keys, tokens)
 */
export const sanitizeRegistrationLookupUrl = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    for (const key of ['apiKey', 'apikey', 'access_key', 'token']) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, 'REDACTED');
      }
    }
    return parsed.toString();
  } catch {
    return value.replace(/([?&](?:apiKey|apikey|access_key|token)=)[^&]+/gi, '$1REDACTED');
  }
};

/**
 * Safely converts unknown value to registration profile data record
 */
export const asRegistrationProfileData = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return { ...(value as Record<string, unknown>) };
};

export const isLoopbackIp = (value: string | undefined): boolean =>
  value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';

export const isPrivateIp = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  if (isLoopbackIp(value)) {
    return true;
  }

  return (
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value) ||
    /^fc00:/i.test(value) ||
    /^fd00:/i.test(value) ||
    /^fe80:/i.test(value)
  );
};

export const buildStoredRegistrationProfile = (
  snapshot: RegistrationProfileSnapshot,
): StoredRegistrationProfileSnapshot => {
  const rawData = asRegistrationProfileData(snapshot.data);
  const rawSources =
    rawData && typeof rawData.sources === 'object' && rawData.sources !== null
      ? (rawData.sources as Record<string, unknown>)
      : null;

  return {
    provider: snapshot.provider,
    url: null,
    fetchedAt: snapshot.fetchedAt,
    data: rawData
      ? {
          clientIp: typeof rawData.clientIp === 'string' ? rawData.clientIp : undefined,
          requestIp: typeof rawData.requestIp === 'string' ? rawData.requestIp : undefined,
          isLoopbackIp:
            typeof rawData.clientIp === 'string' ? isLoopbackIp(rawData.clientIp) : undefined,
          isPrivateIp:
            typeof rawData.clientIp === 'string' ? isPrivateIp(rawData.clientIp) : undefined,
          meta:
            rawData.meta && typeof rawData.meta === 'object'
              ? (rawData.meta as Record<string, unknown>)
              : undefined,
          providers: rawSources
            ? Object.entries(rawSources).map(([provider, value]) => {
                const entry =
                  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
                return {
                  provider,
                  succeeded: Boolean(entry.data),
                  url: typeof entry.url === 'string' ? entry.url : null,
                  fetchedAt:
                    entry.fetchedAt instanceof Date
                      ? entry.fetchedAt
                      : typeof entry.fetchedAt === 'string'
                        ? new Date(entry.fetchedAt)
                        : undefined,
                  error: typeof entry.error === 'string' ? entry.error : null,
                  responseKeys:
                    entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
                      ? Object.keys(entry.data as Record<string, unknown>)
                      : [],
                  data: asRegistrationProfileData(entry.data),
                };
              })
            : undefined,
        }
      : null,
    error: snapshot.error,
  };
};

/**
 * Validates and returns item ID or throws error
 * @throws {AppError} If itemId is invalid
 */
export const sanitizeItemId = (value: string | undefined): string | undefined => {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > CONFIG.maxItemIdLength ||
    !/^[a-zA-Z0-9:_-]+$/.test(value)
  ) {
    throw new AppError(400, 'INVALID_ITEM_ID', 'Item identifier is invalid.');
  }

  return value;
};

/**
 * Sanitizes and validates required text field
 * @throws {AppError} If text is invalid or exceeds max length
 */
export const sanitizeRequiredText = (
  value: unknown,
  fieldName: string,
  maxLength = CONFIG.maxTextFieldLength,
): string => {
  if (typeof value !== 'string') {
    throw new AppError(400, `INVALID_${fieldName.toUpperCase()}`, `${fieldName} is required.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new AppError(400, `INVALID_${fieldName.toUpperCase()}`, `${fieldName} cannot be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new AppError(
      400,
      `INVALID_${fieldName.toUpperCase()}`,
      `${fieldName} must be ${maxLength} characters or fewer.`,
    );
  }

  return normalized;
};

/**
 * Sanitizes optional text field, returns empty string if not provided
 * @throws {AppError} If text exceeds max length
 */
export const sanitizeOptionalText = (
  value: unknown,
  fieldName: string,
  maxLength = CONFIG.maxTextFieldLength,
): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length > maxLength) {
    throw new AppError(
      400,
      `INVALID_${fieldName.toUpperCase()}`,
      `${fieldName} must be ${maxLength} characters or fewer.`,
    );
  }

  return normalized;
};

/**
 * Validates and normalizes URL, ensuring http/https protocol
 * @throws {AppError} If URL is invalid
 */
export const sanitizeOptionalUrl = (value: unknown): string => {
  const normalized = sanitizeOptionalText(value, 'url', CONFIG.maxTextFieldLength);
  if (!normalized) {
    return '';
  }

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
    return parsed.toString();
  } catch {
    throw new AppError(400, 'INVALID_URL', 'URL must be a valid http or https address.');
  }
};

export const normalizeVaultCategoryAlias = (category: string): VaultCategory => {
  switch (category) {
    case 'notes':
      return 'note';
    case 'chats':
      return 'chat';
    case 'todos':
      return 'todo';
    case 'passwords':
      return 'password';
    case 'secretKeys':
    case 'secrets':
      return 'secret';
    case 'contacts':
      return 'contact';
    case 'locations':
      return 'location';
    case 'photos':
      return 'photo';
    case 'videos':
      return 'video';
    case 'audios':
      return 'audio';
    case 'documents':
      return 'document';
    case 'files':
      return 'other-files';
    default:
      return category as VaultCategory;
  }
};

/**
 * Parses date string, returns current date if invalid
 */
export const normalizeDate = (value?: string): Date => {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Determines if incoming update should be applied (timestamp-based conflict detection)
 */
export const isIncomingUpdateAllowed = (
  existingUpdatedAt: Date,
  incomingUpdatedAt: Date,
): boolean => {
  return incomingUpdatedAt.getTime() >= existingUpdatedAt.getTime();
};

/**
 * Ensures user document has all required state fields initialized
 * Returns typed UserStateDocument for type safety
 */
export const withUserState = (user: UserDocument): UserStateDocument => {
  // Initialize meta if missing
  if (!user.meta) {
    Object.assign(user, {
      meta: {
        registeredAt: null,
        lastLoginAt: null,
        lastFailedLoginAt: null,
        lastFailedLoginIp: null,
        lastSyncAt: null,
        lastCredentialChangeAt: null,
        activeDevices: [],
        accountStatus: 'active',
        profileVersion: 2,
      },
    });
  }

  // Initialize vault if missing
  if (!user.vault) {
    Object.assign(user, {
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
        location: [],
        contact: [],
        otherFiles: [],
      },
    });
  }

  // Initialize activityLog if missing
  if (!user.activityLog) {
    Object.assign(user, { activityLog: [] });
  }

  // Initialize loginHistory if missing
  if (!user.loginHistory) {
    Object.assign(user, { loginHistory: [] });
  }

  // Initialize sessions if missing
  if (!user.sessions) {
    Object.assign(user, { sessions: [] });
  }

  return user as UserStateDocument;
};

/**
 * Hashes refresh token for secure storage comparison
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Validates and sanitizes session ID
 * @throws {AppError} If sessionId is invalid
 */
export const sanitizeSessionId = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 128 ||
    !/^[a-zA-Z0-9:_-]+$/.test(value)
  ) {
    throw new AppError(400, 'INVALID_SESSION_ID', 'Session identifier is invalid.');
  }

  return value.trim();
};

/**
 * Removes expired and old revoked sessions from user state
 * Keeps revoked sessions for SESSION_RETENTION_MS to maintain audit trail
 */
export const pruneExpiredSessions = (user: UserStateDocument, now = new Date()): void => {
  const retentionCutoff = now.getTime() - CONFIG.sessionRetentionMs;
  user.sessions = user.sessions.filter((session) => {
    const revokedAt = session.revokedAt instanceof Date ? session.revokedAt.getTime() : null;
    const expiresAt = session.expiresAt instanceof Date ? session.expiresAt.getTime() : 0;

    // Keep non-expired sessions
    if (expiresAt > now.getTime()) {
      return true;
    }

    // Discard old revoked sessions
    if (revokedAt == null) {
      return false;
    }

    // Keep recent revoked sessions for audit
    return revokedAt >= retentionCutoff;
  }) as never;
};

/**
 * Syncs active devices list from current valid sessions
 * Limits to MAX_ACTIVE_DEVICES
 */
export const syncActiveDevicesFromSessions = (user: UserStateDocument): void => {
  const now = Date.now();
  user.meta.activeDevices = Array.from(
    new Set(
      user.sessions
        .filter(
          (session) =>
            !session.revokedAt &&
            session.expiresAt instanceof Date &&
            session.expiresAt.getTime() > now,
        )
        .map((session) => session.deviceId),
    ),
  ).slice(-CONFIG.maxActiveDevices) as never;
};

/**
 * Builds summaries of active sessions for client response
 * Filters expired/revoked sessions and sorts by recent usage
 */
export const buildSessionSummaries = (user: UserStateDocument, currentSessionId?: string) =>
  [...user.sessions]
    .filter((session) => {
      const expiresAt = session.expiresAt instanceof Date ? session.expiresAt.getTime() : 0;
      return !session.revokedAt && expiresAt > Date.now();
    })
    .sort(
      (a, b) =>
        (b.lastUsedAt instanceof Date ? b.lastUsedAt.getTime() : 0) -
        (a.lastUsedAt instanceof Date ? a.lastUsedAt.getTime() : 0),
    )
    .map((session) => ({
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isCurrent: session.sessionId === currentSessionId,
    }));

/**
 * Issues or rotates a user session, returning tokens and session info
 * Performs session pruning and device sync after issuance
 */
export const issueUserSession = (
  user: UserStateDocument,
  input: {
    deviceId: string;
    ipAddress?: string;
    userAgent?: string;
    existingSessionId?: string;
    deviceName?: string;
  },
): {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getRefreshCookieMaxAgeMs());
  const sessionId = input.existingSessionId || randomUUID();

  const refreshToken = createRefreshToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
    deviceId: input.deviceId,
  });
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const accessToken = createAccessToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
  });

  const existingIndex = user.sessions.findIndex((session) => session.sessionId === sessionId);
  const existingSession = existingIndex >= 0 ? user.sessions[existingIndex] : null;

  const nextSession = {
    sessionId,
    deviceId: input.deviceId,
    deviceName: input.deviceName ?? existingSession?.deviceName ?? '',
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

  if (existingIndex >= 0) {
    const existingSession = user.sessions[existingIndex];
    user.sessions[existingIndex] = {
      ...existingSession,
      ...nextSession,
      createdAt: existingSession.createdAt instanceof Date ? existingSession.createdAt : now,
    } as never;
  } else {
    user.sessions.unshift(nextSession as never);
  }

  pruneExpiredSessions(user, now);
  syncActiveDevicesFromSessions(user);

  return {
    sessionId,
    accessToken,
    refreshToken,
    expiresAt,
  };
};

/**
 * Adds login attempt to user's login history
 * Preserves only recent MAX_LOGIN_HISTORY entries
 */
export const pushLoginHistory = (user: UserDocument, entry: Record<string, unknown>): void => {
  const currentUser = withUserState(user);
  currentUser.loginHistory.unshift(entry as never);
  if (currentUser.loginHistory.length > CONFIG.maxLoginHistory) {
    currentUser.loginHistory.splice(CONFIG.maxLoginHistory);
  }
};

/**
 * Updates user's last sync timestamp and overall updatedAt
 */
export const touchUser = (user: UserDocument, updatedAt: Date): void => {
  const currentUser = withUserState(user);
  currentUser.updatedAt = updatedAt;
  currentUser.meta.lastSyncAt = updatedAt;
};

/**
 * Builds structured conflict response for concurrent update scenarios
 */
export const buildConflictResponse = (message: string, serverRecord: unknown) => ({
  applied: false,
  conflict: true,
  message,
  serverRecord,
});

export type ConflictResponse = ReturnType<typeof buildConflictResponse>;

export type SaveEncryptedVaultItemResult =
  | ConflictResponse
  | {
      applied: true;
      conflict: false;
      category: EncryptedCategory;
      itemId: string;
      record: Record<string, unknown>;
    };

export type DeleteVaultItemResult =
  | ConflictResponse
  | {
      applied: true;
      conflict: false;
      category: VaultCategory;
      itemId: string;
      deletedAt: Date;
    };

/**
 * Retrieves the vault array for a given category
 * Ensures compatibility with MongoDB document arrays
 */
export const pickVaultArray = (user: UserDocument, category: VaultCategory): Array<any> => {
  const stateUser = withUserState(user);
  const vaultKey =
    category === 'photo'
      ? 'photos'
      : category === 'video'
        ? 'videos'
        : category === 'audio'
          ? 'audios'
          : category === 'document'
            ? 'documents'
            : category === 'other-files'
              ? 'otherFiles'
              : category === 'note'
                ? 'notes'
                : category === 'todo'
                  ? 'todos'
                  : category === 'password'
                    ? 'passwords'
                    : category === 'secret'
                      ? 'secretKeys'
                      : category;
  const vaultArray = stateUser.vault[vaultKey as keyof typeof stateUser.vault];
  return Array.isArray(vaultArray) ? vaultArray : [];
};

/**
 * Transforms user document into public-safe profile object
 * Excludes sensitive fields like password and raw sessions
 */
export const publicUser = (user: UserDocument) => {
  const currentUser = withUserState(user);
  return {
    id: currentUser._id.toString(),
    username: currentUser.username,
    twoFactorEnabled: currentUser.twoFactorEnabled,
    createdAt: currentUser.createdAt,
    updatedAt: currentUser.updatedAt,
    meta: currentUser.meta,
    sessions: buildSessionSummaries(currentUser),
  };
};

/**
 * Normalizes filename to safe value, truncates to max length
 */
export const normalizeFileName = (value: string | undefined): string => {
  const baseName = path.basename(value || 'unnamed').trim() || 'unnamed';
  return baseName.slice(0, CONFIG.maxFileNameLength);
};

/**
 * Logs activity event and emits vault change notification via WebSocket
 * Builds audit trail for user actions
 */
export const logAndEmit = (
  user: UserDocument,
  action: string,
  category: string,
  itemId: string | null,
  details: Record<string, unknown>,
): void => {
  const createdAt = new Date();

  // Use the isolated activityLogService instead of the legacy in-document logging
  saveActivityLog({
    userId: user._id.toString(),
    username: user.username,
    action,
    category,
    itemId,
    deviceId: typeof details.deviceId === 'string' ? details.deviceId : 'unknown-device',
    ipAddress: typeof details.ipAddress === 'string' ? details.ipAddress : 'unknown',
    userAgent: typeof details.userAgent === 'string' ? details.userAgent : 'unknown',
    status:
      details.status === 'FAILURE' || details.status === 'PARTIAL' ? details.status : 'SUCCESS',
    errorCode: typeof details.errorCode === 'string' ? details.errorCode : undefined,
    errorMessage: typeof details.errorMessage === 'string' ? details.errorMessage : undefined,
    details,
  }).catch((err) => {
    logger.error('Failed to save activity log in logAndEmit', { error: err.message });
  });

  // Emit real-time event to connected clients
  try {
    emitVaultEvent(user._id.toString(), 'vault:changed', {
      action,
      category,
      itemId,
      updatedAt: createdAt.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to emit vault event', {
      userId: user._id.toString(),
      action,
      category,
      error,
    });
  }
};

/**
 * Validates vault category string is one of allowed types
 * @throws {AppError} If category is not recognized
 */
export const validateVaultCategory = (category: string): VaultCategory => {
  const normalized = normalizeVaultCategoryAlias(category);

  if (FILE_CATEGORIES.has(normalized as FileCategory)) {
    return normalized as FileCategory;
  }

  if (ENCRYPTED_CATEGORIES.has(normalized as EncryptedCategory)) {
    return normalized as EncryptedCategory;
  }

  throw new AppError(400, 'UNSUPPORTED_CATEGORY', 'Unsupported vault category.');
};

export const USER_STORAGE_QUOTA_MB = Math.max(1, Number(process.env.USER_STORAGE_QUOTA_MB || 2048));
export const USER_STORAGE_QUOTA_BYTES = USER_STORAGE_QUOTA_MB * 1024 * 1024;

export const getUserStoredBytes = async (userId: string, username: string) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const aggregate = await DynamicVaultModel.aggregate([
    { $match: { userId, isDeleted: false } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$metadata.size', 0] } } } },
  ]).allowDiskUse(true);
  return Number(aggregate?.[0]?.total || 0);
};

export const enforceUserStorageQuota = async (
  userId: string,
  username: string,
  incomingBytes: number,
) => {
  const usedBytes = await getUserStoredBytes(userId, username);
  if (usedBytes + incomingBytes > USER_STORAGE_QUOTA_BYTES) {
    throw new AppError(
      413,
      'USER_STORAGE_QUOTA_EXCEEDED',
      `Upload exceeds your storage quota of ${USER_STORAGE_QUOTA_MB}MB.`,
    );
  }
};

/**
 * Fetches user by ID, ensuring all state fields exist
 * @throws {AppError} If user not found
 */
export const getUserOrThrow = async (
  userId: string,
  _includePassword = false,
): Promise<UserStateDocument> => {
  const query = User.findById(userId);
  query.select('+password +masterKey');

  const user = await query.exec();
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
  }

  return withUserState(user);
};

/**
 * Encrypts optional text if provided, returns null otherwise
 */
export const encryptOptionalText = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const encrypted = encryptText(value.trim());
  return typeof encrypted === 'string' ? encrypted : null;
};

/**
 * Executes operation with MongoDB storage failover support
 * Automatically switches to next available MongoDB instance on storage full
 * @throws {AppError} If failover exhausted or storage full
 */
export const executeWithStorageFailover = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isStorageFullError(error)) {
      throw error;
    }

    logger.warn('Storage full on primary MongoDB, attempting failover', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const switched = await switchToNextMongoUri();
    if (!switched) {
      throw new AppError(
        507,
        'STORAGE_FULL',
        'All configured MongoDB storage targets are full or unavailable. Add another Mongo URL or free storage space.',
      );
    }

    try {
      return await operation();
    } catch (retryError) {
      if (isStorageFullError(retryError)) {
        throw new AppError(
          507,
          'STORAGE_FULL',
          'MongoDB storage is full on the active and failover targets. Configure a working MONGODB_URI_1 / _2 / _3 or free Atlas storage.',
        );
      }

      throw new AppError(
        503,
        'DB_UNAVAILABLE',
        'MongoDB failover target could not be reached. Check whether MONGODB_URI_1 / _2 / _3 are valid direct Atlas URIs.',
      );
    }
  }
};

/**
 * Fetches geolocation profile from a single provider with timeout
 * Returns profile snapshot with success or error information
 */
export const fetchProviderProfile = async (
  provider:
    | 'free.freeipapi.com'
    | 'ipwho.is'
    | 'ipwhois.app'
    | 'ip-api.com'
    | 'api.ipgeolocation.io'
    | 'iplocate.io'
    | 'ipinfo.io'
    | 'ipapi.co',
  url: string,
  userAgent?: string,
): Promise<RegistrationProfileSnapshot> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.registrationProfileTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
      headers: {
        'User-Agent': userAgent || 'Vault Server/1.0',
      },
    });

    let payload: unknown = null;
    try {
      if (
        response.headers.get('Content-Type')?.includes('application/json') ||
        (response.status >= 400 && response.status < 600)
      ) {
        payload = await response.json();
      }
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        provider,
        url: sanitizeRegistrationLookupUrl(url),
        fetchedAt: new Date(),
        data: payload as Record<string, unknown> | null,
        error:
          payload &&
          typeof (payload as Record<string, unknown>).message === 'string' &&
          ((payload as Record<string, unknown>).message as string).trim()
            ? ((payload as Record<string, unknown>).message as string)
            : `Lookup failed with status ${response.status}.`,
      };
    }

    if (
      (provider === 'ipwho.is' || provider === 'ipwhois.app') &&
      (payload as Record<string, unknown>)?.success === false
    ) {
      return {
        provider,
        url: sanitizeRegistrationLookupUrl(url),
        fetchedAt: new Date(),
        data: payload as Record<string, unknown> | null,
        error:
          payload &&
          typeof (payload as Record<string, unknown>).message === 'string' &&
          ((payload as Record<string, unknown>).message as string).trim()
            ? ((payload as Record<string, unknown>).message as string)
            : 'Lookup failed at ipwho.is.',
      };
    }

    return {
      provider,
      url,
      fetchedAt: new Date(),
      data: payload as Record<string, unknown> | null,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Registration profile lookup failed.';

    logger.warn('Geolocation provider request failed', {
      provider,
      error: message,
    });

    return {
      provider,
      url,
      fetchedAt: new Date(),
      data: null,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchRegistrationProfile = async (
  input: RegistrationProfileFetchInput,
): Promise<RegistrationProfileSnapshot> => {
  if (!isRegistrationProfileCaptureEnabled()) {
    return {
      provider: 'disabled',
      url: null,
      fetchedAt: new Date(),
      data: null,
      error: null,
    };
  }

  const normalizedClientIp = normalizeClientIp(input.ipAddress);
  const ua = input.userAgent || 'Vault Server/1.0';

  const providerRequests: Array<Promise<RegistrationProfileSnapshot>> = [
    fetchProviderProfile(
      'free.freeipapi.com',
      normalizedClientIp
        ? buildRegistrationLookupUrl(CONFIG.freeIpApiUrlTemplate, {
            ip: normalizedClientIp,
          })
        : CONFIG.freeIpApiFallback,
      ua,
    ),
    fetchProviderProfile(
      'ipwhois.app',
      normalizedClientIp
        ? buildRegistrationLookupUrl(CONFIG.ipwhoisAppUrlTemplate, {
            ip: normalizedClientIp,
            apiKey: CONFIG.ipwhoisAppApiKey || '',
          })
        : buildRegistrationLookupUrl(CONFIG.ipwhoisAppUrlFallback, {
            apiKey: CONFIG.ipwhoisAppApiKey || '',
          }),
      ua,
    ),
    fetchProviderProfile(
      'ip-api.com',
      normalizedClientIp
        ? buildRegistrationLookupUrl(CONFIG.ipApiComUrlTemplate, {
            ip: normalizedClientIp,
          })
        : CONFIG.ipApiComUrlFallback,
      ua,
    ),
  ];

  if (CONFIG.enableIpwhoIs) {
    providerRequests.splice(
      1,
      0,
      fetchProviderProfile(
        'ipwho.is',
        normalizedClientIp
          ? buildRegistrationLookupUrl(CONFIG.ipwhoisUrlTemplate, {
              ip: normalizedClientIp,
            })
          : CONFIG.ipwhoisUrlFallback,
        ua,
      ),
    );
  }

  if (CONFIG.iplocateIoApiKey) {
    providerRequests.push(
      fetchProviderProfile(
        'iplocate.io',
        normalizedClientIp
          ? buildRegistrationLookupUrl(CONFIG.iplocateIoUrlTemplate, {
              apiKey: CONFIG.iplocateIoApiKey,
              ip: normalizedClientIp,
            })
          : buildRegistrationLookupUrl(CONFIG.iplocateIoUrlFallback, {
              apiKey: CONFIG.iplocateIoApiKey,
            }),
        ua,
      ),
    );
  }

  if (CONFIG.ipGeolocationApiKey) {
    providerRequests.push(
      fetchProviderProfile(
        'api.ipgeolocation.io',
        normalizedClientIp
          ? buildRegistrationLookupUrl(CONFIG.ipgeolocationUrlTemplate, {
              apiKey: CONFIG.ipGeolocationApiKey,
              ip: normalizedClientIp,
            })
          : buildRegistrationLookupUrl(CONFIG.ipgeolocationUrlFallback, {
              apiKey: CONFIG.ipGeolocationApiKey,
            }),
        ua,
      ),
    );
  }

  if (CONFIG.enableIpinfoIo) {
    providerRequests.push(
      fetchProviderProfile(
        'ipinfo.io',
        normalizedClientIp
          ? buildRegistrationLookupUrl(CONFIG.ipinfoIoUrlTemplate, {
              ip: normalizedClientIp,
            })
          : CONFIG.ipinfoIoUrlFallback,
        ua,
      ),
    );
  }

  if (CONFIG.enableIpapiCo) {
    providerRequests.push(
      fetchProviderProfile(
        'ipapi.co',
        normalizedClientIp
          ? buildRegistrationLookupUrl(CONFIG.ipapiCoUrlTemplate, {
              ip: normalizedClientIp,
            })
          : CONFIG.ipapiCoUrlFallback,
        ua,
      ),
    );
  }

  const results = await Promise.all(providerRequests);
  const sources = Object.fromEntries(
    results.map((result) => {
      if (result.error) {
        logger.warn('Registration profile lookup failed', {
          provider: result.provider,
          error: result.error,
          url: sanitizeRegistrationLookupUrl(result.url),
        });
      }

      return [
        result.provider,
        {
          url: sanitizeRegistrationLookupUrl(result.url),
          fetchedAt: result.fetchedAt,
          data: asRegistrationProfileData(result.data),
          error: result.error,
        },
      ];
    }),
  );

  const successfulProviders = results.filter((result) => result.data);
  const latestFetchedAt = results.reduce(
    (latest, current) =>
      current.fetchedAt.getTime() > latest.getTime() ? current.fetchedAt : latest,
    results[0]?.fetchedAt ?? new Date(),
  );

  const profileData = {
    clientIp: normalizedClientIp ?? input.ipAddress ?? 'unknown',
    requestIp: input.ipAddress ?? 'unknown',
    meta: {
      username: input.username,
      deviceId: input.deviceId,
      userAgent: input.userAgent ?? 'unknown',
      website: input.websiteMetadata || null,
      capturedAt: latestFetchedAt,
      successfulProviders: successfulProviders.length,
      failedProviders: results.length - successfulProviders.length,
    },
    sources,
  };

  return {
    provider: results.map((result) => result.provider).join(','),
    url: null,
    fetchedAt: latestFetchedAt,
    data: profileData,
    error:
      successfulProviders.length > 0
        ? null
        : results
            .map((result) => result.error)
            .filter(Boolean)
            .join(' | ') || 'Registration profile lookup failed.',
  };
};

export const fetchRegistrationProfileWithTimeout = async (
  input: RegistrationProfileFetchInput,
  timeoutMs = CONFIG.registrationProfileTimeoutMs,
): Promise<RegistrationProfileSnapshot> => {
  try {
    return await Promise.race([
      fetchRegistrationProfile(input),
      new Promise<RegistrationProfileSnapshot>((_, reject) =>
        setTimeout(
          () => reject(new Error('Registration profile fetch timed out after ' + timeoutMs + 'ms')),
          timeoutMs,
        ),
      ),
    ]);
  } catch (error) {
    logger.warn('Registration profile fetch failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      provider: 'disabled',
      url: null,
      fetchedAt: new Date(),
      data: null,
      error: error instanceof Error ? error.message : 'Profile fetch timed out',
    };
  }
};
export const isVersionConflictError = (error: unknown): boolean => {
  const candidate = error as { name?: string };
  return candidate?.name === 'VersionError';
};

/**
 * Executes a user mutation with optimistic concurrency retry logic
 * Retries on version conflicts up to MAX_USER_WRITE_RETRIES times
 * Automatically saves changes unless skipSave is set
 *
 * @template T Return type of the operation
 */
export const retryLoadedUserMutation = async <T>(input: {
  loadUser: () => Promise<UserStateDocument>;
  operation: (user: UserStateDocument) => Promise<{ result: T; skipSave?: boolean }>;
  mutationName: string;
}): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CONFIG.maxUserWriteRetries; attempt += 1) {
    const user = await input.loadUser();

    try {
      const outcome = await input.operation(user);
      if (!outcome.skipSave) {
        await executeWithStorageFailover(() => user.save());
      }
      return outcome.result;
    } catch (error) {
      lastError = error;
      if (!isVersionConflictError(error) || attempt === CONFIG.maxUserWriteRetries) {
        throw error;
      }

      logger.warn('Optimistic concurrency conflict, retrying user mutation', {
        mutationName: input.mutationName,
        attempt,
        maxRetries: CONFIG.maxUserWriteRetries,
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AppError(
        409,
        'WRITE_CONFLICT',
        'The request conflicted with another update. Please retry.',
      );
};
