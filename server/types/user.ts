/**
 * User, Account, and Security Profile Type Definitions
 */

import type { UserRole } from './auth.ts';
import type { Timestamps } from './database.ts';

export type TwoFactorMethod = 'totp' | 'backup_codes' | 'email';

export interface TwoFactorStatus {
  enabled: boolean;
  method?: TwoFactorMethod;
  backupCodesRemaining?: number;
  verifiedAt?: Date | null;
}

export interface UserStorageQuota {
  bytesUsed: number;
  quotaBytes: number;
  percentageUsed: number;
  fileCount?: number;
}

export interface UserSecuritySettings {
  twoFactorEnabled: boolean;
  twoFactorMethod?: TwoFactorMethod;
  masterKeyEnvelopeVersion?: string;
  sessionTimeoutMinutes?: number;
  ipLockoutEnabled?: boolean;
}

export interface UserMetaDTO {
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
  registrationIp?: string | null;
  deviceCount?: number;
  preferences?: Record<string, unknown>;
}

export interface UserProfileDTO extends Timestamps {
  id: string;
  username: string;
  email?: string | null;
  role: UserRole;
  isEmailVerified: boolean;
  twoFactor: TwoFactorStatus;
  avatarUrl?: string | null;
  storage: UserStorageQuota;
  security: UserSecuritySettings;
  meta?: UserMetaDTO;
}
