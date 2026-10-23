import apiClient, { ApiResponse } from './apiClient';

export interface SecurityDevice {
  id: string;
  name: string;
  lastSeen: string | Date;
  accessCount: number;
  isVerified: boolean;
  trustScore: number;
  platform?: string | null;
}

export interface SecurityBehavior {
  knownIPs?: string[];
  knownDevices?: string[];
  knownLocations?: string[];
  typicalLoginHours?: number[];
  [key: string]: unknown;
}

export interface SecuritySettings {
  mfaEnabled: boolean;
  mfaMethods: ('totp' | 'email' | 'fido2')[];
  loginAlerts: boolean;
  suspiciousActivityAlerts: boolean;
  twoFactorRequired: boolean;
  sessionTimeout: number;
  [key: string]: unknown;
}

export interface TwoFactorSetupResponse {
  secret?: string;
  qrCodeUrl?: string;
  otpauth?: string;
  backupCodes?: string[];
  [key: string]: unknown;
}

export interface TwoFactorVerifyResponse {
  success: boolean;
  message?: string;
  backupCodes?: string[];
  [key: string]: unknown;
}

export interface IncidentRecord {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  timestamp: string;
  notes?: string;
  details?: Record<string, unknown>;
}

export interface SecurityMetrics {
  totalIncidents?: number;
  activeThreats?: number;
  trustedDevicesCount?: number;
  mfaAdoptionRate?: number;
  [key: string]: unknown;
}

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
};

export const securityApi = {
  loginVerify: async (
    password: string,
  ): Promise<ApiResponse<{ verified: boolean; expiresIn: number }>> => {
    const validPassword = assertNonEmptyString(password, 'password');
    const { data } = await apiClient.post<ApiResponse<{ verified: boolean; expiresIn: number }>>(
      '/security/login-verify',
      { password: validPassword },
    );
    return data;
  },

  getDevices: async (): Promise<ApiResponse<{ devices: SecurityDevice[] }>> => {
    const { data } =
      await apiClient.get<ApiResponse<{ devices: SecurityDevice[] }>>('/security/devices');
    return data;
  },

  verifyDevice: async (
    deviceId: string,
    token: string,
  ): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    const validDeviceId = assertNonEmptyString(deviceId, 'deviceId');
    const validToken = assertNonEmptyString(token, 'token');
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>(
      `/security/devices/${encodeURIComponent(validDeviceId)}/verify`,
      { token: validToken },
    );
    return data;
  },

  forgetDevice: async (
    deviceId: string,
  ): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    const validDeviceId = assertNonEmptyString(deviceId, 'deviceId');
    const { data } = await apiClient.delete<ApiResponse<{ success: boolean; message: string }>>(
      `/security/devices/${encodeURIComponent(validDeviceId)}`,
    );
    return data;
  },

  forgetAllOtherDevices: async (): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>(
      '/security/devices/forget-all',
    );
    return data;
  },

  getActivity: async (): Promise<ApiResponse<{ behavior: SecurityBehavior }>> => {
    const { data } =
      await apiClient.get<ApiResponse<{ behavior: SecurityBehavior }>>('/security/activity');
    return data;
  },

  getSettings: async (): Promise<ApiResponse<SecuritySettings>> => {
    const { data } = await apiClient.get<ApiResponse<SecuritySettings>>('/security/settings');
    return data;
  },

  updateSettings: async (
    settings: Partial<SecuritySettings>,
  ): Promise<ApiResponse<{ success: boolean; data: SecuritySettings }>> => {
    if (!settings || typeof settings !== 'object') {
      throw new TypeError('settings must be an object.');
    }
    const { data } = await apiClient.post<
      ApiResponse<{ success: boolean; data: SecuritySettings }>
    >('/security/settings', settings);
    return data;
  },

  enableMfa: async (): Promise<ApiResponse<TwoFactorSetupResponse>> => {
    const { data } =
      await apiClient.post<ApiResponse<TwoFactorSetupResponse>>('/security/mfa/enable');
    return data;
  },

  verifyMfa: async (
    token: string,
    code?: string,
    method = 'totp',
  ): Promise<ApiResponse<TwoFactorVerifyResponse>> => {
    const validToken = assertNonEmptyString(token || code, 'token');
    const { data } = await apiClient.post<ApiResponse<TwoFactorVerifyResponse>>(
      '/security/mfa/verify',
      {
        token: validToken,
        code: validToken,
        method,
      },
    );
    return data;
  },

  disableMfa: async (
    token: string,
  ): Promise<ApiResponse<{ success: boolean; message?: string }>> => {
    const validToken = assertNonEmptyString(token, 'token');
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; message?: string }>>(
      '/security/mfa/disable',
      { token: validToken },
    );
    return data;
  },

  // Admin Security Controls
  getAdminDashboard: async (): Promise<ApiResponse<SecurityMetrics>> => {
    const { data } = await apiClient.get<ApiResponse<SecurityMetrics>>('/security/admin/dashboard');
    return data;
  },

  getAdminIncidents: async (
    limit = 50,
  ): Promise<ApiResponse<{ incidents: IncidentRecord[]; total: number; limit: number }>> => {
    const { data } = await apiClient.get<
      ApiResponse<{ incidents: IncidentRecord[]; total: number; limit: number }>
    >('/security/admin/incidents', { params: { limit } });
    return data;
  },

  getAdminIncident: async (id: string): Promise<ApiResponse<IncidentRecord>> => {
    const validId = assertNonEmptyString(id, 'incidentId');
    const { data } = await apiClient.get<ApiResponse<IncidentRecord>>(
      `/security/admin/incidents/${encodeURIComponent(validId)}`,
    );
    return data;
  },

  updateAdminIncident: async (
    id: string,
    status: string,
    notes?: string,
  ): Promise<ApiResponse<{ success: boolean; message?: string }>> => {
    const validId = assertNonEmptyString(id, 'incidentId');
    const { data } = await apiClient.patch<ApiResponse<{ success: boolean; message?: string }>>(
      `/security/admin/incidents/${encodeURIComponent(validId)}`,
      { status, notes },
    );
    return data;
  },

  applyAdminAction: async (
    action: string,
    target: string,
    duration?: number,
  ): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    const validAction = assertNonEmptyString(action, 'action');
    const validTarget = assertNonEmptyString(target, 'target');
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>(
      '/security/admin/actions',
      { action: validAction, target: validTarget, duration },
    );
    return data;
  },
};
