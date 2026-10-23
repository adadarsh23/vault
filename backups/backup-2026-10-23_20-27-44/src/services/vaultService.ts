import { VaultItem, saveItem, deleteItem as deleteStorageItem } from '../lib/storage';
import { deriveKey } from '../lib/cryptoPrimitives';
import { reencryptVaultItemContent } from '../lib/vaultKeyRotation';
import {
  uploadItemToCloud,
  uploadSettingsToCloud,
  deleteItemFromCloud,
  getVaultId,
  runInParallelPool,
} from '../lib/sync';
import { fetchVaultSalt } from '../lib/auth-api';

const IDENTITY_SALT_SUFFIX = '-vault-pqc-salt';
const ROTATION_YIELD_THRESHOLD = 20;
const DEFAULT_CONCURRENCY = 5;
const MAX_ITEM_LABEL_LENGTH = 160;

export type VaultSettingsPreferences = Record<string, unknown> | object;

export interface ExportedRsaKeys {
  publicKey: string;
  privateKey: string;
}

export interface SyncSettingsOptions {
  force?: boolean;
}

export interface RotateMasterKeyOptions {
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
  persistLocal?: boolean;
  signal?: AbortSignal;
}

export interface SaveItemsOptions {
  syncCloud?: boolean;
  concurrency?: number;
  persistLocal?: boolean;
}

export interface PurgeTrashOptions {
  syncCloud?: boolean;
  concurrency?: number;
}

interface SyncSettingsPayload {
  preferences: Record<string, unknown>;
  allowRestrictedTypes: boolean;
  rsaKeys?: ExportedRsaKeys;
}

export type VaultServiceErrorCode =
  | 'INVALID_ARGUMENT'
  | 'IDENTICAL_KEY'
  | 'ROTATION_ITEM_FAILED'
  | 'ROTATION_FAILED'
  | 'SAVE_ITEMS_FAILED'
  | 'DELETE_ITEM_FAILED'
  | 'PURGE_TRASH_FAILED'
  | 'SYNC_SETTINGS_FAILED'
  | 'STORAGE_ERROR';

export class VaultServiceError extends Error {
  readonly code: VaultServiceErrorCode;
  override readonly cause?: unknown;
  readonly completedCount?: number;
  readonly totalCount?: number;

  constructor(
    message: string,
    code: VaultServiceErrorCode,
    cause?: unknown,
    context?: { completedCount?: number; totalCount?: number },
  ) {
    super(message);
    this.name = 'VaultServiceError';
    this.code = code;
    this.cause = cause;
    this.completedCount = context?.completedCount;
    this.totalCount = context?.totalCount;
    Object.setPrototypeOf(this, VaultServiceError.prototype);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toItemLabel = (item: Partial<VaultItem> | undefined, index?: number): string => {
  if (!item) {
    return typeof index === 'number' ? `item-${index + 1}` : 'unknown-item';
  }
  const trimmedTitle = typeof item.title === 'string' ? item.title.trim() : '';
  if (trimmedTitle) {
    return trimmedTitle.slice(0, MAX_ITEM_LABEL_LENGTH);
  }
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  if (id) {
    return id.slice(0, MAX_ITEM_LABEL_LENGTH);
  }
  return typeof index === 'number' ? `item-${index + 1}` : 'untitled-item';
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

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new VaultServiceError(`${label} cannot be empty.`, 'INVALID_ARGUMENT');
  }

  return trimmed;
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
  total: number,
): void => {
  if (!onProgress) {
    return;
  }

  try {
    onProgress(done, total);
  } catch (error) {
    console.warn('Progress callback failed during vault operation:', error);
  }
};

const dedupeItemsPreservingBinary = (items: VaultItem[]): VaultItem[] => {
  const mergedMap = new Map<string, VaultItem>();

  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) {
      continue;
    }

    const existing = mergedMap.get(item.id);
    if (!existing) {
      mergedMap.set(item.id, item);
      continue;
    }

    const existingHasBinary = existing.content instanceof Uint8Array;
    const itemHasBinary = item.content instanceof Uint8Array;

    if (existingHasBinary && !itemHasBinary) {
      const isNewer = (item.updatedAt || 0) > (existing.updatedAt || 0);
      mergedMap.set(item.id, {
        ...(isNewer ? item : existing),
        content: existing.content,
      });
    } else if (!existingHasBinary && itemHasBinary) {
      const isNewer = (existing.updatedAt || 0) > (item.updatedAt || 0);
      mergedMap.set(item.id, {
        ...(isNewer ? existing : item),
        content: item.content,
      });
    } else {
      const currentUpdatedAt = isFiniteNumber(item.updatedAt) ? item.updatedAt : 0;
      const existingUpdatedAt = isFiniteNumber(existing.updatedAt) ? existing.updatedAt : 0;
      if (currentUpdatedAt >= existingUpdatedAt) {
        mergedMap.set(item.id, item);
      }
    }
  }

  return Array.from(mergedMap.values());
};

/**
 * Service to handle complex vault operations like key rotation, batch saving, and migrations.
 * This cleanly separates business logic from state management (Zustand).
 */
export const VaultService = {
  /**
   * Rotates the master key by re-encrypting all items using modern envelope-aware crypto,
   * uploading them to the new cloud vault, and persisting them locally.
   */
  async rotateMasterKey(
    items: VaultItem[],
    oldKey: string,
    newKey: string,
    username: string,
    onProgressOrOptions?: ((done: number, total: number) => void) | RotateMasterKeyOptions,
  ): Promise<{ resolvedNewKey: string; updatedItems: VaultItem[] }> {
    if (!Array.isArray(items)) {
      throw new VaultServiceError('Items must be an array.', 'INVALID_ARGUMENT');
    }

    const normalizedOldKey = ensureNonEmptyString(oldKey, 'Old key');
    const normalizedNewKey = ensureNonEmptyString(newKey, 'New key');
    const normalizedUsername = ensureNonEmptyString(username, 'Username');

    let onProgress: ((done: number, total: number) => void) | undefined;
    let concurrency = DEFAULT_CONCURRENCY;
    let persistLocal = true;
    let signal: AbortSignal | undefined;

    if (typeof onProgressOrOptions === 'function') {
      onProgress = onProgressOrOptions;
    } else if (isRecord(onProgressOrOptions)) {
      if (typeof onProgressOrOptions.onProgress === 'function') {
        onProgress = onProgressOrOptions.onProgress as (done: number, total: number) => void;
      }
      if (isFiniteNumber(onProgressOrOptions.concurrency) && onProgressOrOptions.concurrency > 0) {
        concurrency = Math.min(Math.floor(onProgressOrOptions.concurrency), 16);
      }
      if (typeof onProgressOrOptions.persistLocal === 'boolean') {
        persistLocal = onProgressOrOptions.persistLocal;
      }
      if (onProgressOrOptions.signal instanceof AbortSignal) {
        signal = onProgressOrOptions.signal;
      }
    }

    if (signal?.aborted) {
      throw new VaultServiceError('Key rotation was aborted before starting.', 'ROTATION_FAILED');
    }

    const rotationItems = dedupeItemsPreservingBinary(items);
    const identitySalt = await fetchVaultSalt(normalizedUsername).catch(
      () => `${normalizedUsername}${IDENTITY_SALT_SUFFIX}`,
    );
    const resolvedNewKey = await deriveKey(normalizedNewKey, identitySalt);

    const [oldVaultId, newVaultId] = await Promise.all([
      getVaultId(normalizedOldKey).catch(() => null),
      getVaultId(resolvedNewKey).catch(() => null),
    ]);

    if (
      resolvedNewKey === normalizedOldKey ||
      (oldVaultId !== null && newVaultId !== null && oldVaultId === newVaultId)
    ) {
      throw new VaultServiceError(
        'New master key must be different from the current one.',
        'IDENTICAL_KEY',
      );
    }

    const total = rotationItems.length;
    if (total === 0) {
      notifyProgress(onProgress, 0, 0);
      return { resolvedNewKey, updatedItems: [] };
    }

    notifyProgress(onProgress, 0, total);

    const updatedItems: VaultItem[] = new Array(total);
    let completedCount = 0;

    await runInParallelPool(
      rotationItems,
      async (item, index) => {
        if (signal?.aborted) {
          throw new VaultServiceError(
            'Key rotation was aborted during processing.',
            'ROTATION_FAILED',
            undefined,
            { completedCount, totalCount: total },
          );
        }

        const itemLabel = toItemLabel(item, index);

        let updatedContent: VaultItem['content'];
        try {
          updatedContent = await reencryptVaultItemContent(item, normalizedOldKey, resolvedNewKey);
        } catch (cause) {
          const message = toErrorMessage(cause);
          throw new VaultServiceError(
            `Key rotation re-encryption failed at "${itemLabel}": ${message}`,
            'ROTATION_ITEM_FAILED',
            cause,
            { completedCount, totalCount: total },
          );
        }

        const updatedItem: VaultItem = {
          ...item,
          content: updatedContent,
          updatedAt: Date.now(),
        };

        try {
          await uploadItemToCloud(updatedItem, resolvedNewKey);
        } catch (cause) {
          const message = toErrorMessage(cause);
          throw new VaultServiceError(
            `Key rotation cloud upload failed at "${itemLabel}": ${message}`,
            'ROTATION_ITEM_FAILED',
            cause,
            { completedCount, totalCount: total },
          );
        }

        if (persistLocal) {
          try {
            await saveItem(updatedItem);
          } catch (persistErr) {
            console.warn(
              `Failed to persist item locally during rotation (${itemLabel}):`,
              persistErr,
            );
          }
        }

        updatedItems[index] = updatedItem;
        completedCount++;
        notifyProgress(onProgress, completedCount, total);

        if (total > ROTATION_YIELD_THRESHOLD) {
          await yieldToMainThread();
        }
      },
      concurrency,
    );

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
    options: SyncSettingsOptions = {},
  ): Promise<void> {
    if (!key || (typeof key === 'string' && key.trim().length === 0)) {
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

    try {
      await uploadSettingsToCloud(payload, key, { force: true, ...options });
    } catch (err) {
      throw new VaultServiceError(
        `Failed to sync settings to cloud: ${toErrorMessage(err)}`,
        'SYNC_SETTINGS_FAILED',
        err,
      );
    }
  },

  /**
   * Persists a list of vault items locally and optionally synchronizes them to the cloud.
   */
  async saveItems(
    key: string | CryptoKey | null | undefined,
    items: VaultItem[],
    options: SaveItemsOptions = {},
  ): Promise<void> {
    if (!Array.isArray(items)) {
      throw new VaultServiceError('Items must be an array.', 'INVALID_ARGUMENT');
    }

    const { syncCloud = false, concurrency = DEFAULT_CONCURRENCY, persistLocal = true } = options;

    if (syncCloud && (!key || (typeof key === 'string' && key.trim().length === 0))) {
      throw new VaultServiceError(
        'Master key is required to synchronize items to the cloud.',
        'INVALID_ARGUMENT',
      );
    }

    const errors: Array<{ id: string; error: unknown }> = [];

    if (persistLocal) {
      for (const item of items) {
        if (!item || !item.id) continue;
        try {
          await saveItem(item);
        } catch (err) {
          errors.push({ id: item.id, error: err });
        }
      }
    }

    if (syncCloud && key && items.length > 0) {
      await runInParallelPool(
        items,
        async (item) => {
          if (!item || !item.id) return;
          try {
            await uploadItemToCloud(item, key);
          } catch (err) {
            errors.push({ id: item.id, error: err });
          }
        },
        concurrency,
      );
    }

    if (errors.length > 0 && errors.length === items.length) {
      throw new VaultServiceError(
        `Failed to save all items (${errors.length} failed).`,
        'SAVE_ITEMS_FAILED',
        errors,
      );
    }
  },

  /**
   * Saves a single item locally and optionally syncs it to cloud.
   */
  async saveItem(
    key: string | CryptoKey | null | undefined,
    item: VaultItem,
    options: { syncCloud?: boolean } = {},
  ): Promise<void> {
    if (!item || !item.id) {
      throw new VaultServiceError('A valid VaultItem with an id is required.', 'INVALID_ARGUMENT');
    }
    await this.saveItems(key, [item], options);
  },

  /**
   * Deletes a single item locally and removes it from cloud storage.
   */
  async deleteItem(
    key: string | CryptoKey | null | undefined,
    itemId: string,
    options: { syncCloud?: boolean } = {},
  ): Promise<void> {
    const normalizedId = ensureNonEmptyString(itemId, 'Item ID');
    const { syncCloud = true } = options;

    try {
      await deleteStorageItem(normalizedId);
    } catch (err) {
      throw new VaultServiceError(
        `Failed to delete item locally: ${toErrorMessage(err)}`,
        'DELETE_ITEM_FAILED',
        err,
      );
    }

    if (syncCloud && key) {
      try {
        await deleteItemFromCloud(normalizedId, key);
      } catch (err) {
        console.warn(`Failed to delete item ${normalizedId} from cloud:`, err);
      }
    }
  },

  /**
   * Purges soft-deleted items (trash) locally and in cloud, preserving only active items.
   */
  async purgeDeletedItems(
    key: string | CryptoKey | null | undefined,
    items: VaultItem[],
    options: PurgeTrashOptions = {},
  ): Promise<{ activeItems: VaultItem[]; purgedCount: number }> {
    if (!Array.isArray(items)) {
      throw new VaultServiceError('Items must be an array.', 'INVALID_ARGUMENT');
    }

    const activeItems = items.filter((item) => !item.deletedAt);
    const trashItems = items.filter((item) => Boolean(item.deletedAt));
    const { syncCloud = true, concurrency = DEFAULT_CONCURRENCY } = options;

    for (const item of trashItems) {
      await deleteStorageItem(item.id).catch(() => {});
    }

    if (syncCloud && key && trashItems.length > 0) {
      await runInParallelPool(
        trashItems,
        async (item) => {
          await deleteItemFromCloud(item.id, key).catch(() => {});
        },
        concurrency,
      );
    }

    await this.saveItems(key, activeItems, { syncCloud: false, persistLocal: true });

    return { activeItems, purgedCount: trashItems.length };
  },
};
