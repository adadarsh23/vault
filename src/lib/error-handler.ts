import { toast } from 'sonner';
import { logActivity } from './activity.ts';
import { logger } from './logger.ts';

export enum ErrorCode {
  AUTH_FAILED = 'auth/failed',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  AUTH_SAME_CREDENTIALS = 'AUTH_SAME_CREDENTIALS',
  AUTH_WEAK_PASSWORD = 'AUTH_WEAK_PASSWORD',
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

interface AppError {
  code: ErrorCode;
  message: string;
  originalError?: any;
}

const isMeaningfulMessage = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return Boolean(normalized) && normalized !== '[object Object]';
};

const extractErrorMessage = (error: any): string | null => {
  if (!error) return null;

  const nestedCandidates = [
    error?.error?.message,
    error?.response?.data?.error?.message,
    error?.response?.data?.message,
    error?.data?.error?.message,
    error?.data?.message,
    error?.message,
    error?.name,
    typeof error === 'string' ? error : null,
  ];

  for (const candidate of nestedCandidates) {
    if (isMeaningfulMessage(candidate)) {
      return candidate;
    }
  }

  if (error?.code && typeof error.code === 'string') {
    return `Error code: ${error.code}`;
  }

  return null;
};

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_FAILED]: 'Failed to authenticate with security server.',
  [ErrorCode.INVALID_CREDENTIALS]: 'The username or password provided is incorrect.',
  [ErrorCode.AUTH_SAME_CREDENTIALS]: 'Master key and account password must not be identical.',
  [ErrorCode.AUTH_WEAK_PASSWORD]: 'Password does not meet security requirements.',
  [ErrorCode.USER_EXISTS]: 'This username is already registered.',
  [ErrorCode.TOO_MANY_AUTH_ATTEMPTS]: 'Too many failed attempts. Please try again later.',
  [ErrorCode.CAPTCHA_FAILED]: 'Security verification failed. Please retry CAPTCHA.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCode.STORAGE_DISCONNECTED]: 'Storage connection lost. Please check your internet.',
  [ErrorCode.PERMISSION_DENIED]: 'You do not have permission to perform this action.',
  [ErrorCode.QUOTA_EXCEEDED]: 'Storage quota exceeded. Please contact support.',
  [ErrorCode.UPLOAD_FAILED]: 'Failed to backup data to cloud.',
  [ErrorCode.DOWNLOAD_FAILED]: 'Failed to sync data from cloud.',
  [ErrorCode.DECRYPTION_FAILED]: 'Master key is incorrect or vault data could not be decrypted.',
  [ErrorCode.ENCRYPTION_FAILED]: 'Failed to encrypt data.',
  [ErrorCode.CSRF_TOKEN_INVALID]: 'Security token expired or invalid. Please refresh the page.',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'Uploaded file or payload exceeds the allowed size limit.',
  [ErrorCode.INVALID_ID]: 'Invalid resource identifier specified.',
  [ErrorCode.SERVER_OVERLOADED]:
    'Server is currently experiencing high load. Please try again shortly.',
  [ErrorCode.DB_UNAVAILABLE]:
    'Vault cloud storage is temporarily unavailable. Please retry shortly.',
  [ErrorCode.NETWORK_ERROR]: 'Network error occurred. Please try again.',
  [ErrorCode.UNKNOWN]: 'An unexpected error occurred.',
};

export const handleError = (error: any, context?: string): AppError => {
  const contextLabel = context || 'app';
  logger.error(`Error in ${contextLabel}`, {
    error,
    context: contextLabel,
  });

  let code = ErrorCode.UNKNOWN;
  let message = ERROR_MESSAGES[ErrorCode.UNKNOWN];

  const rawCode = error?.code || error?.error?.code || error?.status || error?.response?.status;
  const rawMsg = extractErrorMessage(error) || '';

  if (
    rawCode === 'INVALID_CREDENTIALS' ||
    rawCode === 401 ||
    /invalid username or password/i.test(rawMsg)
  ) {
    code = ErrorCode.INVALID_CREDENTIALS;
  } else if (rawCode === 'AUTH_SAME_CREDENTIALS' || /must not be identical/i.test(rawMsg)) {
    code = ErrorCode.AUTH_SAME_CREDENTIALS;
  } else if (rawCode === 'AUTH_WEAK_PASSWORD' || /password requirement/i.test(rawMsg)) {
    code = ErrorCode.AUTH_WEAK_PASSWORD;
  } else if (
    rawCode === 'USER_EXISTS' ||
    rawCode === 409 ||
    /username already exists/i.test(rawMsg)
  ) {
    code = ErrorCode.USER_EXISTS;
  } else if (
    rawCode === 'TOO_MANY_AUTH_ATTEMPTS' ||
    rawCode === 429 ||
    /too many attempts/i.test(rawMsg)
  ) {
    code = ErrorCode.TOO_MANY_AUTH_ATTEMPTS;
  } else if (/captcha/i.test(rawCode) || /captcha/i.test(rawMsg)) {
    code = ErrorCode.CAPTCHA_FAILED;
  } else if (rawCode === 'CSRF_TOKEN_INVALID' || /csrf/i.test(rawMsg)) {
    code = ErrorCode.CSRF_TOKEN_INVALID;
  } else if (
    rawCode === 'PAYLOAD_TOO_LARGE' ||
    rawCode === 'FILE_TOO_LARGE' ||
    rawCode === 413 ||
    /too large/i.test(rawMsg)
  ) {
    code = ErrorCode.PAYLOAD_TOO_LARGE;
  } else if (rawCode === 'INVALID_ID' || /invalid format/i.test(rawMsg)) {
    code = ErrorCode.INVALID_ID;
  } else if (rawCode === 'SERVER_OVERLOADED' || /server overloaded/i.test(rawMsg)) {
    code = ErrorCode.SERVER_OVERLOADED;
  } else if (rawCode === 'DB_UNAVAILABLE' || /storage is temporarily unavailable/i.test(rawMsg)) {
    code = ErrorCode.DB_UNAVAILABLE;
  } else if (
    /master key is incorrect/i.test(rawMsg) ||
    /candidate salts exhausted/i.test(rawMsg) ||
    /could not be decrypted/i.test(rawMsg)
  ) {
    code = ErrorCode.DECRYPTION_FAILED;
  } else if (
    rawCode === 'storage/unauthorized' ||
    rawCode === 'permission-denied' ||
    rawCode === 403
  ) {
    code = ErrorCode.PERMISSION_DENIED;
  } else if (rawCode === 'storage/quota-exceeded') {
    code = ErrorCode.QUOTA_EXCEEDED;
  } else if (rawCode === 'network-error' || rawCode === 503 || rawCode === 504) {
    code = ErrorCode.NETWORK_ERROR;
  } else if (error instanceof DOMException && error.name === 'AbortError') {
    code = ErrorCode.NETWORK_ERROR;
  } else if (error instanceof TypeError && /fetch/i.test(error.message)) {
    code = ErrorCode.STORAGE_DISCONNECTED;
  }

  if (code !== ErrorCode.UNKNOWN) {
    message = ERROR_MESSAGES[code];
  } else if (rawMsg) {
    message = rawMsg;
  }

  logActivity({
    actionType: 'error',
    itemName: contextLabel,
    description: message,
    status: 'failure',
  });

  toast.error(message, {
    description: context ? `Context: ${context}` : undefined,
  });

  return { code, message, originalError: error };
};

export const functionCheck = <T>(fn: () => T, context: string): T | null => {
  try {
    return fn();
  } catch (error) {
    handleError(error, context);
    return null;
  }
};

export const asyncFunctionCheck = async <T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    return null;
  }
};
