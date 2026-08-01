import { toast } from 'sonner';
import { logActivity } from './activity.ts';
import { logger } from './logger.ts';

export enum ErrorCode {
  AUTH_FAILED = 'auth/failed',
  STORAGE_DISCONNECTED = 'storage/disconnected',
  PERMISSION_DENIED = 'permission-denied',
  QUOTA_EXCEEDED = 'quota-exceeded',
  UPLOAD_FAILED = 'upload-failed',
  DOWNLOAD_FAILED = 'download-failed',
  DECRYPTION_FAILED = 'decryption-failed',
  ENCRYPTION_FAILED = 'encryption-failed',
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
    error?.name, // Add error name (e.g. DataError, QuotaExceededError)
    typeof error === 'string' ? error : null,
  ];

  for (const candidate of nestedCandidates) {
    if (isMeaningfulMessage(candidate)) {
      return candidate;
    }
  }

  // Fallback for objects that might just have a code
  if (error?.code && typeof error.code === 'string') {
    return `Error code: ${error.code}`;
  }

  return null;
};

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_FAILED]: 'Failed to authenticate with security server.',
  [ErrorCode.STORAGE_DISCONNECTED]: 'Storage connection lost. Please check your internet.',
  [ErrorCode.PERMISSION_DENIED]: 'You do not have permission to perform this action.',
  [ErrorCode.QUOTA_EXCEEDED]: 'Storage quota exceeded. Please contact support.',
  [ErrorCode.UPLOAD_FAILED]: 'Failed to backup data to cloud.',
  [ErrorCode.DOWNLOAD_FAILED]: 'Failed to sync data from cloud.',
  [ErrorCode.DECRYPTION_FAILED]: 'Failed to decrypt data. Master key might be incorrect.',
  [ErrorCode.ENCRYPTION_FAILED]: 'Failed to encrypt data.',
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

  // Cloud Storage Error Mapping
  if (error?.code || error?.status) {
    const errCode = error.code || error.status;
    switch (errCode) {
      case 'storage/unauthorized':
      case 'permission-denied':
      case 403:
        code = ErrorCode.PERMISSION_DENIED;
        break;
      case 'storage/quota-exceeded':
        code = ErrorCode.QUOTA_EXCEEDED;
        break;
      case 'storage/retry-limit-exceeded':
      case 'network-error':
      case 503:
        code = ErrorCode.NETWORK_ERROR;
        break;
      case 'auth/network-request-failed':
      case 504:
        code = ErrorCode.STORAGE_DISCONNECTED;
        break;
      case 404:
        code = ErrorCode.DOWNLOAD_FAILED;
        break;
    }
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    code = ErrorCode.NETWORK_ERROR;
  }

  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    code = ErrorCode.STORAGE_DISCONNECTED;
  }

  // Custom mapping if code was found
  if (code !== ErrorCode.UNKNOWN) {
    message = ERROR_MESSAGES[code];
  } else {
    const extractedMessage = extractErrorMessage(error);
    if (extractedMessage) {
      message = extractedMessage;
    }
  }

  logActivity({
    actionType: 'error',
    itemName: contextLabel,
    description: message,
    status: 'failure',
  });

  // Show user-friendly toast
  toast.error(message, {
    description: context ? `In context: ${context}` : undefined,
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
  context: string
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    return null;
  }
};
