import apiClient, { ApiResponse } from './apiClient';

type AuthUser = {
  id?: string;
  userId?: string;
  username?: string;
  [key: string]: unknown;
};

export interface LoginCredentials {
  username: string;
  password: string;
  deviceId?: string;
  otpToken?: string;
  otpCode?: string;
  challengeId?: string;
}

export interface RegisterPayload extends LoginCredentials {
  masterKey: string;
}

export interface AuthSessionPayload {
  token?: string;
  sessionId?: string;
  refreshToken?: string;
  rememberMe?: boolean;
  expiresIn?: number;
  twoFactorRequired?: boolean;
  mfaToken?: string;
  user?: AuthUser;
  [key: string]: unknown;
}

export interface LogoutPayload {
  loggedOut: boolean;
}

export type AuthProfilePayload = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
};

function assertLoginCredentials(
  value: unknown,
): asserts value is LoginCredentials {
  if (!isPlainObject(value)) {
    throw new TypeError('credentials must be an object.');
  }
  assertNonEmptyString(value.username, 'credentials.username');
  assertNonEmptyString(value.password, 'credentials.password');
}

function assertRegisterPayload(
  value: unknown,
): asserts value is RegisterPayload {
  assertLoginCredentials(value);
  const candidate = value as unknown as { masterKey?: unknown };
  assertNonEmptyString(candidate.masterKey, 'userData.masterKey');
}

export const authApi = {
  login: async (
    credentials: LoginCredentials,
  ): Promise<ApiResponse<AuthSessionPayload>> => {
    assertLoginCredentials(credentials);
    const { data } = await apiClient.post<ApiResponse<AuthSessionPayload>>(
      '/auth/login',
      credentials,
    );
    return data;
  },
  
  register: async (
    userData: RegisterPayload,
  ): Promise<ApiResponse<AuthSessionPayload>> => {
    assertRegisterPayload(userData);
    const { data } = await apiClient.post<ApiResponse<AuthSessionPayload>>(
      '/auth/register',
      userData,
    );
    return data;
  },
  
  logout: async (): Promise<ApiResponse<LogoutPayload>> => {
    const { data } = await apiClient.post<ApiResponse<LogoutPayload>>('/auth/logout');
    return data;
  },
  
  getMe: async (): Promise<ApiResponse<AuthProfilePayload>> => {
    const { data } = await apiClient.get<ApiResponse<AuthProfilePayload>>('/auth/me');
    return data;
  },
  
  refreshSession: async (): Promise<ApiResponse<AuthSessionPayload>> => {
    const { data } = await apiClient.post<ApiResponse<AuthSessionPayload>>(
      '/auth/refresh',
    );
    return data;
  }
};
