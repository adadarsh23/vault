/**
 * Authentication, Session, and Authorization Type Definitions
 *
 * Defines token payloads, authenticated user contexts, session data structures,
 * permission checks, and authentication credentials for Vault backend services.
 */

export type UserRole = 'user' | 'admin' | 'moderator';

export type JwtTokenType = 'access' | 'refresh' | 'mfa';

/**
 * Verified authenticated user principal attached to requests
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  sessionId?: string;
  role?: UserRole;
  deviceId?: string;
  email?: string;
}

/**
 * Unauthenticated guest principal context
 */
export interface GuestUser {
  isGuest: true;
  ip: string;
  requestId?: string;
}

export type RequestPrincipal = AuthenticatedUser | GuestUser;

/**
 * User permissions representation
 */
export interface UserPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
  canManageUsers: boolean;
}

/**
 * Untrusted raw decoded JWT before cryptographic verification
 */
export interface UntrustedJwtPayload {
  sub?: unknown;
  username?: unknown;
  sessionId?: unknown;
  deviceId?: unknown;
  type?: unknown;
  role?: unknown;
  iat?: unknown;
  exp?: unknown;
  [key: string]: unknown;
}

/**
 * Verified Access JWT payload structure
 */
export interface AccessTokenPayload {
  sub: string;
  username: string;
  sessionId: string;
  type: 'access';
  role?: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Verified Refresh JWT payload structure
 */
export interface RefreshTokenPayload {
  sub: string;
  username: string;
  sessionId: string;
  deviceId: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Verified Two-Factor MFA intermediate verification token payload
 */
export interface MfaTokenPayload {
  sub: string;
  username: string;
  type: 'mfa';
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export type AnyJwtPayload = AccessTokenPayload | RefreshTokenPayload | MfaTokenPayload;

/**
 * Discriminated result of a token verification operation
 */
export type TokenVerificationResult<T extends AnyJwtPayload = AccessTokenPayload> =
  { valid: true; payload: T } | { valid: false; error: string; code: string };

/**
 * Device session tracking representation
 */
export interface DeviceSessionInfo {
  sessionId: string;
  deviceId: string;
  deviceName?: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  isCurrent?: boolean;
}

/**
 * Token pair returned upon successful authentication
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

/**
 * Auth result returned by authentication services
 */
export interface AuthResult {
  user: {
    id: string;
    username: string;
    email?: string | null;
    role?: UserRole;
  };
  tokens: AuthTokens;
  requiresTwoFactor?: boolean;
  mfaToken?: string;
}

/**
 * Authentication input credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
  deviceId?: string;
  captchaToken?: string;
}

export interface RegisterCredentials {
  username: string;
  password: string;
  email?: string;
  deviceId?: string;
  captchaToken?: string;
}

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}

export interface TwoFactorVerifyPayload {
  code: string;
  mfaToken: string;
  deviceId?: string;
}
