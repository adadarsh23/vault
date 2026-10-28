/**
 * Vault Domain, Storage, and Cryptographic Type Definitions
 *
 * Defines the comprehensive taxonomy for vault categories, encryption envelopes,
 * file representations, folder hierarchies, and client snapshots.
 */

import type { SoftDeletable, Timestamps } from './database.ts';

/**
 * File categories stored as physical binary objects or GridFS streams
 */
export type FileCategory = 'photo' | 'video' | 'audio' | 'document' | 'other-files' | 'file';

/**
 * Text and JSON categories stored encrypted in MongoDB documents
 */
export type EncryptedCategory =
  | 'note'
  | 'chat'
  | 'todo'
  | 'password'
  | 'secret'
  | 'contact'
  | 'location'
  | 'settings'
  | 'system'
  | 'users'
  | 'card'
  | 'identity'
  | 'wifi';

/**
 * Complete union of all supported Vault categories
 */
export type VaultCategory =
  | 'photo'
  | 'video'
  | 'audio'
  | 'document'
  | 'note'
  | 'chat'
  | 'todo'
  | 'password'
  | 'secret'
  | 'contact'
  | 'location'
  | 'file'
  | 'other-files'
  | 'other'
  | 'settings'
  | 'system'
  | 'users'
  | 'card'
  | 'identity'
  | 'wifi';

/**
 * Supported payload encoding schemes
 */
export type VaultEncoding =
  'utf-8' | 'base64' | 'binary-base64' | 'gridfs-binary' | 'file-reference' | 'modern';

/**
 * Supported symmetric ciphers for file envelopes
 */
export type FileCipherAlgorithm = 'aes-256-gcm' | 'chacha20-poly1305';

/**
 * Encrypted payload envelope conforming to AES-256-GCM standards
 */
export interface EncryptedFieldPayload {
  cipherText: string;
  iv: string;
  authTag: string;
  algorithm?: 'aes-256-gcm' | string;
  salt?: string | null;
  keyVersion?: string;
}

/**
 * Modern Envelope Encryption format using wrapped Data Encryption Keys (DEK)
 */
export interface EncryptedEnvelopePayload {
  algorithm: FileCipherAlgorithm;
  iv: string;
  authTag: string;
  cipherText: string;
  wrappedDek: string;
  wrapIv: string;
  wrapTag: string;
  keyVersion: string;
  keyId: string;
}

/**
 * Metadata for items stored as physical or cloud objects
 */
export interface VaultItemFile {
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  size?: number;
  encryptionIv?: string;
  encryptionTag?: string;
}

/**
 * GridFS bucket upload metadata
 */
export interface GridFSItemMetadata {
  userId: string;
  itemId: string;
  category: VaultCategory;
  folder?: string | null;
  size: number;
  mimeType?: string;
  encryptionIv?: string;
  encryptionTag?: string;
}

/**
 * Master Key metadata and key derivation configuration
 */
export interface MasterKeyMetadata {
  derivationAlgorithm?: string;
  derivationParams?: {
    memory?: number;
    iterations?: number;
    parallelism?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
  lastAccessedAt?: Date;
  deviceId?: string;
}

/**
 * Vault item DTO returned across API responses
 */
export interface VaultItemDTO extends SoftDeletable, Timestamps {
  itemId: string;
  category: VaultCategory;
  folder?: string | null;
  title: string;
  payload?: string | null;
  modernPayload?: string | null;
  file?: VaultItemFile;
  encoding: VaultEncoding;
  gridFsId?: string | null;
  metadata?: Record<string, unknown>;
  isPinned: boolean;
  pinnedAt?: Date | null;
  clientUpdatedAt?: Date | null;
}

/**
 * Plaintext vault item representation before client-side or server-side encryption
 */
export interface PlaintextVaultItem {
  itemId?: string;
  category: VaultCategory;
  title: string;
  folder?: string | null;
  content: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
  clientUpdatedAt?: Date | string | null;
}

/**
 * Folder structure representation
 */
export interface FolderItem extends Timestamps {
  id: string;
  userId: string;
  username: string;
  name: string | Record<string, unknown>;
  nameHash?: string;
  itemType: string;
  parentId: string | null;
}

/**
 * Query filter for fetching and paginating vault items
 */
export interface VaultItemFilter {
  category?: VaultCategory | string;
  folder?: string | null;
  search?: string;
  isDeleted?: boolean;
  isPinned?: boolean;
  limit?: number;
  skip?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'clientUpdatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Full user snapshot structure
 */
export interface VaultSnapshot {
  user: {
    id: string;
    username: string;
    storageUsedBytes: number;
    quotaBytes: number;
  };
  vault: Record<string, unknown[]>;
  activityLogs: unknown[];
  folders?: FolderItem[];
}
