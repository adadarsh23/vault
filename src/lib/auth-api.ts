import { resolveApiBaseUrl } from './apiBaseUrl';
import {
  clearAuthToken,
  clearCloudSessionHint,
  getAuthToken,
  getDeviceId,
  readCloudSessionHint,
  saveCloudSessionHint,
  setAuthToken,
} from './auth-session';
import { getCsrfTokenForApiRequest } from './csrf';
import { logger } from './logger';

const API_BASE_URL = resolveApiBaseUrl();
let pendingLogoutRequest: Promise<void> | null = null;
let pendingSessionRefreshRequest: Promise<LoginAuthData> | null = null;
let isProfileUpdateRouteUnavailable = false;

const DEFAULT_BROWSER_AUTH_HEADERS: Record<string, string> = {
  'X-Requested-With': 'XMLHttpRequest',
};

const LOCAL_PROFILE_OVERRIDE_KEY = 'vault:local-profile-override';
const PROFILE_UPDATE_ROUTE_UNAVAILABLE_KEY = 'vault:profile-update-route-unavailable';
const PROFILE_UPDATE_ROUTE_UNAVAILABLE_TTL_MS = 30 * 60 * 1000;

type LocalProfileOverride = {
  username: string;
  profileName: string;
  profilePhoto: string;
  updatedAt: string;
};

type ProfileRouteUnavailableState = {
  unavailable: boolean;
  detectedAt: number;
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readProfileRouteUnavailableState = (): boolean => {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    const raw = storage.getItem(PROFILE_UPDATE_ROUTE_UNAVAILABLE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as Partial<ProfileRouteUnavailableState>;
    if (!parsed?.unavailable || typeof parsed.detectedAt !== 'number') {
      storage.removeItem(PROFILE_UPDATE_ROUTE_UNAVAILABLE_KEY);
      return false;
    }

    if (Date.now() - parsed.detectedAt > PROFILE_UPDATE_ROUTE_UNAVAILABLE_TTL_MS) {
      storage.removeItem(PROFILE_UPDATE_ROUTE_UNAVAILABLE_KEY);
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const writeProfileRouteUnavailableState = (unavailable: boolean) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  if (!unavailable) {
    try {
      storage.removeItem(PROFILE_UPDATE_ROUTE_UNAVAILABLE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return;
  }

  const payload: ProfileRouteUnavailableState = {
    unavailable: true,
    detectedAt: Date.now(),
  };

  try {
    storage.setItem(PROFILE_UPDATE_ROUTE_UNAVAILABLE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
};

const normalizeProfileValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'none';
  }
  const trimmed = value.trim();
  return trimmed || 'none';
};

const normalizeUsername = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const readCloudSessionHintSafely = (): { username: string } | null => {
  try {
    if (typeof readCloudSessionHint !== 'function') {
      return null;
    }
    return readCloudSessionHint();
  } catch (error) {
    logger.warn('Failed to read cloud session hint', { error });
    return null;
  }
};

const resolveProfileOverrideUsername = (explicitUsername?: string): string => {
  const normalizedExplicit = normalizeUsername(explicitUsername);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const hintUsername = normalizeUsername(readCloudSessionHintSafely()?.username);
  return hintUsername;
};

const writeLocalProfileOverride = (input: {
  username?: string;
  profileName?: string;
  profilePhoto?: string;
}) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const username = resolveProfileOverrideUsername(input.username);
  if (!username) {
    return;
  }

  const payload: LocalProfileOverride = {
    username,
    profileName: normalizeProfileValue(input.profileName),
    profilePhoto: normalizeProfileValue(input.profilePhoto),
    updatedAt: new Date().toISOString(),
  };

  try {
    storage.setItem(LOCAL_PROFILE_OVERRIDE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
};

const clearLocalProfileOverride = (username?: string) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const normalizedTargetUsername = normalizeUsername(username);
  if (!normalizedTargetUsername) {
    return;
  }

  try {
    const raw = storage.getItem(LOCAL_PROFILE_OVERRIDE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Partial<LocalProfileOverride>;
    const storedUsername = normalizeUsername(parsed.username);
    if (storedUsername && storedUsername === normalizedTargetUsername) {
      storage.removeItem(LOCAL_PROFILE_OVERRIDE_KEY);
    }
  } catch {
    // Ignore storage read/cleanup failures.
  }
};

const readLocalProfileOverride = (username?: string): LocalProfileOverride | null => {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  const raw = (() => {
    try {
      return storage.getItem(LOCAL_PROFILE_OVERRIDE_KEY);
    } catch {
      return null;
    }
  })();

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfileOverride>;
    const storedUsername = normalizeUsername(parsed.username);
    const targetUsername = normalizeUsername(username);

    if (!storedUsername) {
      return null;
    }

    if (targetUsername && storedUsername !== targetUsername) {
      return null;
    }

    return {
      username: storedUsername,
      profileName: normalizeProfileValue(parsed.profileName),
      profilePhoto: normalizeProfileValue(parsed.profilePhoto),
      updatedAt:
        typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const applyLocalProfileOverride = (profile: AuthenticatedProfile): AuthenticatedProfile => {
  const override = readLocalProfileOverride(profile.username);
  if (!override) {
    return profile;
  }

  return {
    ...profile,
    profileName: override.profileName,
    profilePhoto: override.profilePhoto,
    profileDetails: {
      ...profile.profileDetails,
      updatedAt: override.updatedAt,
    },
    updatedAt: override.updatedAt,
  };
};

const toProfileUpdateResponse = (profile: AuthenticatedProfile): ProfileUpdateResponse => ({
  id: profile.id,
  username: profile.username,
  profileName: normalizeProfileValue(profile.profileName),
  profilePhoto: normalizeProfileValue(profile.profilePhoto),
  profileDetails: profile.profileDetails,
  updatedAt: profile.profileDetails?.updatedAt || profile.updatedAt || new Date().toISOString(),
});

const buildLocalFallbackProfile = (username?: string): AuthenticatedProfile => {
  const resolvedUsername = resolveProfileOverrideUsername(username) || 'unknown';
  const override = readLocalProfileOverride(resolvedUsername);
  const updatedAt = override?.updatedAt || new Date().toISOString();

  return {
    id: `local-${resolvedUsername}`,
    username: resolvedUsername,
    profileName: override?.profileName || 'none',
    profilePhoto: override?.profilePhoto || 'none',
    profileDetails: {
      updatedAt,
    },
    createdAt: updatedAt,
    updatedAt,
    twoFactorEnabled: false,
    sessions: [],
  };
};

interface AuthUser {
  id: string;
  username: string;
  sessions?: Array<{
    sessionId: string;
    deviceId: string;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    ipAddress: string;
    userAgent: string;
    isCurrent: boolean;
    deviceName?: string;
  }>;
}

interface LoginAuthData {
  token: string;
  refreshToken?: string;
  message?: string;
  sessionId?: string;
  rememberMe?: boolean;
  expiresIn?: number;
  user: AuthUser;
  twoFactorRequired?: boolean;
  userId?: string;
  username?: string;
  mfaToken?: string;
}

interface AuthResponse<TData = LoginAuthData> {
  success: boolean;
  data?: TData;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

interface UsernameExactMatchResponse {
  exists: boolean;
  exactMatch: boolean;
  username: string;
  userId: string | null;
  createdDate: string | null;
}

type ApiRequestError = Error & {
  status?: number;
  code?: string;
  cause?: unknown;
};

export interface AuthSessionSummary {
  sessionId: string;
  deviceId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ipAddress: string;
  userAgent: string;
  isCurrent: boolean;
  deviceName?: string;
}

export interface AuthenticatedProfile {
  id: string;
  username: string;
  profileName?: string;
  profilePhoto?: string;
  profileDetails?: {
    createdAt?: string;
    updatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  meta?: {
    lastLoginAt?: string | null;
    lastSyncAt?: string | null;
    activeDevices?: string[];
  };
  twoFactorEnabled: boolean;
  sessions: AuthSessionSummary[];
}

export interface SessionRevokeResponse {
  revokedCount: number;
  sessions: AuthSessionSummary[];
}

interface TwoFactorSetupResponse {
  qrCodeUrl: string;
  secret: string;
}

interface TwoFactorVerifyResponse {
  backupCodes: string[];
}

interface DeviceRenameResponse {
  success: boolean;
  sessions: AuthSessionSummary[];
}

interface ProfileUpdateResponse {
  id: string;
  username: string;
  profileName: string;
  profilePhoto: string;
  profileDetails?: {
    createdAt?: string;
    updatedAt?: string;
  };
  updatedAt: string;
}

const readErrorMessage = (payload: any, fallback: string) => {
  if (typeof payload?.error === 'string') return payload.error;
  if (payload?.error?.message) return payload.error.message;
  if (payload?.message) return payload.message;
  return fallback;
};

const responseHasNoBody = (response: Response): boolean =>
  response.status === 204 || response.status === 205 || response.status === 304;

const isJsonResponse = (response: Response): boolean => {
  const headers = response?.headers as { get?: (name: string) => string | null } | undefined;
  if (!headers || typeof headers.get !== 'function') {
    // Some tests mock only { ok, status, json } without headers.
    return true;
  }

  const contentType = headers.get('content-type') || '';
  const normalized = contentType.toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized.includes('application/json') || normalized.includes('+json');
};

const readJsonSafely = async <T>(response: Response): Promise<T | null> => {
  if (responseHasNoBody(response)) {
    return null;
  }
  if (typeof response.json !== 'function') {
    return null;
  }
  if (!isJsonResponse(response)) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    logger.warn('Failed to parse auth API response JSON', {
      status: response.status,
      url: response.url,
      error,
    });
    return null;
  }
};

const createApiRequestError = (
  fallbackMessage: string,
  input?: {
    payload?: AuthResponse<unknown> | null;
    response?: Response;
    code?: string;
    cause?: unknown;
  }
): ApiRequestError => {
  const error = new Error(readErrorMessage(input?.payload, fallbackMessage)) as ApiRequestError;
  error.status = input?.response?.status;
  error.code = input?.code ?? input?.payload?.error?.code;
  if (input?.cause !== undefined) {
    error.cause = input.cause;
  }
  return error;
};

const fetchAuthJson = async (
  input: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<{ response: Response; payload: AuthResponse | null }> =>
  fetchTypedAuthJson<LoginAuthData>(input, init, fallbackMessage);

const fetchTypedAuthJson = async <TData>(
  input: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<{ response: Response; payload: AuthResponse<TData> | null }> => {
  let response: Response;
  const requestMethod = (init.method || 'GET').toUpperCase();
  const shouldAttachCsrfHeader = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod);

  const requestInit = shouldAttachCsrfHeader
    ? await (async () => {
        const csrfToken = await getCsrfTokenForApiRequest(input, requestMethod);
        if (!csrfToken) {
          return init;
        }

        const headers = new Headers(init.headers || {});
        headers.set('X-CSRF-Token', csrfToken);
        return { ...init, headers };
      })()
    : init;

  try {
    response = await fetch(input, requestInit);
  } catch (cause) {
    throw createApiRequestError('Unable to reach the server.', {
      code: 'NETWORK_ERROR',
      cause,
    });
  }

  const payload = await readJsonSafely<AuthResponse<TData>>(response);

  if (!response.ok) {
    throw createApiRequestError(fallbackMessage, { payload, response });
  }

  return { response, payload };
};

const normalizeCaptchaToken = (value: string): string => {
  const token = value.trim();
  if (token.length < 20) {
    throw createApiRequestError('Complete the CAPTCHA challenge before continuing.', {
      code: 'CAPTCHA_TOKEN_MISSING',
    });
  }
  return token;
};

export const fetchVaultSalt = async (username: string): Promise<string> => {
  const { payload } = await fetchTypedAuthJson<{ salt: string }>(
    `${API_BASE_URL}/api/auth/salt?username=${encodeURIComponent(username.trim().toLowerCase())}`,
    {
      method: 'GET',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
      },
    },
    'Failed to fetch cryptographic salt.'
  );

  if (!payload?.success || typeof payload.data?.salt !== 'string') {
    throw new Error(payload?.message || 'Failed to fetch cryptographic salt.');
  }

  return payload.data.salt;
};

const sendAuthRequest = async (
  path: '/login' | '/register',
  username: string,
  password: string,
  captchaToken: string,
  masterKey?: string,
  pqcSalt?: string
) => {
  const { response, payload } = await fetchAuthJson(
    `${API_BASE_URL}/api/auth${path}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        masterKey,
        pqcSalt,
        deviceId: getDeviceId(),
        captchaToken: normalizeCaptchaToken(captchaToken),
      }),
    },
    'Authentication failed.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Authentication failed.', {
      payload,
      response,
    });
  }

  if (!payload.data?.token && !payload.data?.twoFactorRequired) {
    throw createApiRequestError('Authentication failed: Missing session token.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }

  return payload.data;
};

export const authenticateVaultSession = async (
  mode: 'login' | 'register',
  username: string,
  password: string,
  captchaToken: string,
  masterKey?: string,
  options?: { rememberMe?: boolean; pqcSalt?: string }
) => {
  const data = await sendAuthRequest(
    mode === 'register' ? '/register' : '/login',
    username,
    password,
    captchaToken,
    masterKey,
    options?.pqcSalt
  );
  if (data.token) {
    setAuthToken(data.token, {
      sessionId: data.sessionId,
      refreshToken: data.refreshToken,
      rememberMe: data.rememberMe ?? options?.rememberMe ?? false,
      maxAgeSeconds:
        typeof data.expiresIn === 'number' && data.expiresIn > 0 ? data.expiresIn : undefined,
    });
    saveCloudSessionHint(username);
  }
  return data;
};

export const checkExactUsername = async (username: string): Promise<UsernameExactMatchResponse> => {
  const { response, payload } = await fetchTypedAuthJson<UsernameExactMatchResponse>(
    `${API_BASE_URL}/api/auth/username-check?username=${encodeURIComponent(username)}`,
    {
      method: 'GET',
      credentials: 'include',
    },
    'Username check failed.'
  );

  if (!payload?.success || !payload.data) {
    throw createApiRequestError('Username check failed.', {
      payload,
      response,
      code: payload?.data ? undefined : 'INVALID_AUTH_RESPONSE',
    });
  }

  return payload.data;
};

export const verify2FALogin = async (
  userId: string,
  token: string,
  mfaToken: string,
  captchaToken: string
) => {
  if (!mfaToken?.trim()) {
    throw createApiRequestError('Authentication session expired. Please sign in again.', {
      code: 'MFA_TOKEN_MISSING',
    });
  }

  const { response, payload } = await fetchAuthJson(
    `${API_BASE_URL}/api/2fa/login`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        token,
        mfaToken,
        deviceId: getDeviceId(),
        captchaToken: captchaToken ? normalizeCaptchaToken(captchaToken) : undefined,
      }),
    },
    '2FA verification failed.'
  );

  if (!payload?.success) {
    throw createApiRequestError('2FA verification failed.', { payload, response });
  }
  if (!payload.data?.token || !payload.data.user) {
    throw createApiRequestError('2FA verification failed.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }

  setAuthToken(payload.data.token, {
    sessionId: payload.data.sessionId,
    refreshToken: payload.data.refreshToken,
    rememberMe: payload.data.rememberMe ?? true,
    maxAgeSeconds:
      typeof payload.data.expiresIn === 'number' && payload.data.expiresIn > 0
        ? payload.data.expiresIn
        : undefined,
  });
  saveCloudSessionHint(payload.data.user?.username || '');
  return payload.data;
};

export const setup2FA = async (): Promise<TwoFactorSetupResponse> => {
  const { response, payload } = await fetchTypedAuthJson<TwoFactorSetupResponse>(
    `${API_BASE_URL}/api/2fa/setup`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
    },
    'Failed to initiate 2FA setup.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to initiate 2FA setup.', {
      payload,
      response,
    });
  }
  if (!payload.data?.qrCodeUrl || !payload.data?.secret) {
    throw createApiRequestError('Failed to initiate 2FA setup.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }

  return payload.data;
};

export const verify2FASetup = async (token: string): Promise<TwoFactorVerifyResponse> => {
  const { response, payload } = await fetchTypedAuthJson<TwoFactorVerifyResponse>(
    `${API_BASE_URL}/api/2fa/verify`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
      body: JSON.stringify({ token }),
    },
    'Failed to verify 2FA OTP.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to verify 2FA OTP.', { payload, response });
  }
  if (!Array.isArray(payload.data?.backupCodes)) {
    throw createApiRequestError('Failed to verify 2FA OTP.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }

  return payload.data;
};

export const disable2FA = async (token: string) => {
  const { response, payload } = await fetchAuthJson(
    `${API_BASE_URL}/api/2fa/disable`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
      body: JSON.stringify({ token }),
    },
    'Failed to disable 2FA.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to disable 2FA.', { payload, response });
  }

  return payload.data;
};

export const refreshVaultSession = async () => {
  if (pendingSessionRefreshRequest) {
    return pendingSessionRefreshRequest;
  }

  const request = (async () => {
    try {
      const { response, payload } = await fetchAuthJson(
        `${API_BASE_URL}/api/auth/refresh`,
        {
          method: 'POST',
          credentials: 'include',
        },
        'Session refresh failed.'
      );

      if (!payload?.success || !payload.data?.token) {
        throw createApiRequestError('Session refresh failed.', {
          payload,
          response,
          code: payload?.data?.token ? undefined : 'INVALID_AUTH_RESPONSE',
        });
      }

      setAuthToken(payload.data.token, {
        sessionId: payload.data.sessionId,
        refreshToken: payload.data.refreshToken,
        rememberMe: payload.data.rememberMe ?? true,
        maxAgeSeconds:
          typeof payload.data.expiresIn === 'number' && payload.data.expiresIn > 0
            ? payload.data.expiresIn
            : undefined,
      });
      saveCloudSessionHint(payload.data.user?.username || '');
      return payload.data;
    } catch (cause) {
      const candidate = cause as {
        status?: number;
        code?: string;
        cause?: { status?: number; code?: string };
      };
      const inheritedCode = candidate?.code ?? candidate?.cause?.code;
      const inheritedStatus =
        typeof candidate?.status === 'number'
          ? candidate.status
          : typeof candidate?.cause?.status === 'number'
            ? candidate.cause.status
            : undefined;
      const shouldClearLocalSession =
        inheritedStatus === 401 ||
        inheritedCode === 'SESSION_REFRESH_FAILED' ||
        inheritedCode === 'INVALID_TOKEN' ||
        inheritedCode === 'TOKEN_EXPIRED' ||
        inheritedCode === 'AUTH_REQUIRED' ||
        inheritedCode === 'INVALID_AUTH_HEADER';

      if (shouldClearLocalSession) {
        try {
          if (typeof clearAuthToken === 'function') {
            clearAuthToken();
          }
        } catch (cleanupError) {
          logger.warn('Failed to clear auth token after refresh failure', {
            cleanupError,
          });
        }
        try {
          if (typeof clearCloudSessionHint === 'function') {
            clearCloudSessionHint();
          }
        } catch (cleanupError) {
          logger.warn('Failed to clear cloud session hint after refresh failure', {
            cleanupError,
          });
        }
      }

      const normalized = createApiRequestError('Session refresh failed.', {
        code: inheritedCode ?? 'SESSION_REFRESH_FAILED',
        cause,
      });
      normalized.status = inheritedStatus ?? 401;
      throw normalized;
    }
  })();

  pendingSessionRefreshRequest = request.finally(() => {
    pendingSessionRefreshRequest = null;
  });

  return pendingSessionRefreshRequest;
};

export const logoutVaultSession = async () => {
  if (pendingLogoutRequest) {
    return pendingLogoutRequest;
  }

  const request = (async () => {
    try {
      // Try server-side logout first so refresh cookie is revoked before local cleanup.
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      logger.warn('Logout request failed', { error });
    } finally {
      // Always clear client auth state even if network fails.
      clearAuthToken();
      clearCloudSessionHint();
    }
  })();

  pendingLogoutRequest = request.finally(() => {
    pendingLogoutRequest = null;
  });

  return pendingLogoutRequest;
};

export const waitForPendingLogout = async () => {
  if (!pendingLogoutRequest) {
    return;
  }
  await pendingLogoutRequest;
};

export const revokeVaultDeviceSession = async (input: {
  sessionId?: string;
  deviceId?: string;
  revokeAllOther?: boolean;
  revokeCurrent?: boolean;
}): Promise<SessionRevokeResponse> => {
  const { response, payload } = await fetchTypedAuthJson<SessionRevokeResponse>(
    `${API_BASE_URL}/api/auth/sessions/revoke`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
      body: JSON.stringify(input),
    },
    'Failed to revoke device session.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to revoke device session.', {
      payload,
      response,
    });
  }
  if (typeof payload.data?.revokedCount !== 'number' || !Array.isArray(payload.data.sessions)) {
    throw createApiRequestError('Failed to revoke device session.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }

  if (input.revokeCurrent) {
    clearAuthToken();
    clearCloudSessionHint();
  }

  return payload.data;
};

export const changeAccountPassword = async (
  currentPassword: string,
  newPassword: string,
  captchaToken: string
) => {
  const { response, payload } = await fetchAuthJson(
    `${API_BASE_URL}/api/auth/change-password`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        captchaToken: normalizeCaptchaToken(captchaToken),
      }),
    },
    'Failed to update account password.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to update account password.', {
      payload,
      response,
    });
  }

  return payload.data;
};

export const verifyMasterKeyChangeCaptcha = async (captchaToken: string) => {
  const { response, payload } = await fetchAuthJson(
    `${API_BASE_URL}/api/auth/captcha/verify-master-key-change`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
      body: JSON.stringify({
        captchaToken: normalizeCaptchaToken(captchaToken),
      }),
    },
    'Failed to verify CAPTCHA challenge.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to verify CAPTCHA challenge.', {
      payload,
      response,
    });
  }

  return payload.data;
};

export const verifyCloudUnlockCaptcha = async (captchaToken: string) => {
  const { response, payload } = await fetchAuthJson(
    `${API_BASE_URL}/api/auth/captcha/verify-cloud-unlock`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        captchaToken: normalizeCaptchaToken(captchaToken),
      }),
    },
    'Failed to verify CAPTCHA challenge.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to verify CAPTCHA challenge.', {
      payload,
      response,
    });
  }

  return payload.data;
};

export const getAuthenticatedProfile = async (): Promise<AuthenticatedProfile> => {
  const token = getAuthToken();
  if (!token) {
    return applyLocalProfileOverride(buildLocalFallbackProfile());
  }

  let response: Response;
  let payload: AuthResponse<AuthenticatedProfile> | null;
  try {
    const request = await fetchTypedAuthJson<AuthenticatedProfile>(
      `${API_BASE_URL}/api/auth/me`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...DEFAULT_BROWSER_AUTH_HEADERS,
          Authorization: `Bearer ${token}`,
        },
      },
      'Failed to load account sessions.'
    );
    response = request.response;
    payload = request.payload;
  } catch (cause) {
    const candidate = cause as ApiRequestError;
    if (
      candidate?.status === 401 ||
      candidate?.status === 403 ||
      candidate?.status === 404 ||
      candidate?.status === 405
    ) {
      return applyLocalProfileOverride(buildLocalFallbackProfile());
    }
    throw cause;
  }

  if (!payload?.success || !payload?.data) {
    throw createApiRequestError('Failed to load account sessions.', {
      payload,
      response,
      code: payload?.data ? undefined : 'INVALID_AUTH_RESPONSE',
    });
  }
  if (
    typeof payload.data.id !== 'string' ||
    typeof payload.data.username !== 'string' ||
    !Array.isArray(payload.data.sessions)
  ) {
    throw createApiRequestError('Failed to load account sessions.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }
  return applyLocalProfileOverride(payload.data);
};

export const updateAuthenticatedProfile = async (input: {
  profileName?: string;
  profilePhoto?: string;
}): Promise<ProfileUpdateResponse> => {
  if (!isProfileUpdateRouteUnavailable) {
    isProfileUpdateRouteUnavailable = readProfileRouteUnavailableState();
  }

  const normalizedInput = {
    profileName: normalizeProfileValue(input.profileName),
    profilePhoto: normalizeProfileValue(input.profilePhoto),
  };

  const requestCandidates: Array<{
    method: 'POST' | 'PUT' | 'PATCH';
    path: string;
  }> = [
    { method: 'POST', path: '/api/auth/profile' },
    { method: 'PUT', path: '/api/auth/profile' },
    { method: 'PATCH', path: '/api/auth/profile' },
    { method: 'POST', path: '/api/auth/me/profile' },
    { method: 'PUT', path: '/api/auth/me' },
    { method: 'PATCH', path: '/api/auth/me' },
  ];

  let sawRouteNotFound = false;

  for (const candidate of requestCandidates) {
    if (isProfileUpdateRouteUnavailable) {
      break;
    }

    try {
      const { response, payload } = await fetchTypedAuthJson<ProfileUpdateResponse>(
        `${API_BASE_URL}${candidate.path}`,
        {
          method: candidate.method,
          credentials: 'include',
          headers: {
            ...DEFAULT_BROWSER_AUTH_HEADERS,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAuthToken() || ''}`,
          },
          body: JSON.stringify(normalizedInput),
        },
        'Failed to update profile.'
      );

      if (
        payload?.success &&
        payload.data &&
        typeof payload.data.id === 'string' &&
        typeof payload.data.username === 'string' &&
        typeof payload.data.profileName === 'string' &&
        typeof payload.data.profilePhoto === 'string'
      ) {
        isProfileUpdateRouteUnavailable = false;
        writeProfileRouteUnavailableState(false);
        clearLocalProfileOverride(payload.data.username);
        return payload.data;
      }

      if (!payload?.success) {
        throw createApiRequestError('Failed to update profile.', {
          payload,
          response,
        });
      }

      throw createApiRequestError('Failed to update profile.', {
        payload,
        response,
        code: 'INVALID_AUTH_RESPONSE',
      });
    } catch (cause) {
      const candidateError = cause as ApiRequestError;
      if (candidateError?.status === 404 || candidateError?.status === 405) {
        sawRouteNotFound = true;
        isProfileUpdateRouteUnavailable = true;
        writeProfileRouteUnavailableState(true);
        continue;
      }
      // Network-level failure (no connectivity / server down): save locally and
      // surface a dedicated code so the caller can show a friendlier message.
      if (candidateError?.code === 'NETWORK_ERROR') {
        writeLocalProfileOverride({
          profileName: normalizedInput.profileName,
          profilePhoto: normalizedInput.profilePhoto,
        });
        const networkErr = createApiRequestError(
          'Profile saved locally. Changes will sync when the server is reachable.',
          { code: 'SAVED_LOCALLY', cause }
        );
        throw networkErr;
      }
      throw candidateError;
    }
  }

  // Last-resort fallback for stale backends that do not expose profile update routes:
  // keep profile values locally so the UI remains usable instead of failing hard.
  if (sawRouteNotFound) {
    isProfileUpdateRouteUnavailable = true;
    writeProfileRouteUnavailableState(true);
  }

  writeLocalProfileOverride({
    profileName: normalizedInput.profileName,
    profilePhoto: normalizedInput.profilePhoto,
  });

  try {
    const refreshedProfile = await getAuthenticatedProfile();
    return toProfileUpdateResponse(refreshedProfile);
  } catch {
    const fallbackUsername = resolveProfileOverrideUsername() || 'unknown';

    return {
      id: `local-${fallbackUsername}`,
      username: fallbackUsername,
      profileName: normalizedInput.profileName,
      profilePhoto: normalizedInput.profilePhoto,
      updatedAt: new Date().toISOString(),
    };
  }
};

export const renameVaultDeviceSession = async (
  deviceId: string,
  deviceName: string
): Promise<DeviceRenameResponse> => {
  const { response, payload } = await fetchTypedAuthJson<DeviceRenameResponse>(
    `${API_BASE_URL}/api/auth/sessions/device-name`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_BROWSER_AUTH_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`,
      },
      body: JSON.stringify({ deviceId, deviceName }),
    },
    'Failed to update device name.'
  );

  if (!payload?.success) {
    throw createApiRequestError('Failed to update device name.', {
      payload,
      response,
    });
  }
  if (typeof payload.data?.success !== 'boolean' || !Array.isArray(payload.data.sessions)) {
    throw createApiRequestError('Failed to update device name.', {
      payload,
      response,
      code: 'INVALID_AUTH_RESPONSE',
    });
  }

  return payload.data;
};
