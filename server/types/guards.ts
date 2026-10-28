/**
 * Runtime Type Guards and Type Narrowing Utilities
 *
 * Provides production-grade type assertions and type narrowing functions
 * to validate untrusted objects before using them as strongly-typed models.
 */

import type {
  AccessTokenPayload,
  AuthenticatedUser,
  MfaTokenPayload,
  RefreshTokenPayload,
} from './auth.ts';
import type {
  EncryptedCategory,
  EncryptedEnvelopePayload,
  EncryptedFieldPayload,
  FileCategory,
  VaultCategory,
} from './vault.ts';
import type { ApiErrorResponse, ApiSuccessResponse } from './api.ts';
import type { SecurityContext } from './security.ts';

/**
 * Checks if a value is a non-null, non-array object
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Checks if a value is a non-empty string
 */
export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * Validates if an untrusted object matches the AES-256-GCM EncryptedFieldPayload structure
 */
export const isEncryptedFieldPayload = (value: unknown): value is EncryptedFieldPayload => {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.cipherText) &&
    isNonEmptyString(value.iv) &&
    isNonEmptyString(value.authTag)
  );
};

/**
 * Validates if an untrusted object conforms to the modern Envelope Encryption structure
 */
export const isEncryptedEnvelopePayload = (value: unknown): value is EncryptedEnvelopePayload => {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.cipherText) &&
    isNonEmptyString(value.iv) &&
    isNonEmptyString(value.authTag) &&
    isNonEmptyString(value.wrappedDek) &&
    isNonEmptyString(value.wrapIv) &&
    isNonEmptyString(value.wrapTag) &&
    isNonEmptyString(value.keyVersion) &&
    isNonEmptyString(value.keyId) &&
    (value.algorithm === 'aes-256-gcm' || value.algorithm === 'chacha20-poly1305')
  );
};

/**
 * Validates if an object conforms to the AuthenticatedUser contract
 */
export const isAuthenticatedUser = (value: unknown): value is AuthenticatedUser => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.userId) && isNonEmptyString(value.username);
};

/**
 * Validates if a decoded JWT payload is an AccessTokenPayload
 */
export const isAccessTokenPayload = (value: unknown): value is AccessTokenPayload => {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.sub) &&
    isNonEmptyString(value.username) &&
    isNonEmptyString(value.sessionId) &&
    value.type === 'access'
  );
};

/**
 * Validates if a decoded JWT payload is a RefreshTokenPayload
 */
export const isRefreshTokenPayload = (value: unknown): value is RefreshTokenPayload => {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.sub) &&
    isNonEmptyString(value.username) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.deviceId) &&
    value.type === 'refresh'
  );
};

/**
 * Validates if a decoded JWT payload is an MfaTokenPayload
 */
export const isMfaTokenPayload = (value: unknown): value is MfaTokenPayload => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.sub) && isNonEmptyString(value.username) && value.type === 'mfa';
};

const VAULT_CATEGORIES_SET = new Set<string>([
  'photo',
  'video',
  'audio',
  'document',
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'contact',
  'location',
  'file',
  'other-files',
  'other',
  'settings',
  'system',
  'users',
  'card',
  'identity',
  'wifi',
]);

const FILE_CATEGORIES_SET = new Set<string>([
  'photo',
  'video',
  'audio',
  'document',
  'other-files',
  'file',
]);

const ENCRYPTED_CATEGORIES_SET = new Set<string>([
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'contact',
  'location',
  'settings',
  'system',
  'users',
  'card',
  'identity',
  'wifi',
]);

/**
 * Checks if a string is a valid VaultCategory
 */
export const isVaultCategory = (value: unknown): value is VaultCategory => {
  return typeof value === 'string' && VAULT_CATEGORIES_SET.has(value);
};

/**
 * Checks if a string is a valid FileCategory
 */
export const isFileCategory = (value: unknown): value is FileCategory => {
  return typeof value === 'string' && FILE_CATEGORIES_SET.has(value);
};

/**
 * Checks if a string is a valid EncryptedCategory
 */
export const isEncryptedCategory = (value: unknown): value is EncryptedCategory => {
  return typeof value === 'string' && ENCRYPTED_CATEGORIES_SET.has(value);
};

/**
 * Checks if a response object matches the ApiSuccessResponse shape
 */
export const isApiSuccessResponse = <T>(value: unknown): value is ApiSuccessResponse<T> => {
  if (!isRecord(value)) return false;
  return value.success === true && typeof value.message === 'string' && 'data' in value;
};

/**
 * Checks if a response object matches the ApiErrorResponse shape
 */
export const isApiErrorResponse = (value: unknown): value is ApiErrorResponse => {
  if (!isRecord(value)) return false;
  if (value.success !== false || typeof value.message !== 'string') return false;
  if (!isRecord(value.error)) return false;
  return isNonEmptyString(value.error.code);
};

/**
 * Checks if an object conforms to the SecurityContext structure
 */
export const isSecurityContext = (value: unknown): value is SecurityContext => {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.fingerprint) &&
    typeof value.riskScore === 'number' &&
    Array.isArray(value.anomalies) &&
    (value.recommendedAction === 'allow' ||
      value.recommendedAction === 'challenge' ||
      value.recommendedAction === 'block')
  );
};
