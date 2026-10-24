import apiClient, { ApiResponse } from './apiClient';

export type AuthUser = {
  id?: string;
  userId?: string;
  username?: string;
  email?: string;
  role?: string;
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

export interface CheckUsernameResponse {
  available: boolean;
  exists?: boolean;
  message?: string;
}

export interface SaltResponse {
  salt: string;
  pqcSalt?: string;
  iterations?: number;
}

export interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword?: string;
  masterKey?: string;
  oldMasterKey?: string;
  [key: string]: unknown;
}

export interface RevokeSessionsPayload {
  sessionIds?: string[];
  allOthers?: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
};

function assertLoginCredentials(value: unknown): asserts value is LoginCredentials {
  if (!isPlainObject(value)) {
    throw new TypeError('credentials must be an object.');
  }
  assertNonEmptyString(value.username, 'credentials.username');
  assertNonEmptyString(value.password, 'credentials.password');
}

function assertRegisterPayload(value: unknown): asserts value is RegisterPayload {
  assertLoginCredentials(value);
  const candidate = value as unknown as { masterKey?: unknown };
  assertNonEmptyString(candidate.masterKey, 'userData.masterKey');
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<ApiResponse<AuthSessionPayload>> => {
    assertLoginCredentials(credentials);
    const { data } = await apiClient.post<ApiResponse<AuthSessionPayload>>(
      '/auth/login',
      credentials,
    );
    return data;
  },

  register: async (userData: RegisterPayload): Promise<ApiResponse<AuthSessionPayload>> => {
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
    const { data } = await apiClient.post<ApiResponse<AuthSessionPayload>>('/auth/refresh');
    return data;
  },

  checkUsername: async (username: string): Promise<ApiResponse<CheckUsernameResponse>> => {
    const validUsername = assertNonEmptyString(username, 'username');
    const { data } = await apiClient.get<ApiResponse<CheckUsernameResponse>>(
      '/auth/username-check',
      {
        params: { username: validUsername },
      },
    );
    return data;
  },

  getSalt: async (username: string): Promise<ApiResponse<SaltResponse>> => {
    const validUsername = assertNonEmptyString(username, 'username');
    const { data } = await apiClient.get<ApiResponse<SaltResponse>>('/auth/salt', {
      params: { username: validUsername },
    });
    return data;
  },

  checkSession: async (): Promise<
    ApiResponse<{ valid: boolean; active?: boolean; user?: AuthUser }>
  > => {
    const { data } =
      await apiClient.get<ApiResponse<{ valid: boolean; active?: boolean; user?: AuthUser }>>(
        '/auth/session-check',
      );
    return data;
  },

  revokeSessions: async (
    payload: RevokeSessionsPayload,
  ): Promise<ApiResponse<{ success: boolean; revokedCount?: number }>> => {
    if (!isPlainObject(payload)) {
      throw new TypeError('payload must be an object.');
    }
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; revokedCount?: number }>>(
      '/auth/sessions/revoke',
      payload,
    );
    return data;
  },

  updateDeviceName: async (
    deviceId: string,
    deviceName: string,
  ): Promise<ApiResponse<{ success: boolean }>> => {
    const validDeviceId = assertNonEmptyString(deviceId, 'deviceId');
    const validDeviceName = assertNonEmptyString(deviceName, 'deviceName');
    const { data } = await apiClient.post<ApiResponse<{ success: boolean }>>(
      '/auth/sessions/device-name',
      {
        deviceId: validDeviceId,
        deviceName: validDeviceName,
      },
    );
    return data;
  },

  updateProfile: async (
    profile: Record<string, unknown>,
  ): Promise<ApiResponse<AuthProfilePayload>> => {
    if (!isPlainObject(profile)) {
      throw new TypeError('profile must be an object.');
    }
    const { data } = await apiClient.post<ApiResponse<AuthProfilePayload>>(
      '/auth/profile',
      profile,
    );
    return data;
  },

  changePassword: async (
    payload: ChangePasswordPayload,
  ): Promise<ApiResponse<{ success: boolean; message?: string }>> => {
    if (!isPlainObject(payload)) {
      throw new TypeError('payload must be an object.');
    }
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; message?: string }>>(
      '/auth/change-password',
      payload,
    );
    return data;
  },
};
