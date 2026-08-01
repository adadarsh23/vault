import { VaultItem } from '../lib/storage';
import { decryptToFile } from '../lib/encryption';
import { decryptData, encryptData, encryptFile, deriveKey } from '../lib/cryptoPrimitives';
import { getStringContent } from '../lib/vaultItemContent';
import { uploadItemToCloud, uploadSettingsToCloud } from '../lib/sync';
import { fetchVaultSalt } from '../lib/auth-api';

const IDENTITY_SALT_SUFFIX = '-vault-pqc-salt';
const ROTATION_YIELD_THRESHOLD = 30;
const DEFAULT_BINARY_MIME_TYPE = 'application/octet-stream';
const MAX_ITEM_LABEL_LENGTH = 160;

export type VaultSettingsPreferences = object;

export interface ExportedRsaKeys {
  publicKey: string;
  privateKey: string;
}

export interface SyncSettingsOptions {
  force?: boolean;
}

interface SyncSettingsPayload {
  preferences: Record<string, unknown>;
  allowRestrictedTypes: boolean;
  rsaKeys?: ExportedRsaKeys;
}

class VaultServiceError extends Error {
  code: string;
  cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'VaultServiceError';
    this.code = code;
    this.cause = cause;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toItemLabel = (item: VaultItem, index: number): string => {
  const trimmedTitle = typeof item.title === 'string' ? item.title.trim() : '';
  if (!trimmedTitle) {
    return `item-${index + 1}`;
  }
  return trimmedTitle.slice(0, MAX_ITEM_LABEL_LENGTH);
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Unknown error';
};

const ensureNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new VaultServiceError(`${label} is required.`, 'INVALID_ARGUMENT');
  }

  if (value.trim().length === 0) {
    throw new VaultServiceError(`${label} cannot be empty.`, 'INVALID_ARGUMENT');
  }

  return value;
};

const normalizeRsaKeys = (value: unknown): ExportedRsaKeys | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const publicKey = typeof value.publicKey === 'string' ? value.publicKey.trim() : '';
  const privateKey = typeof value.privateKey === 'string' ? value.privateKey.trim() : '';

  if (!publicKey || !privateKey) {
    return undefined;
  }

  return { publicKey, privateKey };
};

const yieldToMainThread = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const notifyProgress = (
  onProgress: ((done: number, total: number) => void) | undefined,
  done: number,
  total: number
): void => {
  if (!onProgress) {
    return;
  }

  try {
    onProgress(done, total);
  } catch (error) {
    console.warn('Progress callback failed during key rotation:', error);
  }
};

const rotateBinaryContent = async (
  item: VaultItem,
  oldKey: string,
  resolvedNewKey: string,
  itemLabel: string
): Promise<Uint8Array> => {
  const mimeType = typeof item.metadata?.mimeType === 'string' ? item.metadata.mimeType : undefined;
  const decryptedUrl = await decryptToFile(item.content, oldKey, mimeType);

  if (!decryptedUrl) {
    throw new VaultServiceError(
      `Failed to decrypt binary item "${itemLabel}".`,
      'BINARY_DECRYPT_FAILED'
    );
  }

  try {
    const response = await fetch(decryptedUrl);
    if (!response.ok) {
      throw new VaultServiceError(
        `Failed to read decrypted binary item "${itemLabel}".`,
        'BINARY_FETCH_FAILED'
      );
    }

    const blob = await response.blob();
    const filename = item.title?.trim() || `item-${item.id}`;
    const decryptedFile = new File([blob], filename, {
      type: mimeType || blob.type || DEFAULT_BINARY_MIME_TYPE,
    });

    return await encryptFile(decryptedFile, resolvedNewKey);
  } finally {
    URL.revokeObjectURL(decryptedUrl);
  }
};

const rotateStringContent = async (
  item: VaultItem,
  oldKey: string,
  resolvedNewKey: string,
  itemLabel: string
): Promise<string> => {
  const encryptedContent = getStringContent(item.content);
  if (!encryptedContent) {
    throw new VaultServiceError(`Invalid content format for "${itemLabel}".`, 'INVALID_CONTENT');
  }

  const decrypted = await decryptData(encryptedContent, oldKey);
  if (decrypted === null) {
    throw new VaultServiceError(
      `Integrity check failed for "${itemLabel}".`,
      'INTEGRITY_CHECK_FAILED'
    );
  }

  return encryptData(decrypted, resolvedNewKey);
};

const dedupeItemsByNewestUpdate = (items: VaultItem[]): VaultItem[] => {
  const deduped = new Map<string, VaultItem>();

  for (const item of items) {
    const existing = deduped.get(item.id);
    if (!existing) {
      deduped.set(item.id, item);
      continue;
    }

    const currentUpdatedAt = isFiniteNumber(item.updatedAt) ? item.updatedAt : 0;
    const existingUpdatedAt = isFiniteNumber(existing.updatedAt) ? existing.updatedAt : 0;
    if (currentUpdatedAt >= existingUpdatedAt) {
      deduped.set(item.id, item);
    }
  }

  return Array.from(deduped.values());
};

/**
 * Service to handle complex vault operations like key rotation and migrations.
 * This separates business logic from the state management (Zustand).
 */
export const VaultService = {
  /**
   * Rotates the master key by re-encrypting all items.
   */
  async rotateMasterKey(
    items: VaultItem[],
    oldKey: string,
    newKey: string,
    username: string,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ resolvedNewKey: string; updatedItems: VaultItem[] }> {
    if (!Array.isArray(items)) {
      throw new VaultServiceError('Items must be an array.', 'INVALID_ARGUMENT');
    }

    const normalizedOldKey = ensureNonEmptyString(oldKey, 'Old key');
    const normalizedNewKey = ensureNonEmptyString(newKey, 'New key');
    const normalizedUsername = ensureNonEmptyString(username, 'Username');

    const rotationItems = dedupeItemsByNewestUpdate(items);
    const identitySalt = await fetchVaultSalt(normalizedUsername).catch(
      () => `${normalizedUsername}${IDENTITY_SALT_SUFFIX}`
    );
    const resolvedNewKey = await deriveKey(normalizedNewKey, identitySalt);

    if (resolvedNewKey === normalizedOldKey) {
      throw new Error('New master key must be different from the current one.');
    }

    const updatedItems: VaultItem[] = [];
    const total = rotationItems.length;

    if (total === 0) {
      notifyProgress(onProgress, 0, 0);
      return { resolvedNewKey, updatedItems };
    }

    for (let i = 0; i < total; i++) {
      const item = rotationItems[i];
      let updatedContent: VaultItem['content'];
      const itemLabel = toItemLabel(item, i);

      try {
        if (item.content instanceof Uint8Array) {
          updatedContent = await rotateBinaryContent(
            item,
            normalizedOldKey,
            resolvedNewKey,
            itemLabel
          );
        } else {
          updatedContent = await rotateStringContent(
            item,
            normalizedOldKey,
            resolvedNewKey,
            itemLabel
          );
        }

        const updatedItem = {
          ...item,
          content: updatedContent,
          updatedAt: Date.now(),
        };

        // Upload to the NEW vault ID
        await uploadItemToCloud(updatedItem, resolvedNewKey);
        updatedItems.push(updatedItem);

        notifyProgress(onProgress, i + 1, total);

        // Yield to prevent UI blocking
        if (total > ROTATION_YIELD_THRESHOLD) {
          await yieldToMainThread();
        }
      } catch (err) {
        const message = toErrorMessage(err);
        const detailedError = new VaultServiceError(
          `Key rotation failed at "${itemLabel}": ${message}`,
          'ROTATION_ITEM_FAILED',
          err
        );
        console.error(`Rotation failed at item ${i + 1} (${itemLabel}):`, err);
        throw detailedError;
      }
    }

    return { resolvedNewKey, updatedItems };
  },

  /**
   * Syncs current settings to the cloud.
   */
  async syncSettings(
    key: string | CryptoKey,
    preferences: VaultSettingsPreferences,
    allowRestrictedTypes: boolean,
    rsaKeys?: ExportedRsaKeys,
    options: SyncSettingsOptions = {}
  ): Promise<void> {
    if (!key) {
      throw new VaultServiceError('Master key is required.', 'INVALID_ARGUMENT');
    }
    const normalizedPreferences = isRecord(preferences) ? preferences : {};
    const normalizedRsaKeys = normalizeRsaKeys(rsaKeys);

    const payload: SyncSettingsPayload = {
      preferences: normalizedPreferences,
      allowRestrictedTypes: Boolean(allowRestrictedTypes),
    };

    if (normalizedRsaKeys) {
      payload.rsaKeys = normalizedRsaKeys;
    }

    await uploadSettingsToCloud(payload, key, options);
  },
};
