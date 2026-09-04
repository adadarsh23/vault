import { resolveApiBaseUrl } from '../apiBaseUrl';
import { clearAuthToken, clearCloudSessionHint, getAuthToken } from '../auth-session';
import { refreshVaultSession } from '../auth-api';
import { getCsrfTokenForApiRequest } from '../csrf';

export const API_BASE_URL = resolveApiBaseUrl();
const REQUEST_TIMEOUT_MS = 3_600_000;
export const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 10_000;
const MAX_RETRY_AFTER_DELAY_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_API_CODES = new Set([
  'AUTH_REQUIRED',
  'INVALID_TOKEN',
  'INVALID_AUTH_HEADER',
  'DB_UNAVAILABLE',
  'STORAGE_FULL',
  'INVALID_FILE_TYPE',
  'UNSUPPORTED_FILE_CATEGORY',
  'UNSUPPORTED_CATEGORY',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type SyncRequestError = Error & {
  status?: number;
  code?: string;
  retryAfterMs?: number;
};

const createSyncRequestError = (
  context: string,
  message: string,
  options: { status?: number; code?: string; retryAfterMs?: number } = {},
): SyncRequestError => {
  const error = new Error(`${context}: ${message}`) as SyncRequestError;
  if (typeof options.status === 'number') {
    error.status = options.status;
  }
  if (typeof options.code === 'string') {
    error.code = options.code;
  }
  if (typeof options.retryAfterMs === 'number') {
    error.retryAfterMs = options.retryAfterMs;
  }
  return error;
};

const parseRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  const delayMs = retryAt - Date.now();
  if (delayMs <= 0) {
    return 0;
  }

  return delayMs;
};

const computeRetryDelayMs = (attempt: number, retryAfterMs?: number): number => {
  const jitterMs = Math.floor(Math.random() * 250);
  if (typeof retryAfterMs === 'number') {
    return Math.max(
      BASE_RETRY_DELAY_MS,
      Math.min(retryAfterMs + jitterMs, MAX_RETRY_AFTER_DELAY_MS),
    );
  }

  const exponentialDelay = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return exponentialDelay + jitterMs;
};

export const resolveRuntimeOrigin = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  if (API_BASE_URL) {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      // Fall through to localhost fallback below.
    }
  }

  return 'http://localhost';
};

export const resolveSignedUrl = (value: string, context: string, code: string): URL => {
  try {
    if (value.startsWith('/') && !value.startsWith('//') && API_BASE_URL) {
      return new URL(value, API_BASE_URL);
    }
    return new URL(value, resolveRuntimeOrigin());
  } catch {
    const error = new Error(`${context}: server returned an invalid signed URL.`);
    (error as Error & { code?: string }).code = code;
    throw error;
  }
};

let activeRefreshPromise: Promise<string> | null = null;

export const DEFAULT_MAX_PARALLEL_SYNC_WRITES = 6;

// Keyed per-item FIFO queues to prevent concurrent write races on the SAME item
const itemWriteQueues = new Map<string, Promise<void>>();

// Global bounded concurrency semaphore for parallel uploads across different items
let activeWriteCount = 0;
const writeWaiters: Array<() => void> = [];

const acquireWriteSlot = async (maxParallel = DEFAULT_MAX_PARALLEL_SYNC_WRITES): Promise<void> => {
  if (activeWriteCount < maxParallel) {
    activeWriteCount += 1;
    return;
  }
  return new Promise<void>((resolve) => {
    writeWaiters.push(() => {
      activeWriteCount += 1;
      resolve();
    });
  });
};

const releaseWriteSlot = (): void => {
  activeWriteCount = Math.max(0, activeWriteCount - 1);
  const next = writeWaiters.shift();
  if (next) {
    next();
  }
};

/**
 * Runs a sync write task with per-key serialization and global bounded parallelism.
 * If key (e.g. itemId) is provided, writes to the same item are sequenced in FIFO order.
 * Different items execute in parallel up to maxParallel concurrency.
 */
export const runInSyncWriteQueue = async <T>(
  task: () => Promise<T>,
  key?: string,
  maxParallel = DEFAULT_MAX_PARALLEL_SYNC_WRITES,
): Promise<T> => {
  const resolvedKey = key && key.trim() ? key.trim() : '__global__';
  const previousItemPromise = itemWriteQueues.get(resolvedKey) || Promise.resolve();

  let releaseItemQueue: () => void = () => {};
  const currentItemPromise = new Promise<void>((resolve) => {
    releaseItemQueue = resolve;
  });

  // Attach to item queue so consecutive operations on the same key are ordered
  itemWriteQueues.set(
    resolvedKey,
    previousItemPromise.then(
      () => currentItemPromise,
      () => currentItemPromise,
    ),
  );

  try {
    await previousItemPromise;
    await acquireWriteSlot(maxParallel);
    try {
      return await task();
    } finally {
      releaseWriteSlot();
    }
  } finally {
    releaseItemQueue();
    // Cleanup idle item queue entry if no further chained operations are pending
    if (itemWriteQueues.get(resolvedKey) === currentItemPromise) {
      itemWriteQueues.delete(resolvedKey);
    }
  }
};

/**
 * Runs an array of items concurrently using a bounded parallel worker pool.
 */
export const runInParallelPool = async <T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_MAX_PARALLEL_SYNC_WRITES,
): Promise<R[]> => {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const poolWorker = async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => poolWorker()));
  return results;
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  if (!token) {
    clearCloudSessionHint();
    clearAuthToken();
    const error = new Error('Authentication token is missing. Please unlock the vault again.');
    (error as Error & { code?: string }).code = 'AUTH_TOKEN_MISSING';
    throw error;
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const hasBearerAuthHeader = (headers?: Record<string, string>): boolean =>
  typeof headers?.Authorization === 'string' &&
  headers.Authorization.toLowerCase().startsWith('bearer ');

const resolveAuthHeaders = (headers?: Record<string, string>): Record<string, string> => {
  const nextHeaders = { ...(headers || {}) };
  if (hasBearerAuthHeader(nextHeaders)) {
    const token = getAuthToken();
    if (!token) {
      clearCloudSessionHint();
      clearAuthToken();
      const error = new Error('Authentication token is missing. Please unlock the vault again.');
      (error as Error & { code?: string }).code = 'AUTH_TOKEN_MISSING';
      throw error;
    }
    nextHeaders.Authorization = `Bearer ${token}`;
  }
  return nextHeaders;
};

const shouldRefreshForStatus = (status: number, errorCode?: string): boolean =>
  status === 401 &&
  ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'AUTH_REQUIRED', 'INVALID_AUTH_HEADER'].includes(
    errorCode || 'INVALID_TOKEN',
  );

const shouldClearSessionForRefreshError = (error: unknown): boolean => {
  const candidate = error as {
    status?: number;
    code?: string;
    cause?: { status?: number; code?: string };
  };
  const status =
    typeof candidate?.status === 'number'
      ? candidate.status
      : typeof candidate?.cause?.status === 'number'
        ? candidate.cause.status
        : undefined;
  const code = candidate?.code ?? candidate?.cause?.code;
  return (
    status === 401 ||
    code === 'SESSION_REFRESH_FAILED' ||
    code === 'INVALID_TOKEN' ||
    code === 'TOKEN_EXPIRED' ||
    code === 'AUTH_REQUIRED' ||
    code === 'INVALID_AUTH_HEADER'
  );
};

const refreshAccessToken = async (): Promise<string> => {
  if (!activeRefreshPromise) {
    activeRefreshPromise = refreshVaultSession()
      .then((data) => data.token)
      .catch((error) => {
        if (shouldClearSessionForRefreshError(error)) {
          clearCloudSessionHint();
          clearAuthToken();
        }
        throw error;
      })
      .finally(() => {
        activeRefreshPromise = null;
      });
  }

  return activeRefreshPromise;
};

const getApiErrorMessage = (value: unknown, fallback: string): string => {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as {
    error?: string | { message?: string; code?: string };
    message?: string;
  };

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error;
  }

  if (
    candidate.error &&
    typeof candidate.error === 'object' &&
    typeof candidate.error.message === 'string' &&
    candidate.error.message.trim()
  ) {
    return candidate.error.message;
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  return fallback;
};

const getApiErrorCode = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as {
    error?: string | { code?: string };
    code?: string;
  };

  if (
    candidate.error &&
    typeof candidate.error === 'object' &&
    typeof candidate.error.code === 'string'
  ) {
    return candidate.error.code;
  }

  return typeof candidate.code === 'string' ? candidate.code : undefined;
};

export const fetchWithRetry = async function fetchWithRetry(
  input: string,
  init: RequestInit,
  context: string,
  retries = MAX_RETRIES,
  options: { silentStatuses?: number[]; allowAuthRefresh?: boolean } = {},
): Promise<Response> {
  const silentStatuses = new Set(options.silentStatuses || []);
  const allowAuthRefresh = options.allowAuthRefresh !== false;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const abortController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = resolveAuthHeaders((init.headers as Record<string, string>) || undefined);
      const response = await fetch(input, {
        ...init,
        headers,
        signal: abortController.signal,
      });

      if (response.ok) {
        return response;
      }

      let errorMessage = `Request failed with status ${response.status}`;
      let errorCode: string | undefined;
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      try {
        const errorData = await response.clone().json();
        errorCode = getApiErrorCode(errorData);
        errorMessage = getApiErrorMessage(errorData, errorMessage);
      } catch {
        if (response.status === 413) {
          errorMessage = 'File too large for cloud storage.';
        }
      }

      const error = createSyncRequestError(context, errorMessage, {
        status: response.status,
        code: errorCode,
        retryAfterMs,
      });

      if (
        allowAuthRefresh &&
        hasBearerAuthHeader(headers) &&
        shouldRefreshForStatus(response.status, errorCode)
      ) {
        await refreshAccessToken();
        return fetchWithRetry(input, init, context, retries, {
          ...options,
          allowAuthRefresh: false,
        });
      }

      // Check if this status should be silenced (treat as success)
      if (silentStatuses.has(response.status)) {
        return response;
      }

      if (
        !RETRYABLE_STATUS_CODES.has(response.status) ||
        NON_RETRYABLE_API_CODES.has(errorCode || '') ||
        attempt === retries
      ) {
        throw error;
      }

      lastError = error;
      await sleep(computeRetryDelayMs(attempt, error.retryAfterMs));
    } catch (error) {
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      const isNetworkError = error instanceof TypeError;
      const retryAfterMs = (error as SyncRequestError).retryAfterMs;

      if ((!isAbortError && !isNetworkError) || attempt === retries) {
        throw error;
      }

      lastError = error;
      await sleep(computeRetryDelayMs(attempt, retryAfterMs));
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${context}: request failed after retries`);
};

/**
 * Derives a deterministic vault identifier from the master key.
 */
export const getVaultId = async (masterKey: string): Promise<string> => {
  if (!masterKey) throw new Error('Master key is required to generate vault ID');
  const enc = new TextEncoder();
  const data = enc.encode(masterKey + 'vault-identifier-mongodb-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Ensures cloud APIs can be called with a valid auth session.
 */
export const ensureAuth = async (): Promise<void> => {
  if (getAuthToken()) {
    return;
  }

  try {
    await refreshAccessToken();
  } catch (cause) {
    const error = new Error(
      'Authentication is required. Please unlock the vault again.',
    ) as Error & { code?: string; cause?: unknown };
    error.code = 'AUTH_REQUIRED';
    error.cause = cause;
    throw error;
  }

  if (!getAuthToken()) {
    const error = new Error(
      'Authentication token is unavailable. Please unlock the vault again.',
    ) as Error & { code?: string };
    error.code = 'AUTH_TOKEN_MISSING';
    throw error;
  }
};

const isXhrBodySupported = (value: unknown): value is XMLHttpRequestBodyInit => {
  if (typeof value === 'string') {
    return true;
  }
  if (value instanceof ArrayBuffer) {
    return true;
  }
  if (ArrayBuffer.isView(value)) {
    return true;
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return true;
  }
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return true;
  }
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    return true;
  }
  return false;
};

export const uploadWithRetry = async (
  url: string,
  init: RequestInit,
  context: string,
  onProgress?: (progress: number) => void,
  retries = MAX_RETRIES,
  allowAuthRefresh = true,
): Promise<void> => {
  const method = init.method || 'POST';
  const body = init.body;

  let lastError: unknown;
  let currentHeaders: Record<string, string> = {};

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const headers = resolveAuthHeaders((init.headers as Record<string, string>) || undefined);
      const csrfToken = await getCsrfTokenForApiRequest(url, method);
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      currentHeaders = headers;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.withCredentials = true;

        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });

        if (onProgress && xhr.upload) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              onProgress(percentComplete);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let errorMessage = `Request failed with status ${xhr.status}`;
            let errorCode: string | undefined;
            const retryAfterMs = parseRetryAfterMs(xhr.getResponseHeader('Retry-After'));
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorCode = getApiErrorCode(errorData);
              errorMessage = getApiErrorMessage(errorData, errorMessage);
            } catch {
              if (xhr.status === 413) {
                errorMessage = 'File too large for cloud storage.';
              }
            }
            const error = createSyncRequestError(context, errorMessage, {
              status: xhr.status,
              code: errorCode,
              retryAfterMs,
            });
            reject(error);
          }
        };

        xhr.onerror = () => {
          reject(new TypeError('Network request failed'));
        };

        xhr.ontimeout = () => {
          reject(createSyncRequestError(context, 'Upload timed out'));
        };

        xhr.timeout = REQUEST_TIMEOUT_MS;
        if (body instanceof Uint8Array) {
          xhr.send(body as unknown as XMLHttpRequestBodyInit);
        } else if (typeof body === 'string') {
          xhr.send(body as unknown as XMLHttpRequestBodyInit);
        } else if (body != null && isXhrBodySupported(body)) {
          xhr.send(body as unknown as XMLHttpRequestBodyInit);
        } else if (body != null) {
          reject(
            createSyncRequestError(
              context,
              'Upload payload type is not supported by XMLHttpRequest.',
            ),
          );
        } else {
          xhr.send();
        }
      });

      return;
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      const requestError = error as SyncRequestError;
      const status = requestError.status;
      const code = requestError.code;

      if (
        allowAuthRefresh &&
        hasBearerAuthHeader(currentHeaders) &&
        typeof status === 'number' &&
        shouldRefreshForStatus(status, code)
      ) {
        await refreshAccessToken();
        return uploadWithRetry(url, init, context, onProgress, retries, false);
      }

      if (
        (!isNetworkError && (typeof status !== 'number' || !RETRYABLE_STATUS_CODES.has(status))) ||
        NON_RETRYABLE_API_CODES.has(code || '') ||
        attempt === retries
      ) {
        throw error;
      }

      lastError = error;
      await sleep(computeRetryDelayMs(attempt, requestError.retryAfterMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${context}: request failed after retries`);
};
