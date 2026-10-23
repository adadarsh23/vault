import apiClient from './apiClient';

export default apiClient;
export { apiClient };
export type { ApiResponse, ApiResponseError, ApiClientError } from './apiClient';
export { isApiResponse, isApiClientError, normalizeApiError, isNonEmptyString } from './apiClient';

export { authApi } from './authApi';
export type {
  AuthUser,
  LoginCredentials,
  RegisterPayload,
  AuthSessionPayload,
  LogoutPayload,
  AuthProfilePayload,
  CheckUsernameResponse,
  SaltResponse,
  ChangePasswordPayload,
  RevokeSessionsPayload,
} from './authApi';

export { vaultApi } from './vaultApi';
export type {
  MultipartFileCategory,
  VaultFolderRecord,
  TogglePinResponseData,
  StartMultipartUploadPayload,
  StartMultipartUploadResponseData,
  UploadMultipartPartResponseData,
  CompleteMultipartUploadPayload,
  FolderCreatePayload,
  BasicSuccessResponse,
  VaultIntegrityStatusData,
  VaultIntegrityVerifyData,
  SignedUrlResponseData,
} from './vaultApi';

export { systemApi } from './systemApi';
export type { LogEntry, GetLogsOptions, GetLogsResponse, ClearLogsResponse } from './systemApi';

export { securityApi } from './securityApi';
export type {
  SecurityDevice,
  SecurityBehavior,
  SecuritySettings,
  TwoFactorSetupResponse,
  TwoFactorVerifyResponse,
  IncidentRecord,
  SecurityMetrics,
} from './securityApi';
