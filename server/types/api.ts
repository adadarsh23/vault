/**
 * Standard API Response, Pagination, and Error Contracts
 */

export interface ApiResponseMeta {
  requestId?: string;
  timestamp?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ValidationErrorItem {
  field: string;
  message: string;
  value?: unknown;
  rule?: string;
}

export interface ApiErrorDetail {
  code: ApiErrorCode | string;
  requestId?: string;
  details?: ValidationErrorItem[] | Record<string, unknown> | unknown;
  timestamp?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Standard API error codes used across the Vault backend
 */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'INVALID_TOKEN'
  | 'AUTH_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'TWO_FACTOR_REQUIRED'
  | 'INVALID_TWO_FACTOR'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNSUPPORTED_CATEGORY'
  | 'CSRF_BLOCKED'
  | 'CSRF_DETECTED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'DB_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE';
