import axios, { AxiosError, InternalAxiosRequestConfig, type AxiosRequestConfig } from 'axios';
import { addBreadcrumb, captureException } from '../lib/sentry.js';
import { getCsrfTokenForApiRequest } from '../lib/csrf.ts';
import {
  clearAuthToken,
  clearCloudSessionHint,
  getAuthToken,
  saveCloudSessionHint,
  setAuthToken,
} from '../lib/auth-session';

import { resolveApiBaseUrl } from '../lib/apiBaseUrl.ts';
import { logger } from '../lib/logger';

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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isApiResponse = (value: unknown): value is ApiResponse<unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ApiResponse<unknown>>;
  return typeof candidate.success === 'boolean';
};

const normalizeApiError = (error: AxiosError<ApiResponse<unknown>>): ApiClientError => {
  const status = error.response?.status;
  const rawPayload = error.response?.data;
  const payload = isApiResponse(rawPayload) ? rawPayload : null;
  const code =
    (isNonEmptyString(payload?.error?.code) && payload.error.code) ||
    (typeof status === 'number' ? `HTTP_${status}` : 'NETWORK_ERROR');
  const message =
    (isNonEmptyString(payload?.message) && payload.message) ||
    error.message ||
    'An unexpected connection error occurred.';

  return {
    success: false,
    message,
    code,
    status,
    error: {
      code,
      requestId: payload?.error?.requestId,
      details: payload?.error?.details,
      message,
    },
  };
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

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

/**
 * Request Interceptor
 * Adds Authorization header if token exists
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
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
      config.headers['X-CSRF-Token'] = csrfToken;
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
 * Handles global error cases like 401/403
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthUrl = Boolean(
      originalRequest?.url &&
      (originalRequest.url.includes('/auth/refresh') ||
        originalRequest.url.includes('/auth/login') ||
        originalRequest.url.includes('/auth/register') ||
        originalRequest.url.includes('/auth/signup') ||
        originalRequest.url.includes('/auth/salt') ||
        originalRequest.url.includes('/auth/username-check') ||
        originalRequest.url.includes('/auth/csrf-token') ||
        originalRequest.url.includes('/2fa/login')),
    );
    const isAuthRefreshCall = Boolean(originalRequest?.url?.includes('/auth/refresh'));

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isAuthUrl) {
        if (isAuthRefreshCall) {
          clearAuthToken();
          clearCloudSessionHint();
        }
        return Promise.reject(normalizeApiError(error));
      }

      originalRequest._retry = true;

      const refreshed = await requestSessionRefresh();
      if (refreshed?.token) {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${refreshed.token}`;
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

      // Refresh failed, clear session and notify app state without forcing a full page reload.
      clearAuthToken();
      clearCloudSessionHint();
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Forbidden access:', error.response.data?.message);
    }

    if (!isAuthRefreshCall && error.response?.status && error.response.status >= 400) {
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
