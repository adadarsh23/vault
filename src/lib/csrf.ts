import { resolveApiBaseUrl } from './apiBaseUrl';
import { logger } from './logger';

const API_BASE_URL = resolveApiBaseUrl().replace(/\/+$/, '');
const CSRF_TOKEN_ENDPOINT = `${API_BASE_URL}/api/auth/csrf-token`;
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isBrowser = typeof window !== 'undefined';
const isTestRuntime = import.meta.env.MODE === 'test';

let cachedCsrfToken: string | null = null;
let pendingCsrfTokenPromise: Promise<string | null> | null = null;
let fetchPatched = false;
let originalFetchRef: typeof fetch | null = null;

const normalizeMethod = (method: string | undefined): string =>
  (method || 'GET').trim().toUpperCase();

const resolveUrlFromFetchInput = (input: RequestInfo | URL): URL | null => {
  try {
    if (input instanceof URL) return input;
    if (typeof input === 'string') return new URL(input, window.location.origin);
    return new URL(input.url, window.location.origin);
  } catch {
    return null;
  }
};

const resolveUrlFromString = (value: string): URL | null => {
  try {
    return new URL(value, window.location.origin);
  } catch {
    return null;
  }
};

const isCsrfBootstrapEndpoint = (url: URL): boolean => url.href === CSRF_TOKEN_ENDPOINT;

const isApiTarget = (url: URL): boolean => {
  if (url.origin === window.location.origin) {
    return url.pathname.startsWith('/api/');
  }
  return url.href.startsWith(`${API_BASE_URL}/api/`);
};

const shouldAttachCsrfToken = (method: string, url: URL): boolean =>
  MUTATING_METHODS.has(method) && isApiTarget(url) && !isCsrfBootstrapEndpoint(url);

const resolveFetchImpl = (): typeof fetch => {
  if (originalFetchRef) {
    return originalFetchRef;
  }
  return fetch.bind(window);
};

export const clearCachedCsrfToken = (): void => {
  cachedCsrfToken = null;
  pendingCsrfTokenPromise = null;
};

export const fetchCsrfToken = async (forceRefresh = false): Promise<string | null> => {
  if (!isBrowser || isTestRuntime) return null;

  if (!forceRefresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }
  if (pendingCsrfTokenPromise) {
    return pendingCsrfTokenPromise;
  }

  const fetchImpl = resolveFetchImpl();
  const currentPromise = fetchImpl(CSRF_TOKEN_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json().catch(() => null)) as {
        data?: { csrfToken?: unknown };
      } | null;
      const csrfToken = payload?.data?.csrfToken;
      if (typeof csrfToken !== 'string' || csrfToken.trim().length === 0) {
        return null;
      }

      if (pendingCsrfTokenPromise === currentPromise) {
        cachedCsrfToken = csrfToken;
      }
      return csrfToken;
    })
    .catch((error) => {
      logger.warn('Failed to fetch CSRF token.', { error });
      return null;
    })
    .finally(() => {
      if (pendingCsrfTokenPromise === currentPromise) {
        pendingCsrfTokenPromise = null;
      }
    });

  pendingCsrfTokenPromise = currentPromise;
  return currentPromise;
};

export const getCsrfTokenForApiRequest = async (
  requestUrl: string | undefined,
  requestMethod: string | undefined,
): Promise<string | null> => {
  if (!isBrowser || isTestRuntime || !requestUrl) {
    return null;
  }

  const method = normalizeMethod(requestMethod);
  const url = resolveUrlFromString(requestUrl);
  if (!url || !shouldAttachCsrfToken(method, url)) {
    return null;
  }

  return fetchCsrfToken();
};

export const installGlobalFetchCsrfProtection = (): void => {
  if (!isBrowser || isTestRuntime || fetchPatched) {
    return;
  }

  const originalFetch = fetch.bind(window);
  originalFetchRef = originalFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = normalizeMethod(
      init?.method || (input instanceof Request ? input.method : undefined),
    );
    const url = resolveUrlFromFetchInput(input);

    if (!url || !shouldAttachCsrfToken(method, url)) {
      return originalFetch(input, init);
    }

    const csrfToken = await fetchCsrfToken();
    if (!csrfToken) {
      return originalFetch(input, init);
    }

    const mergedHeaders = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      const initHeaders = new Headers(init.headers);
      initHeaders.forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    mergedHeaders.set(CSRF_HEADER_NAME, csrfToken);
    return originalFetch(input, { ...init, headers: mergedHeaders });
  };

  fetchPatched = true;
};
