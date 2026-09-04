import { toast } from 'sonner';
import { logActivity } from './activity';
import { logger } from './logger';

/**
 * Centralized application error codes.
 *
 * IMPORTANT:
 * These codes are safe application-level identifiers.
 * Never expose raw backend/database/crypto errors directly to users.
 */
export enum ErrorCode {
  AUTH_FAILED = 'auth/failed',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  AUTH_SAME_CREDENTIALS = 'AUTH_SAME_CREDENTIALS',
  AUTH_WEAK_PASSWORD = 'AUTH_WEAK_PASSWORD',
  PASSWORD_UNCHANGED = 'PASSWORD_UNCHANGED',
  USER_EXISTS = 'USER_EXISTS',
  TOO_MANY_AUTH_ATTEMPTS = 'TOO_MANY_AUTH_ATTEMPTS',
  CAPTCHA_FAILED = 'CAPTCHA_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  STORAGE_DISCONNECTED = 'storage/disconnected',
  PERMISSION_DENIED = 'permission-denied',
  QUOTA_EXCEEDED = 'quota-exceeded',

  UPLOAD_FAILED = 'upload-failed',
  DOWNLOAD_FAILED = 'download-failed',

  DECRYPTION_FAILED = 'decryption-failed',
  ENCRYPTION_FAILED = 'encryption-failed',

  CSRF_TOKEN_INVALID = 'CSRF_TOKEN_INVALID',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  INVALID_ID = 'INVALID_ID',

  SERVER_OVERLOADED = 'SERVER_OVERLOADED',
  DB_UNAVAILABLE = 'DB_UNAVAILABLE',
  NETWORK_ERROR = 'network-error',

  UNKNOWN = 'unknown',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  originalError?: unknown;
}

export interface HandleErrorOptions {
  silent?: boolean;
  duration?: number;
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_FAILED]:
    'Failed to authenticate with security server. Please check your credentials.',
  [ErrorCode.INVALID_CREDENTIALS]:
    'The username or password provided is incorrect. Please verify your credentials and try again.',
  [ErrorCode.AUTH_SAME_CREDENTIALS]:
    'For zero-knowledge security isolation, Master Key and Account Password must not be identical.',
  [ErrorCode.AUTH_WEAK_PASSWORD]:
    'Password must be 16-64 characters and include uppercase, lowercase, numbers, and special characters.',
  [ErrorCode.PASSWORD_UNCHANGED]: 'The new password must be different from your current password.',
  [ErrorCode.USER_EXISTS]:
    'This username is already registered. Please sign in or select a different username.',
  [ErrorCode.TOO_MANY_AUTH_ATTEMPTS]:
    'Too many failed attempts. For your security, access is temporarily restricted. Please wait before retrying.',
  [ErrorCode.CAPTCHA_FAILED]: 'Security verification failed. Please complete CAPTCHA again.',
  [ErrorCode.SESSION_EXPIRED]:
    'Your cloud session has expired for security. Please sign in with your account password.',
  [ErrorCode.STORAGE_DISCONNECTED]:
    'Storage connection was lost. Please check your internet connection.',
  [ErrorCode.PERMISSION_DENIED]: 'You do not have permission to perform this action.',
  [ErrorCode.QUOTA_EXCEEDED]: 'Storage quota exceeded. Please free some space and try again.',
  [ErrorCode.UPLOAD_FAILED]: 'Failed to upload data to cloud storage.',
  [ErrorCode.DOWNLOAD_FAILED]: 'Failed to download data from cloud storage.',
  [ErrorCode.DECRYPTION_FAILED]:
    'The Master Key provided is incorrect or cannot decrypt this vault. Please verify your exact key.',
  [ErrorCode.ENCRYPTION_FAILED]: 'Failed to securely encrypt the data.',
  [ErrorCode.CSRF_TOKEN_INVALID]: 'Security token expired or is invalid. Please refresh the page.',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'The uploaded file or request exceeds the allowed size limit.',
  [ErrorCode.INVALID_ID]: 'The specified resource identifier is invalid.',
  [ErrorCode.SERVER_OVERLOADED]: 'The server is currently busy. Please try again shortly.',
  [ErrorCode.DB_UNAVAILABLE]: 'Cloud storage is temporarily unavailable. Please try again shortly.',
  [ErrorCode.NETWORK_ERROR]:
    'A network connection issue occurred. Please check your connection and try again.',
  [ErrorCode.UNKNOWN]: 'An unexpected error occurred. Please try again.',
};

/* -------------------------------------------------------------------------- */
/* Type Guards                                                               */
/* -------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isMeaningfulMessage = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;

  const normalized = value.trim();

  if (!normalized) return false;
  if (normalized === '[object Object]') return false;

  return true;
};

const getNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

/* -------------------------------------------------------------------------- */
/* Error Extraction                                                          */
/* -------------------------------------------------------------------------- */

const extractErrorMessage = (error: unknown): string | null => {
  if (!error) return null;

  if (typeof error === 'string') {
    return isMeaningfulMessage(error) ? error.trim() : null;
  }

  if (!isRecord(error)) {
    return null;
  }

  const response = isRecord(error.response) ? error.response : undefined;

  const responseData = response && isRecord(response.data) ? response.data : undefined;

  const data = isRecord(error.data) ? error.data : undefined;

  const nestedError = isRecord(error.error) ? error.error : undefined;

  const candidates: unknown[] = [
    nestedError?.message,
    responseData && isRecord(responseData.error) ? responseData.error.message : undefined,
    responseData?.message,
    data && isRecord(data.error) ? data.error.message : undefined,
    data?.message,
    error.message,
    error.name,
  ];

  for (const candidate of candidates) {
    if (isMeaningfulMessage(candidate)) {
      return candidate.trim();
    }
  }

  return null;
};

const extractErrorCode = (error: unknown): string | number | undefined => {
  if (!isRecord(error)) return undefined;

  const nestedError = isRecord(error.error) ? error.error : undefined;

  const response = isRecord(error.response) ? error.response : undefined;

  const responseData = response && isRecord(response.data) ? response.data : undefined;

  const candidates: unknown[] = [
    error.code,
    nestedError?.code,
    responseData?.code,
    responseData && isRecord(responseData.error) ? responseData.error.code : undefined,
    error.status,
    response?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return candidate;
    }
  }

  return undefined;
};

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

export const classifyError = (error: unknown): ErrorCode => {
  const rawCode = extractErrorCode(error);
  const rawMessage = extractErrorMessage(error) ?? '';

  const code = String(rawCode ?? '').toLowerCase();
  const status = getNumber(rawCode);

  /* 1. Master Key / Decryption (Highest precedence to prevent wrong key from being called generic 401) */
  if (
    rawCode === ErrorCode.DECRYPTION_FAILED ||
    code === 'decryption_failed' ||
    code === 'master_key_incorrect' ||
    /master key is incorrect/i.test(rawMessage) ||
    /candidate salts exhausted/i.test(rawMessage) ||
    /could not be decrypted/i.test(rawMessage) ||
    /decryption failed/i.test(rawMessage) ||
    /bad decrypt/i.test(rawMessage) ||
    /tag mismatch/i.test(rawMessage) ||
    /mac check/i.test(rawMessage) ||
    /operation failed/i.test(rawMessage)
  ) {
    return ErrorCode.DECRYPTION_FAILED;
  }

  /* 2. Password Unchanged */
  if (code === 'password_unchanged' || /new password must be different/i.test(rawMessage)) {
    return ErrorCode.PASSWORD_UNCHANGED;
  }

  /* 3. Same Credentials */
  if (
    rawCode === ErrorCode.AUTH_SAME_CREDENTIALS ||
    code === 'auth_same_credentials' ||
    /must not be identical|same credentials/i.test(rawMessage)
  ) {
    return ErrorCode.AUTH_SAME_CREDENTIALS;
  }

  /* 4. Weak Password */
  if (
    rawCode === ErrorCode.AUTH_WEAK_PASSWORD ||
    code === 'auth_weak_password' ||
    code === 'invalid_password' ||
    /weak password|password requirement|password must/i.test(rawMessage)
  ) {
    return ErrorCode.AUTH_WEAK_PASSWORD;
  }

  /* 5. User Exists */
  if (
    rawCode === ErrorCode.USER_EXISTS ||
    code === 'user_exists' ||
    code === 'registration_failed' ||
    status === 409 ||
    /username already exists|user already exists|already registered/i.test(rawMessage)
  ) {
    return ErrorCode.USER_EXISTS;
  }

  /* 6. Rate Limiting */
  if (
    rawCode === ErrorCode.TOO_MANY_AUTH_ATTEMPTS ||
    code === 'too_many_auth_attempts' ||
    code === 'rate_limited' ||
    code === 'too_many_change_password_attempts' ||
    status === 429 ||
    /too many (attempts|requests)|rate limit/i.test(rawMessage)
  ) {
    return ErrorCode.TOO_MANY_AUTH_ATTEMPTS;
  }

  /* 7. CAPTCHA */
  if (code.includes('captcha') || /captcha/i.test(rawMessage)) {
    return ErrorCode.CAPTCHA_FAILED;
  }

  /* 8. Session Expired */
  if (
    rawCode === ErrorCode.SESSION_EXPIRED ||
    code === 'session_expired' ||
    code === 'session_refresh_failed' ||
    code === 'invalid_token' ||
    code === 'token_expired' ||
    /session.*expired|token.*expired|jwt expired/i.test(rawMessage)
  ) {
    return ErrorCode.SESSION_EXPIRED;
  }

  /* 9. Invalid Credentials */
  if (
    rawCode === ErrorCode.INVALID_CREDENTIALS ||
    code === 'invalid_credentials' ||
    status === 401 ||
    /invalid (username|email|credentials|password)|incorrect (password|credentials|current password)/i.test(
      rawMessage,
    )
  ) {
    return ErrorCode.INVALID_CREDENTIALS;
  }

  /* 10. Generic Auth Failed */
  if (
    rawCode === ErrorCode.AUTH_FAILED ||
    code === 'unauthorized' ||
    /authentication failed|authentication error/i.test(rawMessage)
  ) {
    return ErrorCode.AUTH_FAILED;
  }

  /* 11. CSRF */
  if (
    rawCode === ErrorCode.CSRF_TOKEN_INVALID ||
    code === 'csrf_token_invalid' ||
    code === 'ebadcsrftoken' ||
    /csrf|cross-site request forgery/i.test(rawMessage)
  ) {
    return ErrorCode.CSRF_TOKEN_INVALID;
  }

  /* 12. Payload Too Large */
  if (
    rawCode === ErrorCode.PAYLOAD_TOO_LARGE ||
    code === 'payload_too_large' ||
    code === 'file_too_large' ||
    code === 'limit_file_size' ||
    status === 413 ||
    /payload too large|file too large|request entity too large|exceeds.*size/i.test(rawMessage)
  ) {
    return ErrorCode.PAYLOAD_TOO_LARGE;
  }

  /* 13. Resource ID */
  if (
    rawCode === ErrorCode.INVALID_ID ||
    code === 'invalid_id' ||
    /invalid (id|identifier)|invalid resource identifier|invalid format for field/i.test(rawMessage)
  ) {
    return ErrorCode.INVALID_ID;
  }

  /* 14. Encryption Failed */
  if (
    rawCode === ErrorCode.ENCRYPTION_FAILED ||
    code === 'encryption_failed' ||
    /encryption failed|failed to encrypt|encrypt.*failed/i.test(rawMessage)
  ) {
    return ErrorCode.ENCRYPTION_FAILED;
  }

  /* 15. Storage & Permissions */
  if (
    rawCode === ErrorCode.PERMISSION_DENIED ||
    code === 'storage/unauthorized' ||
    code === 'permission-denied' ||
    code === 'forbidden' ||
    status === 403
  ) {
    return ErrorCode.PERMISSION_DENIED;
  }

  if (
    rawCode === ErrorCode.QUOTA_EXCEEDED ||
    code === 'storage/quota-exceeded' ||
    /quota exceeded|storage quota/i.test(rawMessage)
  ) {
    return ErrorCode.QUOTA_EXCEEDED;
  }

  if (
    rawCode === ErrorCode.STORAGE_DISCONNECTED ||
    /storage disconnected|storage connection lost/i.test(rawMessage)
  ) {
    return ErrorCode.STORAGE_DISCONNECTED;
  }

  /* 16. Upload & Download */
  if (rawCode === ErrorCode.UPLOAD_FAILED || /upload failed|failed to upload/i.test(rawMessage)) {
    return ErrorCode.UPLOAD_FAILED;
  }

  if (
    rawCode === ErrorCode.DOWNLOAD_FAILED ||
    /download failed|failed to download/i.test(rawMessage)
  ) {
    return ErrorCode.DOWNLOAD_FAILED;
  }

  /* 17. Server / Database Unavailable */
  if (
    rawCode === ErrorCode.SERVER_OVERLOADED ||
    code === 'server_overloaded' ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /server overloaded|service unavailable|bad gateway|gateway timeout/i.test(rawMessage)
  ) {
    return ErrorCode.SERVER_OVERLOADED;
  }

  if (
    rawCode === ErrorCode.DB_UNAVAILABLE ||
    code === 'db_unavailable' ||
    /database unavailable|database connection|mongodb|database timeout|storage is temporarily unavailable/i.test(
      rawMessage,
    )
  ) {
    return ErrorCode.DB_UNAVAILABLE;
  }

  /* 18. Network Errors */
  if (
    rawCode === ErrorCode.NETWORK_ERROR ||
    code === 'network_error' ||
    /network error|failed to fetch|network request failed|fetch failed|unable to reach/i.test(
      rawMessage,
    )
  ) {
    return ErrorCode.NETWORK_ERROR;
  }

  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) {
    return ErrorCode.NETWORK_ERROR;
  }

  if (
    typeof TypeError !== 'undefined' &&
    error instanceof TypeError &&
    /fetch|network/i.test(error.message)
  ) {
    return ErrorCode.NETWORK_ERROR;
  }

  return ErrorCode.UNKNOWN;
};

/* -------------------------------------------------------------------------- */
/* Safe Logging                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Never log:
 * - passwords
 * - master keys
 * - access tokens
 * - refresh tokens
 * - decrypted vault content
 * - uploaded file contents
 * - request bodies containing secrets
 */
const createSafeLogData = (error: unknown, context: string, code: ErrorCode) => {
  const message = extractErrorMessage(error);

  return {
    context,
    code,
    errorName: isRecord(error) && typeof error.name === 'string' ? error.name : undefined,
    errorMessage: message,
  };
};

/* -------------------------------------------------------------------------- */
/* Main Error Handler                                                        */
/* -------------------------------------------------------------------------- */

export const handleError = (
  error: unknown,
  context = 'app',
  options?: HandleErrorOptions,
): AppError => {
  const contextLabel = context.trim() || 'app';

  const code = classifyError(error);
  const rawMsg = extractErrorMessage(error);
  const safeMessage =
    code !== ErrorCode.UNKNOWN ? ERROR_MESSAGES[code] : rawMsg || ERROR_MESSAGES[ErrorCode.UNKNOWN];

  /*
   * Log diagnostic information, not sensitive application data.
   */
  logger.error(`Error in ${contextLabel}`, createSafeLogData(error, contextLabel, code));

  /*
   * Activity log should contain the sanitized application message only.
   */
  try {
    logActivity({
      actionType: 'error',
      itemName: contextLabel,
      description: safeMessage,
      status: 'failure',
    });
  } catch (activityError) {
    /*
     * Activity logging must never break the original error flow.
     */
    logger.warn('Failed to record error activity', {
      context: contextLabel,
      errorName: activityError instanceof Error ? activityError.name : undefined,
    });
  }

  /*
   * User-facing notification.
   */
  if (!options?.silent) {
    toast.error(safeMessage, {
      description: contextLabel !== 'app' ? `Context: ${contextLabel}` : undefined,
      duration: options?.duration,
    });
  }

  return {
    code,
    message: safeMessage,
    originalError: error,
  };
};

/* -------------------------------------------------------------------------- */
/* Synchronous Function Guard                                                */
/* -------------------------------------------------------------------------- */

export const functionCheck = <T>(
  fn: () => T,
  context: string,
  options?: HandleErrorOptions,
): T | null => {
  try {
    return fn();
  } catch (error: unknown) {
    handleError(error, context, options);
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Asynchronous Function Guard                                               */
/* -------------------------------------------------------------------------- */

export const asyncFunctionCheck = async <T>(
  fn: () => Promise<T>,
  context: string,
  options?: HandleErrorOptions,
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error: unknown) {
    handleError(error, context, options);
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Optional: Convert Unknown Error to AppError Without Showing a Toast       */
/* -------------------------------------------------------------------------- */

/**
 * Useful when a caller needs to handle an error itself.
 *
 * Example:
 *
 * const result = await tryAsync(() => uploadFile(file), 'upload');
 *
 * if (!result.ok) {
 *   if (result.error.code === ErrorCode.QUOTA_EXCEEDED) {
 *     // custom UI
 *   }
 * }
 */
export const normalizeError = (error: unknown): AppError => {
  const code = classifyError(error);

  return {
    code,
    message: ERROR_MESSAGES[code],
    originalError: error,
  };
};

/* -------------------------------------------------------------------------- */
/* Optional: Result Helper                                                   */
/* -------------------------------------------------------------------------- */

export type AsyncResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AppError;
    };

export const tryAsync = async <T>(fn: () => Promise<T>): Promise<AsyncResult<T>> => {
  try {
    return {
      ok: true,
      data: await fn(),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: normalizeError(error),
    };
  }
};
