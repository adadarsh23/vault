import { create } from 'zustand';
import { VaultItem, loadLocalItemsFromDb, saveItem, deleteItem } from '../lib/storage';
import {
  base64ToUint8Array,
  deriveKey,
  uint8ArrayToBase64,
  exportRSAKeyPair,
  importRSAKeyPair,
  generateRSAKeyPair,
} from '../lib/encryption';
import { clearCryptoKeyCache } from '../lib/cryptoPrimitives';
import {
  downloadAllFromCloud,
  downloadLogsFromCloud,
  downloadVaultSnapshotFromCloud,
  downloadLegacyVaultSnapshot,
  uploadItemToCloud,
  deleteItemFromCloud,
  uploadLogsToCloud,
  uploadProfileToCloud,
  uploadKeyCheckToCloud,
  getVaultId,
} from '../lib/sync';
import { useActivityStore } from './activityStore';
import { toast } from 'sonner';
import { handleError } from '../lib/error-handler';
import { logActivity, getSessionName } from '../lib/activity';
import { setActivityLoggingEnabled, setActivitySyncHandler } from '../lib/activity-sync';
import { VaultService, type ExportedRsaKeys } from '../services/vaultService';
import { vaultApi } from '../api/vaultApi';
import {
  clearAuthToken,
  clearCloudSessionHint,
  clearRememberedVaultAccess,
} from '../lib/auth-session';
import { fetchVaultSalt, logoutVaultSession, revokeVaultDeviceSession } from '../lib/auth-api';
import { reencryptVaultItemContent } from '../lib/vaultKeyRotation';
import { normalizeGeneratedCredentialLength, validatePassword } from '../lib/utils';
import { useNotificationStore } from './notificationStore';

export interface SecurityPreferences {
  isAutoLockEnabled: boolean;
  autoLockDuration: number;
  isBlurOnTabHideEnabled: boolean;
  isLockOnTabHideEnabled: boolean;
  isClipboardAutoClearEnabled: boolean;
  clipboardAutoClearDuration: number;
  isActivityLoggingEnabled: boolean;
  isMaskPasswordsEnabled: boolean;
  isFixedMaskLengthEnabled: boolean;
  isPurgeTrashOnLockEnabled: boolean;
  isRequireConfirmationOnDelete: boolean;
  isEphemeralSearchEnabled: boolean;
  isInlineMediaPreviewEnabled: boolean;
  isLightweightPreviewModeEnabled: boolean;
  isMediaAutoplayEnabled: boolean;
  isLowDataModeEnabled: boolean;
  isNetworkAwareAutoplayEnabled: boolean;
  isPerformanceHudEnabled: boolean;
  isLiveCaptureInfoEnabled: boolean;
  maxRecordingSizeMB: number;
  generatedCredentialLength: number;
  sidebarPosition: 'left' | 'right';
  isRefreshConfirmationEnabled: boolean;
  isPhotoExifStripped: boolean;
  isVideoBufferingEnabled: boolean;
  isAudioWaveformEnabled: boolean;
}

interface CloudSettingsSnapshot {
  preferences?: Partial<SecurityPreferences>;
  allowRestrictedTypes?: boolean;
  rsaKeys?: ExportedRsaKeys;
}

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
type SyncTrigger = 'manual' | 'retry' | 'background';

interface LoadedVaultSnapshot {
  items: VaultItem[];
  settings: CloudSettingsSnapshot | null;
}

interface ImportedBinaryPayload {
  __binary?: boolean;
  __IS_BINARY__?: boolean;
  data?: unknown;
}

const UI_YIELD_MS = 0;
const KEY_ROTATION_YIELD_THRESHOLD = 30;
const EXPORT_YIELD_THRESHOLD = 10;
const IMPORT_YIELD_THRESHOLD = 50;
const RELOAD_AFTER_PURGE_DELAY_MS = 2_000;
const CLOUD_SOURCE = 'cloud';
const IMPORTED_ITEM_TITLE_PREFIX = 'Imported item';
const MAX_IMPORTED_ITEM_TITLE_LENGTH = 200;
const VALID_ITEM_TYPES: ReadonlySet<VaultItem['type']> = new Set([
  'photo',
  'video',
  'audio',
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'contact',
  'document',
  'file',
  'location',
  'card',
  'identity',
  'wifi',
]);

interface VaultState {
  items: VaultItem[];
  isUnlocked: boolean;
  isVaultReady: boolean;
  username: string | null;
  masterKey: CryptoKey | null;
  vaultId: string | null;
  isLoading: boolean;
  allowRestrictedTypes: boolean;
  preferences: SecurityPreferences;
  syncStatus: SyncStatus;
  lastSuccessfulSyncAt: number | null;
  lastSyncAttemptAt: number | null;
  lastSyncError: string | null;
  syncConflictCount: number;
  hasPendingSyncRetry: boolean;
  isSyncingLogs: boolean;
  hasPendingLogSync: boolean;
  pinningItemIds: string[];
  rsaKeyPair: CryptoKeyPair | null;

  // Actions
  unlock: (key: string, identity: string) => Promise<void>;
  completeUnlockTransition: () => void;
  lock: () => void;
  fullLogout: (options?: { skipServerLogout?: boolean }) => void;
  setAllowRestrictedTypes: (allow: boolean) => void;
  updatePreferences: (updates: Partial<SecurityPreferences>) => void;
  changeMasterKey: (
    newKey: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
  exportVaultData: (onProgress?: (done: number, total: number) => void) => Promise<string>;
  importVaultData: (
    items: unknown[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
  fetchItems: (trigger?: SyncTrigger) => Promise<void>;
  addItem: (
    item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>,
    onProgress?: (progress: number) => void,
    options?: { source?: 'local' | 'cloud' }
  ) => Promise<VaultItem>;
  removeItem: (id: string) => Promise<void>;
  updateItem: (id: string, updates: Partial<VaultItem>) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  batchUpdateItems: (updates: { id: string; updates: Partial<VaultItem> }[]) => Promise<void>;
  syncWithCloud: () => Promise<void>;
  retryFailedSync: () => Promise<void>;
  syncLogs: () => Promise<void>;
  migrateLocalToCloud: () => Promise<void>;
  destroyAllData: () => Promise<void>;
  cancelSync: () => void;
  cancelActivityLogSync: () => void;
}

const DEFAULT_PREFERENCES: SecurityPreferences = {
  isAutoLockEnabled: true,
  autoLockDuration: 5, // 5 minutes
  isBlurOnTabHideEnabled: true,
  isLockOnTabHideEnabled: false,
  isClipboardAutoClearEnabled: true,
  clipboardAutoClearDuration: 30, // 30 seconds
  isActivityLoggingEnabled: true, // Default to logging enabled
  isMaskPasswordsEnabled: true, // Default to masking passwords
  isFixedMaskLengthEnabled: false,
  isPurgeTrashOnLockEnabled: false,
  isRequireConfirmationOnDelete: true,
  isEphemeralSearchEnabled: false,
  isInlineMediaPreviewEnabled: true,
  isLightweightPreviewModeEnabled: false,
  isMediaAutoplayEnabled: true,
  isLowDataModeEnabled: false,
  isNetworkAwareAutoplayEnabled: true,
  isPerformanceHudEnabled: false,
  isLiveCaptureInfoEnabled: false,
  maxRecordingSizeMB: 500,
  generatedCredentialLength: 16,
  sidebarPosition: 'left',
  isRefreshConfirmationEnabled: true,
  isPhotoExifStripped: true,
  isVideoBufferingEnabled: true,
  isAudioWaveformEnabled: false,
};

const sanitizePreferences = (
  preferences?: Partial<SecurityPreferences>
): Partial<SecurityPreferences> => {
  if (!preferences) return {};

  return {
    ...preferences,
    ...(preferences.generatedCredentialLength !== undefined
      ? {
          generatedCredentialLength: normalizeGeneratedCredentialLength(
            preferences.generatedCredentialLength
          ),
        }
      : {}),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toTimestampOrFallback = (value: unknown, fallback: number): number => {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
};

const isExportedRsaKeys = (value: unknown): value is ExportedRsaKeys => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.publicKey === 'string' &&
    value.publicKey.trim().length > 0 &&
    typeof value.privateKey === 'string' &&
    value.privateKey.trim().length > 0
  );
};

const maybeYieldToMainThread = async (total: number, threshold: number): Promise<void> => {
  if (total <= threshold) {
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, UI_YIELD_MS));
};

const reportProgress = (
  onProgress: ((done: number, total: number) => void) | undefined,
  done: number,
  total: number
) => {
  if (!onProgress) {
    return;
  }

  try {
    onProgress(done, total);
  } catch (error) {
    console.warn('Progress callback failed:', error);
  }
};

const mergeCloudWithLocalRuntimeItems = (
  localItems: VaultItem[],
  cloudItems: VaultItem[],
  additionalLocalItems: VaultItem[] = []
): VaultItem[] => {
  const localMap = new Map<string, VaultItem>();
  for (const item of [...localItems, ...additionalLocalItems]) {
    if (item && item.id) {
      localMap.set(item.id, item);
    }
  }
  const cloudIdSet = new Set(cloudItems.map((c) => c.id));
  const remainingLocals = Array.from(localMap.values()).filter((l) => !cloudIdSet.has(l.id));
  return [...remainingLocals, ...cloudItems];
};

const resolveActivityLoggingPreference = (
  snapshot: LoadedVaultSnapshot,
  fallback: boolean
): boolean => {
  const candidate = snapshot.settings?.preferences?.isActivityLoggingEnabled;
  return typeof candidate === 'boolean' ? candidate : fallback;
};

const buildSyncedSnapshotState = (
  state: VaultState,
  snapshot: LoadedVaultSnapshot,
  options: { includeLocalRuntimeItems: boolean; additionalLocalItems?: VaultItem[]; now: number }
) => {
  const nextPreferences = snapshot.settings?.preferences
    ? {
        ...state.preferences,
        ...sanitizePreferences(snapshot.settings.preferences),
      }
    : state.preferences;

  return {
    items: options.includeLocalRuntimeItems
      ? mergeCloudWithLocalRuntimeItems(
          state.items,
          snapshot.items,
          options.additionalLocalItems || []
        )
      : mergeCloudWithLocalRuntimeItems([], snapshot.items, options.additionalLocalItems || []),
    preferences: nextPreferences,
    allowRestrictedTypes: snapshot.settings?.allowRestrictedTypes ?? state.allowRestrictedTypes,
    isLoading: false,
    syncStatus: 'success' as const,
    lastSuccessfulSyncAt: options.now,
    lastSyncAttemptAt: options.now,
    lastSyncError: null,
    hasPendingSyncRetry: false,
    pinningItemIds: [],
  };
};

const exportRsaKeysIfAvailable = async (
  rsaKeyPair: CryptoKeyPair | null
): Promise<ExportedRsaKeys | undefined> => {
  if (!rsaKeyPair) {
    return undefined;
  }
  return exportRSAKeyPair(rsaKeyPair);
};

let settingsSyncChain: Promise<void> = Promise.resolve();

const queueSettingsSync = ({
  masterKey,
  preferences,
  allowRestrictedTypes,
  rsaKeyPair,
  context = 'Settings sync',
}: {
  masterKey: CryptoKey | null;
  preferences: SecurityPreferences;
  allowRestrictedTypes: boolean;
  rsaKeyPair: CryptoKeyPair | null;
  context?: string;
}) => {
  if (!masterKey) {
    return;
  }

  settingsSyncChain = settingsSyncChain
    .catch(() => {})
    .then(async () => {
      try {
        const exportedRsa = await exportRsaKeysIfAvailable(rsaKeyPair);
        await VaultService.syncSettings(masterKey, preferences, allowRestrictedTypes, exportedRsa);
      } catch (error) {
        console.warn(`[${context}] Settings sync failed:`, getErrorMessage(error, 'Sync error'));
      }
    });
};

const hasPreferenceUpdates = (
  current: SecurityPreferences,
  updates: Partial<SecurityPreferences>
): boolean => {
  for (const [key, value] of Object.entries(updates)) {
    const typedKey = key as keyof SecurityPreferences;
    if (current[typedKey] !== value) {
      return true;
    }
  }
  return false;
};

const toValidVaultItemType = (value: unknown): VaultItem['type'] =>
  typeof value === 'string' && VALID_ITEM_TYPES.has(value as VaultItem['type'])
    ? (value as VaultItem['type'])
    : 'file';

const normalizeImportedItem = (candidate: unknown, index: number): VaultItem | null => {
  if (!isRecord(candidate)) {
    return null;
  }

  const rawContent = candidate.content;
  let normalizedContent: VaultItem['content'] | null = null;

  if (typeof rawContent === 'string') {
    normalizedContent = rawContent;
  } else if (rawContent instanceof Uint8Array) {
    normalizedContent = rawContent;
  } else if (isRecord(rawContent)) {
    const binaryPayload = rawContent as ImportedBinaryPayload;
    if (binaryPayload.__binary || binaryPayload.__IS_BINARY__) {
      const payloadData = normalizeNonEmptyString(binaryPayload.data);
      if (!payloadData) {
        return null;
      }
      normalizedContent = base64ToUint8Array(payloadData);
    }
  }

  if (normalizedContent === null) {
    return null;
  }

  const now = Date.now();
  const title =
    normalizeNonEmptyString(candidate.title)?.slice(0, MAX_IMPORTED_ITEM_TITLE_LENGTH) ||
    `${IMPORTED_ITEM_TITLE_PREFIX} ${index + 1}`;

  const createdAt = toTimestampOrFallback(candidate.createdAt, now);
  const updatedAt = toTimestampOrFallback(candidate.updatedAt, createdAt);

  return {
    id: normalizeNonEmptyString(candidate.id) || crypto.randomUUID(),
    type: toValidVaultItemType(candidate.type),
    title,
    content: normalizedContent,
    metadata: isRecord(candidate.metadata)
      ? (candidate.metadata as VaultItem['metadata'])
      : undefined,
    source: normalizeNonEmptyString(candidate.source) || CLOUD_SOURCE,
    folder: normalizeNonEmptyString(candidate.folder) || undefined,
    username: normalizeNonEmptyString(candidate.username) || undefined,
    createdAt,
    updatedAt,
    deletedAt:
      candidate.deletedAt === undefined
        ? undefined
        : toTimestampOrFallback(candidate.deletedAt, updatedAt),
    isPinned: Boolean(candidate.isPinned),
    pinnedAt:
      candidate.pinnedAt === null
        ? null
        : candidate.pinnedAt === undefined
          ? null
          : toTimestampOrFallback(candidate.pinnedAt, updatedAt),
  };
};

const loadVaultSnapshot = async (masterKey: CryptoKey): Promise<LoadedVaultSnapshot> => {
  const snapshot = await downloadVaultSnapshotFromCloud(masterKey);
  if (!snapshot.hasKeyCheck) {
    await uploadKeyCheckToCloud(masterKey);
  }
  const settings = snapshot.settings as CloudSettingsSnapshot | null;

  if (snapshot.logs && Array.isArray(snapshot.logs)) {
    useActivityStore.getState().mergeEntries(snapshot.logs);
  }

  return {
    items: snapshot.items,
    settings,
  };
};

const migrateLegacyVaultIfNeeded = async (
  masterKey: CryptoKey,
  vaultId: string,
  existingItems: VaultItem[]
) => {
  if (existingItems.length > 0) {
    return existingItems;
  }

  const legacyItems = await downloadLegacyVaultSnapshot(masterKey, vaultId).catch(() => []);
  const migratableItems = legacyItems.filter(
    (item) => item.id !== '__settings__' && item.id !== '__logs__' && item.id !== '__profile__'
  );

  if (!migratableItems.length) {
    return existingItems;
  }

  for (const item of migratableItems) {
    await uploadItemToCloud(item, masterKey);
  }

  return migratableItems;
};

const runInBackground = (task: Promise<unknown>, context: string) => {
  task.catch((error) => {
    console.error(`${context} failed:`, error);
  });
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const candidate = error as { message?: string; error?: { message?: string } };
  if (typeof candidate?.error?.message === 'string' && candidate.error.message.trim()) {
    return candidate.error.message;
  }

  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  return fallback;
};

const getApiErrorCode = (error: unknown): string | null => {
  const candidate = error as { error?: { code?: string }; code?: string } | undefined;
  const nested = candidate?.error?.code;
  if (typeof nested === 'string' && nested.trim()) return nested;
  if (typeof candidate?.code === 'string' && candidate.code.trim()) {
    return candidate.code;
  }
  return null;
};

const isConflictLikeError = (error: unknown) => {
  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes('conflict') ||
    message.includes('newer version') ||
    message.includes('write conflict')
  );
};

const getSyncToastCopy = (trigger: SyncTrigger) => {
  switch (trigger) {
    case 'manual':
      return {
        loadingTitle: 'Syncing your vault',
        loadingDescription: 'Checking cloud data, settings, and protected items.',
        successTitle: 'Cloud sync complete',
        successDescription: (itemCount: number) =>
          `${itemCount} protected item${itemCount === 1 ? '' : 's'} are now aligned with the cloud.`,
        errorTitle: 'Cloud sync failed',
        errorDescription: 'Your local vault is still available. You can retry safely.',
      };
    case 'retry':
      return {
        loadingTitle: 'Retrying secure sync',
        loadingDescription: 'Resuming the last interrupted cloud sync attempt.',
        successTitle: 'Sync retry completed',
        successDescription: (itemCount: number) =>
          `${itemCount} protected item${itemCount === 1 ? '' : 's'} synced successfully after retry.`,
        errorTitle: 'Retry did not finish',
        errorDescription: 'The connection or cloud state still needs attention.',
      };
    default:
      return {
        loadingTitle: 'Refreshing vault data',
        loadingDescription: 'Pulling the latest encrypted vault state.',
        successTitle: 'Vault refreshed',
        successDescription: (itemCount: number) =>
          `${itemCount} protected item${itemCount === 1 ? '' : 's'} loaded from cloud storage.`,
        errorTitle: 'Vault refresh failed',
        errorDescription: 'The latest cloud snapshot could not be loaded.',
      };
  }
};

export const useVaultStore = create<VaultState>((set, get) => ({
  items: [],
  isUnlocked: false,
  isVaultReady: false,
  username: null,
  masterKey: null,
  vaultId: null,
  isLoading: false,
  allowRestrictedTypes: false,
  preferences: DEFAULT_PREFERENCES,
  syncStatus: 'idle',
  lastSuccessfulSyncAt: null,
  lastSyncAttemptAt: null,
  lastSyncError: null,
  syncConflictCount: 0,
  hasPendingSyncRetry: false,
  isSyncingLogs: false,
  hasPendingLogSync: false,
  pinningItemIds: [],
  rsaKeyPair: null,

  unlock: async (key: string, identity: string) => {
    set({ isLoading: true });

    // RSA Identity will be initialized after loading snapshot to ensure persistence.

    try {
      const derivedVaultId = await getVaultId(key);
      const keyBuf = base64ToUint8Array(key);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuf as any,
        { name: 'AES-GCM' },
        false, // non-extractable
        ['encrypt', 'decrypt']
      );
      keyBuf.fill(0);

      const initialSnapshot = await loadVaultSnapshot(cryptoKey);
      const migratedItems = await migrateLegacyVaultIfNeeded(
        cryptoKey,
        derivedVaultId,
        initialSnapshot.items
      );
      const snapshot =
        migratedItems === initialSnapshot.items
          ? initialSnapshot
          : await loadVaultSnapshot(cryptoKey);

      const localItems = await loadLocalItemsFromDb().catch(() => []);

      const now = Date.now();
      set((state) => ({
        ...buildSyncedSnapshotState(state, snapshot, {
          includeLocalRuntimeItems: true,
          additionalLocalItems: localItems,
          now,
        }),
        isUnlocked: true,
        isVaultReady: true,
        masterKey: cryptoKey,
        vaultId: derivedVaultId,
        username: identity,
      }));

      // Ensure RSA Identity persistence (Layer 4)
      runInBackground(
        (async () => {
          const rsaKeys = snapshot.settings?.rsaKeys;
          let pair: CryptoKeyPair;
          let shouldPersist = false;

          if (isExportedRsaKeys(rsaKeys)) {
            try {
              pair = await importRSAKeyPair(rsaKeys);
            } catch (e) {
              console.error('[Auth] Failed to import RSA keys, generating new ones...', e);
              pair = await generateRSAKeyPair();
              shouldPersist = true;
            }
          } else {
            pair = await generateRSAKeyPair();
            shouldPersist = true;
          }

          if (shouldPersist) {
            const exported = await exportRSAKeyPair(pair);
            await VaultService.syncSettings(
              key,
              get().preferences,
              get().allowRestrictedTypes,
              exported
            );
          }

          set({ rsaKeyPair: pair });
        })(),
        'RSA Identity Sync'
      );

      setActivityLoggingEnabled(
        resolveActivityLoggingPreference(snapshot, get().preferences.isActivityLoggingEnabled)
      );

      logActivity({
        actionType: 'auth_login',
        itemName: getSessionName(),
        description: `Vault unlocked and synced ${snapshot.items.length} items`,
        status: 'success',
      });

      toast.success(`Synced ${snapshot.items.length} items`);
      runInBackground(get().syncLogs(), 'Activity log sync');
      runInBackground(uploadProfileToCloud(identity, key), 'Profile sync');
    } catch (error) {
      clearAuthToken();
      set({
        isUnlocked: false,
        isVaultReady: false,
        username: null,
        masterKey: null,
        vaultId: null,
        items: [],
        isLoading: false,
        syncStatus: 'error',
        lastSyncAttemptAt: Date.now(),
        lastSyncError: getErrorMessage(error, 'Vault unlock sync failed.'),
        hasPendingSyncRetry: true,
        pinningItemIds: [],
      });
      throw error;
    }
  },

  completeUnlockTransition: () => {
    set({ isVaultReady: true });
  },

  lock: () => {
    const { masterKey, preferences, items } = get();

    logActivity({
      actionType: 'auth_lock',
      itemName: getSessionName(),
      description: 'Vault locked',
      status: 'success',
    });

    if (masterKey && preferences.isActivityLoggingEnabled) {
      runInBackground(uploadLogsToCloud(useActivityStore.getState().entries), 'Activity log sync');
    }

    if (preferences.isPurgeTrashOnLockEnabled && items.length > 0) {
      const activeItems = items.filter((item) => !item.deletedAt);
      if (activeItems.length !== items.length) {
        // Persist active items only, removing soft-deleted trash
        void (async () => {
          try {
            await (VaultService as any).saveItems?.(masterKey, activeItems);
          } catch (e) {
            // Ignore lock save errors
          }
        })();
      }
    }

    useActivityStore.getState().clearActivity();
    clearCryptoKeyCache();

    set({
      isUnlocked: false,
      isVaultReady: false,
      username: null,
      masterKey: null,
      vaultId: null,
      items: [],
      syncStatus: 'idle',
      lastSyncError: null,
      hasPendingSyncRetry: false,
      pinningItemIds: [],
    });
  },

  fullLogout: (options) => {
    if (!options?.skipServerLogout) {
      // Fire and forget server-side logout
      void logoutVaultSession();
    }

    clearAuthToken();
    clearCloudSessionHint();
    clearRememberedVaultAccess();
    useNotificationStore.getState().resetStore();
    get().lock();
  },

  setAllowRestrictedTypes: (allow) => {
    const currentState = get();
    if (currentState.allowRestrictedTypes === allow) {
      return;
    }

    set({ allowRestrictedTypes: allow });
    queueSettingsSync({
      masterKey: currentState.masterKey,
      preferences: currentState.preferences,
      allowRestrictedTypes: allow,
      rsaKeyPair: currentState.rsaKeyPair,
    });
  },

  updatePreferences: (updates) => {
    const sanitizedUpdates = sanitizePreferences(updates);
    const currentState = get();

    if (!hasPreferenceUpdates(currentState.preferences, sanitizedUpdates)) {
      return;
    }

    const newPreferences = {
      ...currentState.preferences,
      ...sanitizedUpdates,
    };

    setActivityLoggingEnabled(newPreferences.isActivityLoggingEnabled);
    set({ preferences: newPreferences });

    queueSettingsSync({
      masterKey: currentState.masterKey,
      preferences: newPreferences,
      allowRestrictedTypes: currentState.allowRestrictedTypes,
      rsaKeyPair: currentState.rsaKeyPair,
    });
  },

  migrateLocalToCloud: async () => {
    return;
  },

  changeMasterKey: async (newKey: string, onProgress?: (done: number, total: number) => void) => {
    const { items, masterKey: oldMasterKey, username } = get();
    if (!oldMasterKey || !username) {
      handleError(new Error('Vault must be unlocked to change master key'), 'Key Rotation');
      return;
    }

    set({ isLoading: true });
    try {
      const credentialValidation = validatePassword(newKey);
      if (!credentialValidation.isValid) {
        throw new Error(
          credentialValidation.error || 'Master key does not meet security requirements.'
        );
      }

      const salt = await fetchVaultSalt(username).catch(() => `${username}-vault-pqc-salt`);
      const resolvedNewKey = await deriveKey(newKey, salt);

      const newVaultId = await getVaultId(resolvedNewKey);
      if (newVaultId === get().vaultId) {
        throw new Error('New master key must be different from the current one.');
      }

      // Always rotate from the latest cloud snapshot to avoid leaving any
      // remotely-synced items encrypted with the previous key.
      const cloudItems = await downloadAllFromCloud(oldMasterKey).catch(() => []);
      const mergedItemsMap = new Map<string, VaultItem>();
      for (const item of [...items, ...cloudItems]) {
        const existing = mergedItemsMap.get(item.id);
        if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
          mergedItemsMap.set(item.id, item);
        }
      }
      const sourceItems = Array.from(mergedItemsMap.values());

      const updatedItems: VaultItem[] = [];
      const total = sourceItems.length;

      for (let i = 0; i < total; i++) {
        const item = sourceItems[i];

        try {
          const newContent = await reencryptVaultItemContent(item, oldMasterKey, resolvedNewKey);

          const updatedItem = {
            ...item,
            content: newContent,
            updatedAt: Date.now(),
          };
          await uploadItemToCloud(updatedItem, resolvedNewKey);
          updatedItems.push(updatedItem);

          reportProgress(onProgress, i + 1, total);
          await maybeYieldToMainThread(total, KEY_ROTATION_YIELD_THRESHOLD);
        } catch (err: unknown) {
          throw new Error(
            `Key rotation failed at "${item.title}": ${getErrorMessage(err, 'Unknown error')}`
          );
        }
      }

      // Re-encrypt settings for the new vault
      const { preferences, allowRestrictedTypes, rsaKeyPair } = get();
      const exportedRsa = await exportRsaKeysIfAvailable(rsaKeyPair);
      await VaultService.syncSettings(
        resolvedNewKey,
        preferences,
        allowRestrictedTypes,
        exportedRsa,
        { force: true }
      );
      await uploadKeyCheckToCloud(resolvedNewKey, { force: true });

      const newKeyBuf = base64ToUint8Array(resolvedNewKey);
      const resolvedNewCryptoKey = await crypto.subtle.importKey(
        'raw',
        newKeyBuf as any,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      newKeyBuf.fill(0);

      set({
        items: updatedItems,
        masterKey: resolvedNewCryptoKey,
        vaultId: newVaultId,
        isLoading: false,
      });

      toast.success(
        'master Key rotation complete. Your encrypted data now requires the new master Key.'
      );
      logActivity({
        actionType: 'password_change',
        itemName: 'master Key',
        description: 'master Key rotated and key-check sentinel refreshed',
        status: 'success',
      });
      runInBackground(get().syncLogs(), 'Activity log sync');
      runInBackground(
        uploadProfileToCloud(username, resolvedNewKey, { force: true }),
        'Profile sync'
      );
      runInBackground(
        revokeVaultDeviceSession({
          revokeAllOther: true,
          revokeCurrent: false,
        }),
        'Session revoke after master key rotation'
      );
    } catch (error) {
      set({ isLoading: false });
      handleError(error, 'Master Key Transformation');
      logActivity({
        actionType: 'password_change',
        itemName: 'Master key',
        description: 'Master key transformation interrupted',
        status: 'failure',
      });
      throw error;
    }
  },

  exportVaultData: async (onProgress) => {
    const { items } = get();
    const itemsToExport = [];
    const total = items.length;

    for (let i = 0; i < total; i++) {
      const item = items[i];
      if (item.content instanceof Uint8Array) {
        itemsToExport.push({
          ...item,
          content: {
            __binary: true,
            data: uint8ArrayToBase64(item.content),
          },
        });
      } else {
        itemsToExport.push(item);
      }

      reportProgress(onProgress, i + 1, total);
      await maybeYieldToMainThread(total, EXPORT_YIELD_THRESHOLD);
    }

    const exported = JSON.stringify(itemsToExport, null, 2);
    logActivity({
      actionType: 'export',
      itemName: 'Vault export',
      description: `Exported ${items.length} items`,
      status: 'success',
    });
    return exported;
  },

  importVaultData: async (
    rawItems: unknown[],
    onProgress?: (done: number, total: number) => void
  ) => {
    const { masterKey } = get();
    if (!masterKey) return;

    if (!Array.isArray(rawItems)) {
      throw new Error('Import payload must be an array of vault items.');
    }

    set({ isLoading: true });

    try {
      const normalizedItems = rawItems
        .map((item, index) => normalizeImportedItem(item, index))
        .filter((item): item is VaultItem => item !== null);

      if (normalizedItems.length === 0) {
        throw new Error('No valid vault items found in the import payload.');
      }

      const dedupedItemsMap = new Map<string, VaultItem>();
      for (const item of normalizedItems) {
        const existing = dedupedItemsMap.get(item.id);
        if (!existing || item.updatedAt >= existing.updatedAt) {
          dedupedItemsMap.set(item.id, item);
        }
      }
      const newItems = Array.from(dedupedItemsMap.values());

      const total = newItems.length;
      for (let i = 0; i < total; i++) {
        await uploadItemToCloud(newItems[i], masterKey);
        reportProgress(onProgress, i + 1, total);
        await maybeYieldToMainThread(total, IMPORT_YIELD_THRESHOLD);
      }

      await get().fetchItems();
      toast.success(`Imported ${total} items successfully`);
      logActivity({
        actionType: 'import',
        itemName: 'Vault import',
        description: `Imported ${total} items`,
        status: 'success',
      });
      runInBackground(get().syncLogs(), 'Activity log sync');
    } catch (error) {
      handleError(error, 'Import Data');
      logActivity({
        actionType: 'import',
        itemName: 'Vault import',
        description: getErrorMessage(error, 'Import failed'),
        status: 'failure',
      });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  syncWithCloud: async () => {
    const { masterKey } = get();
    if (!masterKey) return;

    set({ isLoading: true, syncStatus: 'syncing' });

    try {
      const snapshot = await loadVaultSnapshot(masterKey);

      const now = Date.now();
      set((state) =>
        buildSyncedSnapshotState(state, snapshot, {
          includeLocalRuntimeItems: true,
          now,
        })
      );

      setActivityLoggingEnabled(
        resolveActivityLoggingPreference(snapshot, get().preferences.isActivityLoggingEnabled)
      );

      toast.success(`Vault synchronized: ${snapshot.items.length} items verified`);
    } catch (error) {
      set({ isLoading: false, syncStatus: 'error', pinningItemIds: [] });
      handleError(error, 'Cloud Sync');
    }
  },

  retryFailedSync: async () => {
    await get().fetchItems('retry');
  },

  fetchItems: async (trigger = 'background') => {
    const { isUnlocked, masterKey } = get();
    if (!isUnlocked || !masterKey) return;

    const toastCopy = getSyncToastCopy(trigger);
    const toastId = toast.loading(toastCopy.loadingTitle, {
      description: toastCopy.loadingDescription,
    });

    set({
      isLoading: true,
      syncStatus: 'syncing',
      lastSyncAttemptAt: Date.now(),
      lastSyncError: null,
    });
    try {
      const snapshot = await loadVaultSnapshot(masterKey);
      const localItems = await loadLocalItemsFromDb().catch(() => []);

      const now = Date.now();
      set((state) =>
        buildSyncedSnapshotState(state, snapshot, {
          includeLocalRuntimeItems: true,
          additionalLocalItems: localItems,
          now,
        })
      );

      setActivityLoggingEnabled(
        resolveActivityLoggingPreference(snapshot, get().preferences.isActivityLoggingEnabled)
      );

      const itemCount = snapshot.items.length;
      toast.success(toastCopy.successTitle, {
        id: toastId,
        description: toastCopy.successDescription(itemCount),
      });
      logActivity({
        actionType: 'vault_sync',
        itemName: 'MongoDB sync',
        description: `Fetched ${itemCount} items`,
        status: 'success',
      });
    } catch (error) {
      const message = getErrorMessage(error, 'Cloud sync failed.');
      set((state) => ({
        isLoading: false,
        syncStatus: 'error',
        lastSyncAttemptAt: Date.now(),
        lastSyncError: message,
        hasPendingSyncRetry: true,
        pinningItemIds: [],
        syncConflictCount: state.syncConflictCount + (isConflictLikeError(error) ? 1 : 0),
      }));
      logActivity({
        actionType: 'error',
        itemName: 'Cloud Sync',
        description: message,
        status: 'failure',
      });
      toast.error(toastCopy.errorTitle, {
        id: toastId,
        description: `${toastCopy.errorDescription} ${message}`,
      });
    }
  },

  addItem: async (itemData, onProgress, options?: { source?: 'local' | 'cloud' }) => {
    const { isUnlocked, masterKey, username } = get();
    if (!isUnlocked || !masterKey) {
      const err = new Error('Vault must be unlocked');
      handleError(err, 'Add Item');
      throw err;
    }

    const normalizedTitle = normalizeNonEmptyString(itemData.title);
    if (!normalizedTitle) {
      const err = new Error('Item title is required');
      handleError(err, 'Add Item');
      throw err;
    }

    const now = Date.now();
    const source = options?.source ?? CLOUD_SOURCE;
    const newItem: VaultItem = {
      ...itemData,
      id: crypto.randomUUID(),
      title: normalizedTitle,
      username: username || undefined,
      source,
      createdAt: now,
      updatedAt: now,
    };

    set({ isLoading: true });
    try {
      // Always persist to local IndexedDB to guarantee persistence across page refreshes
      await saveItem(newItem);

      if (newItem.source === 'cloud') {
        try {
          await uploadItemToCloud(newItem, masterKey, onProgress);
        } catch (uploadErr) {
          console.warn(
            'Cloud upload failed, retaining item locally in IndexedDB as fallback:',
            uploadErr
          );
          newItem.source = 'local';
          await saveItem(newItem);
        }
      }
      set((state) => ({
        items: [newItem, ...state.items.filter((i) => i.id !== newItem.id)],
        isLoading: false,
      }));
      toast.success(
        `${newItem.title} saved ${newItem.source === 'local' ? 'locally' : 'to cloud'}`
      );
      logActivity({
        actionType: newItem.type === 'password' ? 'password_create' : 'file_upload',
        itemName: newItem.title,
        description: `${newItem.type} added (${newItem.source})`,
        status: 'success',
      });
      runInBackground(get().syncLogs(), 'Activity log sync');
      return newItem;
    } catch (error) {
      handleError(error, 'Save Item');
      set({ isLoading: false });
      throw error;
    }
  },

  removeItem: async (id: string) => {
    const { masterKey, items } = get();
    if (!masterKey) return;

    const item = items.find((i) => i.id === id);
    set({ isLoading: true });

    try {
      if (item?.source === 'local') {
        await deleteItem(id);
      } else {
        await deleteItemFromCloud(id, masterKey).catch(() => {});
        await deleteItem(id);
      }
      set((state) => ({
        items: state.items.filter((i) => i.id !== id),
        isLoading: false,
      }));
      toast.success('Item removed');
      logActivity({
        actionType: 'item_delete',
        itemName: item?.title || id,
        description: 'Item removed from vault',
        status: 'success',
      });
      runInBackground(get().syncLogs(), 'Activity log sync');
    } catch (error) {
      handleError(error, 'Remove Item');
      set({ isLoading: false });
    }
  },

  updateItem: async (id, updates) => {
    const { items, masterKey } = get();
    const item = items.find((i) => i.id === id);
    if (!item || !masterKey) return;

    const updatedItem = {
      ...item,
      ...updates,
      username: updates.username || item.username || get().username || undefined,
      updatedAt: Date.now(),
    };

    set({ isLoading: true });
    try {
      await saveItem(updatedItem);

      if (updatedItem.source === 'cloud') {
        try {
          await uploadItemToCloud(updatedItem, masterKey);
        } catch (uploadErr) {
          console.warn(
            'Cloud upload failed during update, retained locally in IndexedDB:',
            uploadErr
          );
        }
      }
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? updatedItem : i)),
        isLoading: false,
      }));
      toast.success('Update saved');
      logActivity({
        actionType: item.type === 'password' ? 'password_change' : 'item_update',
        itemName: updatedItem.title,
        description: `${item.type} updated`,
        status: 'success',
      });
      runInBackground(get().syncLogs(), 'Activity log sync');
    } catch (error) {
      handleError(error, 'Update Item');
      set({ isLoading: false });
      throw error;
    }
  },

  togglePin: async (id: string) => {
    const { items, pinningItemIds } = get();
    if (pinningItemIds.includes(id)) return;

    const item = items.find((i) => i.id === id);
    if (!item) return;

    const wasPinned = Boolean(item.isPinned);
    const nextPinnedAt = wasPinned ? null : Date.now();
    const optimisticItem = {
      ...item,
      isPinned: !wasPinned,
      pinnedAt: nextPinnedAt,
      updatedAt: Date.now(),
    };

    set((state) => ({
      items: state.items.map((i) => (i.id === id ? optimisticItem : i)),
      pinningItemIds: state.pinningItemIds.includes(id)
        ? state.pinningItemIds
        : [...state.pinningItemIds, id],
    }));

    try {
      const response = await vaultApi.togglePin(id, !wasPinned);
      const responseData = (response?.data || {}) as {
        isPinned?: boolean;
        pinnedAt?: string | number | null;
        updatedAt?: string | number;
      };

      set((state) => ({
        items: state.items.map((i) =>
          i.id === id
            ? {
                ...i,
                isPinned:
                  typeof responseData.isPinned === 'boolean' ? responseData.isPinned : i.isPinned,
                pinnedAt:
                  responseData.pinnedAt === null
                    ? null
                    : responseData.pinnedAt
                      ? new Date(responseData.pinnedAt).getTime()
                      : (i.pinnedAt ?? null),
                updatedAt: responseData.updatedAt
                  ? new Date(responseData.updatedAt).getTime()
                  : i.updatedAt,
              }
            : i
        ),
        pinningItemIds: state.pinningItemIds.filter((itemId) => itemId !== id),
      }));
    } catch (error) {
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? item : i)),
        pinningItemIds: state.pinningItemIds.filter((itemId) => itemId !== id),
      }));
      const code = getApiErrorCode(error);
      if (code === 'AUTH_REQUIRED' || code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
        toast.error('Session expired. Please sign in again to pin items.');
      } else if (code === 'ITEM_NOT_FOUND') {
        toast.error('Item no longer exists. Refreshing vault...');
        void get().fetchItems('background');
      } else {
        toast.error(getErrorMessage(error, 'Failed to update pin status.'));
      }
      handleError(error, 'Pin Item');
      throw error;
    }
  },

  batchUpdateItems: async (batchUpdates) => {
    const { items, masterKey } = get();
    if (!masterKey || batchUpdates.length === 0) return;

    set({ isLoading: true });
    const now = Date.now();

    try {
      const updatedItems = items.map((item) => {
        const update = batchUpdates.find((u) => u.id === item.id);
        if (!update) return item;
        return {
          ...item,
          ...update.updates,
          updatedAt: now,
        };
      });

      // Upload all changed items to cloud
      const currentBatch = batchUpdates.map((u) => {
        const item = updatedItems.find((i) => i.id === u.id);
        return item!;
      });

      for (const item of currentBatch) {
        await uploadItemToCloud(item, masterKey);
      }

      set({ items: updatedItems, isLoading: false });
      toast.success(`Updated ${batchUpdates.length} items`);
      runInBackground(get().syncLogs(), 'Activity log sync');
    } catch (error) {
      handleError(error, 'Batch Update');
      set({ isLoading: false });
    }
  },

  syncLogs: async () => {
    const { isUnlocked, masterKey, preferences } = get();
    if (!isUnlocked || !masterKey || !preferences.isActivityLoggingEnabled) return;

    if (get().isSyncingLogs) {
      set({ hasPendingLogSync: true });
      return;
    }

    const toastId = toast.loading('Syncing activity logs', {
      description: 'Checking local and cloud activity timelines.',
    });

    set({ isSyncingLogs: true, hasPendingLogSync: false });
    try {
      const remoteLogs = (await downloadLogsFromCloud()) ?? [];
      const localLogs = useActivityStore.getState().entries;
      const mergedLogs = Array.from(
        new Map([...remoteLogs, ...localLogs].map((entry) => [entry.id, entry])).values()
      ).sort((a, b) => b.timestamp - a.timestamp);

      toast.loading(`Syncing ${mergedLogs.length} activity logs...`, {
        id: toastId,
        description: 'Uploading updated timeline to the cloud.',
      });

      useActivityStore.getState().mergeEntries(mergedLogs);
      await uploadLogsToCloud(mergedLogs);

      toast.success('Activity logs synced', {
        id: toastId,
        description: 'Your activity timeline is now up to date.',
      });
    } catch (error) {
      console.error('Failed to sync logs to cloud:', error);
      toast.error('Log sync failed', {
        id: toastId,
        description: 'Could not update the cloud activity timeline.',
      });
    } finally {
      const shouldRunAgain = get().hasPendingLogSync;
      set({ isSyncingLogs: false, hasPendingLogSync: false });
      if (shouldRunAgain) {
        runInBackground(get().syncLogs(), 'Activity log sync');
      }
    }
  },

  destroyAllData: async () => {
    const { masterKey } = get();
    if (!masterKey) {
      toast.error('Unlock vault first');
      return;
    }

    set({ isLoading: true });
    try {
      const cloudItems = await downloadAllFromCloud(masterKey);

      // Batch purge
      await Promise.allSettled([
        ...cloudItems.map((item) => deleteItemFromCloud(item.id, masterKey)),
        deleteItemFromCloud('__settings__', masterKey),
        deleteItemFromCloud('__logs__', masterKey),
        deleteItemFromCloud('__profile__', masterKey),
        deleteItemFromCloud('__keycheck__', masterKey),
      ]);
      clearCloudSessionHint();
      clearRememberedVaultAccess();

      set({
        items: [],
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        isLoading: false,
      });

      toast.success('ALL DATA PURGED');
      logActivity({
        actionType: 'item_delete',
        itemName: 'Full Vault',
        description: 'Emergency destruction complete',
        status: 'success',
      });
      const logs = useActivityStore.getState().entries;
      await uploadLogsToCloud(logs).catch((error) => {
        console.error('Final activity sync failed:', error);
      });

      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), RELOAD_AFTER_PURGE_DELAY_MS);
      }
    } catch (error) {
      handleError(error, 'Emergency Destruction');
      set({ isLoading: false });
    }
  },

  cancelSync: () => {
    set({ isLoading: false, syncStatus: 'idle' });
    toast.error('Sync canceled');
  },

  cancelActivityLogSync: () => {
    set({ isSyncingLogs: false, hasPendingLogSync: false });
    toast.error('Activity log sync canceled');
  },
}));

setActivitySyncHandler(() => {
  const { isUnlocked, masterKey, syncLogs } = useVaultStore.getState();
  if (isUnlocked && masterKey) {
    runInBackground(syncLogs(), 'Activity log sync');
  }
});
