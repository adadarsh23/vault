import axios, { AxiosError, InternalAxiosRequestConfig, type AxiosRequestConfig } from 'axios';
import { addBreadcrumb, captureException } from '../lib/sentry.js';
import { getCsrfTokenForApiRequest } from '../lib/csrf';
import {
  clearAuthToken,
  clearCloudSessionHint,
  getAuthToken,
  saveCloudSessionHint,
  setAuthToken,
} from '../lib/auth-session';

import { resolveApiBaseUrl } from '../lib/apiBaseUrl';
import { logger } from '../lib/logger';
import { triggerSessionTermination } from '../lib/sessionSecurityService';

const API_BASE_URL = `${resolveApiBaseUrl()}/api`;
const API_TIMEOUT_MS = 30_000;

type RefreshSessionPayload = {
  token?: string;
  sessionId?: string;
  refreshToken?: string;
  rememberMe?: boolean;
  expiresIn?: number;
  user?: { username?: string };
};

type RefreshSessionResult = {
  token: string;
  sessionId?: string;
  refreshToken?: string;
  rememberMe?: boolean;
  expiresIn?: number;
  username?: string;
};

export interface ApiResponseError {
  code: string;
  requestId?: string;
  details?: unknown;
  message?: string;
}

/**
 * Standardized API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  error?: ApiResponseError;
}

export interface ApiClientError {
  success: false;
  message: string;
  code: string;
  status?: number;
  error: ApiResponseError;
}

let pendingRefreshRequest: Promise<RefreshSessionResult | null> | null = null;

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isApiResponse = (value: unknown): value is ApiResponse<unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ApiResponse<unknown>>;
  return typeof candidate.success === 'boolean';
};

export const isApiClientError = (error: unknown): error is ApiClientError => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<ApiClientError>;
  return (
    candidate.success === false &&
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string'
  );
};

export const normalizeApiError = (error: AxiosError<unknown> | Error | unknown): ApiClientError => {
  if (isApiClientError(error)) {
    return error;
  }

  const axiosErr = error as AxiosError<Record<string, unknown>>;
  const status = axiosErr.response?.status;
  const rawPayload = axiosErr.response?.data;
  const payload = isApiResponse(rawPayload) ? (rawPayload as ApiResponse<unknown>) : null;

  const rawObj = typeof rawPayload === 'object' && rawPayload !== null ? rawPayload : null;

  const code =
    (isNonEmptyString(payload?.error?.code) && payload.error.code) ||
    (rawObj && isNonEmptyString(rawObj.code) && (rawObj.code as string)) ||
    (rawObj &&
      typeof rawObj.error === 'object' &&
      rawObj.error !== null &&
      isNonEmptyString((rawObj.error as any).code) &&
      (rawObj.error as any).code) ||
    (typeof status === 'number' ? `HTTP_${status}` : 'NETWORK_ERROR');

  const message =
    (isNonEmptyString(payload?.message) && payload.message) ||
    (rawObj && isNonEmptyString(rawObj.message) && (rawObj.message as string)) ||
    (rawObj &&
      typeof rawObj.error === 'string' &&
      isNonEmptyString(rawObj.error) &&
      rawObj.error) ||
    (rawObj &&
      typeof rawObj.error === 'object' &&
      rawObj.error !== null &&
      isNonEmptyString((rawObj.error as any).message) &&
      (rawObj.error as any).message) ||
    axiosErr.message ||
    'An unexpected connection error occurred.';

  const requestId =
    payload?.error?.requestId ||
    (rawObj && typeof rawObj.requestId === 'string' ? rawObj.requestId : undefined) ||
    (rawObj &&
    typeof rawObj.error === 'object' &&
    rawObj.error !== null &&
    typeof (rawObj.error as any).requestId === 'string'
      ? (rawObj.error as any).requestId
      : undefined);

  const details =
    payload?.error?.details ||
    (rawObj && rawObj.details !== undefined ? rawObj.details : undefined) ||
    (rawObj && typeof rawObj.error === 'object' && rawObj.error !== null
      ? (rawObj.error as any).details
      : undefined);

  return {
    success: false,
    message,
    code,
    status,
    error: {
      code,
      requestId,
      details,
      message,
    },
  };
};

const setHeaderValue = (headers: unknown, key: string, value: string): void => {
  if (!headers || typeof headers !== 'object') return;
  const h = headers as Record<string, unknown>;
  if (typeof (h as any).set === 'function') {
    (h as any).set(key, value);
  } else {
    h[key] = value;
  }
};

const getHeaderValue = (headers: unknown, key: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as Record<string, unknown>;
  if (typeof (h as any).get === 'function') {
    return (h as any).get(key);
  }
  return h[key] as string | undefined;
};

const deleteHeaderValue = (headers: unknown, key: string): void => {
  if (!headers || typeof headers !== 'object') return;
  const h = headers as Record<string, unknown>;
  if (typeof (h as any).delete === 'function') {
    (h as any).delete(key);
  } else {
    delete h[key];
  }
};

const requestSessionRefresh = async (): Promise<RefreshSessionResult | null> => {
  if (pendingRefreshRequest) {
    return pendingRefreshRequest;
  }

  pendingRefreshRequest = (async () => {
    try {
      const csrfToken = await getCsrfTokenForApiRequest(`${API_BASE_URL}/auth/refresh`, 'POST');

      const config: AxiosRequestConfig = {
        withCredentials: true,
        timeout: API_TIMEOUT_MS,
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      };
      const { data } = await axios.post<ApiResponse<RefreshSessionPayload>>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        config,
      );

      if (data.success && isNonEmptyString(data.data?.token)) {
        return {
          token: data.data.token.trim(),
          sessionId: data.data.sessionId,
          refreshToken: data.data.refreshToken,
          rememberMe: data.data.rememberMe,
          expiresIn: data.data.expiresIn,
          username: data.data.user?.username,
        };
      }

      return null;
    } catch (refreshErr) {
      logger.warn('Session refresh request failed', { error: refreshErr });
      return null;
    } finally {
      pendingRefreshRequest = null;
    }
  })();

  return pendingRefreshRequest;
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

/**
 * Request Interceptor
 * Adds Authorization header if token exists, injects CSRF tokens, and handles FormData boundaries
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token && config.headers) {
      setHeaderValue(config.headers, 'Authorization', `Bearer ${token}`);
    }

    // When submitting FormData, remove Content-Type so Axios and the browser generate the correct multipart boundary
    if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
      deleteHeaderValue(config.headers, 'Content-Type');
    }

    const requestUrl = (() => {
      if (typeof config.url !== 'string') return undefined;
      if (config.url.startsWith('http://') || config.url.startsWith('https://')) {
        return config.url;
      }
      const base = typeof config.baseURL === 'string' ? config.baseURL : API_BASE_URL;
      return `${base.replace(/\/+$/, '')}/${config.url.replace(/^\/+/, '')}`;
    })();

    const csrfToken = await getCsrfTokenForApiRequest(requestUrl, config.method);
    if (csrfToken && config.headers) {
      setHeaderValue(config.headers, 'X-CSRF-Token', csrfToken);
    }

    addBreadcrumb({
      category: 'http',
      type: 'http',
      level: 'info',
      data: {
        method: config.method,
        url: config.url,
      },
    });
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * Response Interceptor
 * Handles automatic token refreshes, concurrent 401 queuing, session terminations, and error normalization
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    const requestUrl = originalRequest?.url || '';
    const isAuthUrl = Boolean(
      requestUrl &&
      (requestUrl.includes('/auth/refresh') ||
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/register') ||
        requestUrl.includes('/auth/signup') ||
        requestUrl.includes('/auth/salt') ||
        requestUrl.includes('/auth/username-check') ||
        requestUrl.includes('/auth/csrf-token') ||
        requestUrl.includes('/auth/logout') ||
        requestUrl.includes('/2fa/login')),
    );
    const isAuthRefreshCall = Boolean(requestUrl.includes('/auth/refresh'));

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const rawPayload = error.response?.data as any;
      const errorCode = rawPayload?.error?.code || rawPayload?.code;

      if (errorCode === 'SESSION_REVOKED') {
        clearAuthToken();
        clearCloudSessionHint();
        triggerSessionTermination('REVOKED_BY_SERVER', {
          reason: 'SESSION_REVOKED',
          timestamp: Date.now(),
        });
        return Promise.reject(normalizeApiError(error));
      }

      if (isAuthUrl) {
        if (isAuthRefreshCall) {
          clearAuthToken();
          clearCloudSessionHint();
          triggerSessionTermination('REFRESH_FAILED');
        }
        return Promise.reject(normalizeApiError(error));
      }

      originalRequest._retry = true;

      // If a concurrent request has already refreshed the token in storage, retry immediately
      const latestToken = getAuthToken();
      const currentAuthHeader = getHeaderValue(originalRequest.headers, 'Authorization') || '';
      const previousToken = currentAuthHeader.replace(/^Bearer\s+/i, '').trim();

      if (latestToken && latestToken !== previousToken) {
        setHeaderValue(originalRequest.headers, 'Authorization', `Bearer ${latestToken}`);
        return apiClient(originalRequest);
      }

      const refreshed = await requestSessionRefresh();
      if (refreshed?.token) {
        if (originalRequest.headers) {
          setHeaderValue(originalRequest.headers, 'Authorization', `Bearer ${refreshed.token}`);
        }
        setAuthToken(refreshed.token, {
          sessionId: refreshed.sessionId,
          refreshToken: refreshed.refreshToken,
          rememberMe: refreshed.rememberMe ?? true,
          maxAgeSeconds: typeof refreshed.expiresIn === 'number' ? refreshed.expiresIn : undefined,
        });

        const username = refreshed.username?.trim().toLowerCase();
        if (username) {
          saveCloudSessionHint(username);
        }

        return apiClient(originalRequest);
      }

      // Refresh failed, clear session and trigger complete lockdown
      clearAuthToken();
      clearCloudSessionHint();
      triggerSessionTermination('SESSION_EXPIRED');
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      logger.warn('Forbidden access (HTTP 403)', {
        url: error.config?.url,
        message: error.response.data?.message,
      });
    }

    // Log unexpected errors to Sentry (excluding expected 401/404 client flows and cancelled requests)
    if (
      !isAuthRefreshCall &&
      error.response?.status &&
      error.response.status >= 500 &&
      !axios.isCancel(error)
    ) {
      captureException(error, {
        tags: {
          source: 'api-client',
          method: error.config?.method || 'unknown',
          status: String(error.response.status),
        },
        extra: {
          endpoint: error.config?.url,
          requestId: error.response.data?.error?.requestId,
          code: error.response.data?.error?.code,
        },
      });
    }

    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const apiError = normalizeApiError(error);
    return Promise.reject(apiError);
  },
);

export default apiClient;
