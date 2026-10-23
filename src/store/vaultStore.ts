import { create } from 'zustand';
import { VaultItem, loadLocalItemsFromDb, saveItem, deleteItem, clearVault } from '../lib/storage';
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
  runInParallelPool,
} from '../lib/sync';
import { useActivityStore } from './activityStore';
import { toast } from 'sonner';
import { handleError } from '../lib/error-handler';
import { logActivity, getSessionName } from '../lib/activity';
import { setActivityLoggingEnabled, setActivitySyncHandler } from '../lib/activity-sync';
import { VaultService, type ExportedRsaKeys } from '../services/vaultService';
import { vaultApi } from '../api/vaultApi';
import {
  AUTH_TOKEN_CLEARED_EVENT,
  clearAuthToken,
  clearCloudSessionHint,
  clearRememberedVaultAccess,
  getAuthToken,
} from '../lib/auth-session';
import {
  SESSION_REVOKED_EVENT,
  stopSessionSecurityWatcher,
  type SessionRevocationDetail,
} from '../lib/sessionSecurityService';
import { fetchVaultSalt, logoutVaultSession, revokeVaultDeviceSession } from '../lib/auth-api';
import { reencryptVaultItemContent } from '../lib/vaultKeyRotation';
import { normalizeGeneratedCredentialLength, validatePassword } from '../lib/utils';
import { useNotificationStore } from './notificationStore';
import { useIntegrityStore } from './integrityStore';
import { useGlobalNavigationStore } from './globalNavigationStore';
import { useVideoMiniPlayerStore } from './videoMiniPlayerStore';
import { revokeAllActiveBlobUrls } from '../lib/blobRegistry';

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
  isDiscreetModeEnabled: boolean;
  isDecoyVaultEnabled: boolean;
  decoyPasswordHash?: string;
  isPrintBlockingEnabled: boolean;
  isTabSwitchShieldEnabled: boolean;
  isBruteForceWipeEnabled: boolean;
  maxFailedAttemptsBeforeWipe: number;
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
  isDecoyMode: boolean;
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
  isDiscreetMode: boolean;
  sessionRevokedState: {
    isRevoked: boolean;
    reason: string;
    sessionId?: string;
    timestamp?: number;
  } | null;

  // Actions
  handleSessionRevoked: (detail?: Partial<SessionRevocationDetail>) => void;
  dismissSessionRevoked: () => void;
  unlock: (key: string, identity: string) => Promise<void>;
  unlockDecoyVault: (identity: string) => Promise<void>;
  setDecoyMode: (enabled: boolean) => void;
  completeUnlockTransition: () => void;
  lock: () => void;
  panicLock: () => void;
  toggleDiscreetMode: () => void;
  setDiscreetMode: (enabled: boolean) => void;
  fullLogout: (options?: { skipServerLogout?: boolean }) => void;
  setAllowRestrictedTypes: (allow: boolean) => void;
  updatePreferences: (updates: Partial<SecurityPreferences>) => void;
  changeMasterKey: (
    newKey: string,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  exportVaultData: (onProgress?: (done: number, total: number) => void) => Promise<string>;
  importVaultData: (
    items: unknown[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  fetchItems: (trigger?: SyncTrigger) => Promise<void>;
  addItem: (
    item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>,
    onProgress?: (progress: number) => void,
    options?: { source?: 'local' | 'cloud' },
  ) => Promise<VaultItem>;
  removeItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateItem: (id: string, updates: Partial<VaultItem>) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  batchUpdateItems: (updates: { id: string; updates: Partial<VaultItem> }[]) => Promise<void>;
  syncWithCloud: () => Promise<void>;
  retryFailedSync: () => Promise<void>;
  syncLogs: () => Promise<void>;
  migrateLocalToCloud: () => Promise<void>;
  destroyAllData: () => Promise<void>;
  emergencyLocalWipe: () => Promise<void>;
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
  isDiscreetModeEnabled: true,
  isDecoyVaultEnabled: false,
  decoyPasswordHash: undefined,
  isPrintBlockingEnabled: true,
  isTabSwitchShieldEnabled: true,
  isBruteForceWipeEnabled: true,
  maxFailedAttemptsBeforeWipe: 10,
};

const getInitialPreferences = (): SecurityPreferences => {
  const base = { ...DEFAULT_PREFERENCES };
  if (typeof localStorage !== 'undefined') {
    try {
      const storedDecoyHash =
        localStorage.getItem('vault_decoy_pin_hash') ||
        localStorage.getItem('vault_decoy_password_hash') ||
        localStorage.getItem('vault_decoy_hash') ||
        localStorage.getItem('decoy_pin_hash') ||
        localStorage.getItem('decoyPasswordHash');
      const storedDecoyEnabled = localStorage.getItem('vault_decoy_enabled');
      if (storedDecoyHash && storedDecoyHash !== 'null' && storedDecoyHash !== 'undefined') {
        base.decoyPasswordHash = storedDecoyHash;
        base.isDecoyVaultEnabled = storedDecoyEnabled !== 'false';
      }
    } catch {
      /* ignore */
    }
  }
  return base;
};

const sanitizePreferences = (
  preferences?: Partial<SecurityPreferences>,
): Partial<SecurityPreferences> => {
  if (!preferences) return {};

  return {
    ...preferences,
    ...(preferences.generatedCredentialLength !== undefined
      ? {
          generatedCredentialLength: normalizeGeneratedCredentialLength(
            preferences.generatedCredentialLength,
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
  total: number,
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
  additionalLocalItems: VaultItem[] = [],
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
  fallback: boolean,
): boolean => {
  const candidate = snapshot.settings?.preferences?.isActivityLoggingEnabled;
  return typeof candidate === 'boolean' ? candidate : fallback;
};

const buildSyncedSnapshotState = (
  state: VaultState,
  snapshot: LoadedVaultSnapshot,
  options: { includeLocalRuntimeItems: boolean; additionalLocalItems?: VaultItem[]; now: number },
) => {
  const nextPreferences = snapshot.settings?.preferences
    ? {
        ...state.preferences,
        ...sanitizePreferences(snapshot.settings.preferences),
      }
    : state.preferences;

  if (typeof localStorage !== 'undefined') {
    try {
      if (nextPreferences.decoyPasswordHash) {
        localStorage.setItem('vault_decoy_pin_hash', nextPreferences.decoyPasswordHash);
        localStorage.setItem(
          'vault_decoy_enabled',
          String(nextPreferences.isDecoyVaultEnabled ?? true),
        );
        if (state.username) {
          const normUser = state.username.trim().toLowerCase();
          localStorage.setItem(
            `vault_decoy_pin_hash_${normUser}`,
            nextPreferences.decoyPasswordHash,
          );
        }
      } else if (snapshot.settings?.preferences && nextPreferences.isDecoyVaultEnabled === false) {
        localStorage.removeItem('vault_decoy_pin_hash');
        localStorage.setItem('vault_decoy_enabled', 'false');
      }
    } catch {
      /* ignore */
    }
  }

  return {
    items: options.includeLocalRuntimeItems
      ? mergeCloudWithLocalRuntimeItems(
          state.items,
          snapshot.items,
          options.additionalLocalItems || [],
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
  rsaKeyPair: CryptoKeyPair | null,
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
  updates: Partial<SecurityPreferences>,
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
  existingItems: VaultItem[],
) => {
  if (existingItems.length > 0) {
    return existingItems;
  }

  const legacyItems = await downloadLegacyVaultSnapshot(masterKey, vaultId).catch(() => []);
  const migratableItems = legacyItems.filter(
    (item) => item.id !== '__settings__' && item.id !== '__logs__' && item.id !== '__profile__',
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
  preferences: getInitialPreferences(),
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
  isDiscreetMode: true,
  isDecoyMode: false,
  sessionRevokedState: null,

  unlockDecoyVault: async (identity: string) => {
    const dummyItems: VaultItem[] = [
      {
        id: 'decoy-photo-1',
        type: 'photo',
        title: 'Alpine Peak.jpg',
        content:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgODAwIDYwMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnMSIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwZjE3MmEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMxZTI5M2IiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cxKSIgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiLz48cGF0aCBmaWxsPSIjMzhiZGY4IiBvcGFjaXR5PSIwLjUiIGQ9Ik0wIDQ1MCAzMDAgMjAwIEw1NTAgNDAwIEw4MDAgMjUwIEw4MDAgNjAwIEwwIDYwMCBaIi8+PHBhdGggZmlsbD0iIzAyODRjNyIgb3BhY2l0eT0iMC43IiBkPSJNMCA1MDAgTDIwMCAzNTAgTDQ1MCA0ODAgTDcwMCAzMjAgTDgwMCA0MDAgTDgwMCA2MDAgTDAgNjAwIFoiLz48Y2lyY2xlIGN4PSI2NTAiIGN5PSIxMjAiIHI9IjUwIiBmaWxsPSIjZmFjYzE1IiBvcGFjaXR5PSIwLjkiLz48L3N2Zz4=',
        folder: 'Wallpapers',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 86400000 * 3,
        metadata: {
          mimeType: 'image/svg+xml',
          size: 1024,
          extension: 'jpg',
          width: 800,
          height: 600,
          aspectRatio: 1.33,
          isE2EE: true,
        },
      },
      {
        id: 'decoy-photo-2',
        type: 'photo',
        title: 'Emerald Meadow.png',
        content:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgODAwIDYwMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnMiIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwNjRlM2IiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwMjJjMjIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cyKSIgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiLz48cGF0aCBmaWxsPSIjMTBiOTgxIiBvcGFjaXR5PSIwLjUiIGQ9Ik0wIDYwMCAxNTAgMzAwIEwzMDAgNjAwIEw0NTAgMzUwIEw2MDAgNjAwIEw3NTAgNDAwIEw4MDAgNTAwIEw4MDAgNjAwIFoiLz48Y2lyY2xlIGN4PSIxNTAiIGN5PSIxNTAiIHI9IjQwIiBmaWxsPSIjZTJlOGYwIiBvcGFjaXR5PSIwLjYiLz48L3N2Zz4=',
        folder: 'Wallpapers',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 86400000 * 2,
        metadata: {
          mimeType: 'image/svg+xml',
          size: 1024,
          extension: 'png',
          width: 800,
          height: 600,
          aspectRatio: 1.33,
          isE2EE: true,
        },
      },
      {
        id: 'decoy-note-1',
        type: 'note',
        title: 'Weekly Groceries',
        content: 'Organic Apples, Almond Milk, Brown Rice, Avocados, Green Tea',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
        metadata: {
          mimeType: 'text/plain',
          size: 64,
          isE2EE: true,
        },
      },
      {
        id: 'decoy-wifi-1',
        type: 'wifi',
        title: 'Home Fiber Wi-Fi',
        content: JSON.stringify({
          ssid: 'Home_5G_Network',
          security: 'WPA2/WPA3',
          passwordKey: 'HomeNetworkSecure2026',
          notes: 'Primary 5GHz router network',
        }),
        folder: 'Personal',
        createdAt: Date.now() - 86400000 * 5,
        updatedAt: Date.now() - 86400000 * 5,
        metadata: {
          ssid: 'Home_5G_Network',
          encryption: 'WPA2/WPA3',
          security: 'WPA2/WPA3',
          password: 'HomeNetworkSecure2026',
          passwordKey: 'HomeNetworkSecure2026',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-doc-1',
        type: 'document',
        title: 'Travel_Checklist_2026.md',
        content:
          '# Travel Checklist\n- Passport & IDs\n- Flight Boarding Passes\n- Hotel reservation vouchers\n- Portable chargers',
        folder: 'Travel',
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now() - 86400000 * 4,
        metadata: {
          mimeType: 'text/markdown',
          size: 128,
          isE2EE: true,
        },
      },
      {
        id: 'decoy-password-1',
        type: 'password',
        title: 'Netflix Family',
        content: JSON.stringify({
          username: 'alex.doe@example.com',
          password: 'DecoyPassword2026!',
          website: 'https://netflix.com',
          notes: 'Standard 4K family streaming profile',
        }),
        folder: 'Entertainment',
        createdAt: Date.now() - 86400000 * 6,
        updatedAt: Date.now() - 86400000 * 6,
        metadata: {
          username: 'alex.doe@example.com',
          password: 'DecoyPassword2026!',
          website: 'https://netflix.com',
          notes: 'Standard 4K family streaming profile',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-password-2',
        type: 'password',
        title: 'Personal Outlook Mail',
        content: JSON.stringify({
          username: 'alex.personal@outlook.com',
          password: 'OutlookSecurePass99$',
          website: 'https://outlook.live.com',
          notes: 'Secondary personal inbox',
        }),
        folder: 'Personal',
        createdAt: Date.now() - 86400000 * 5,
        updatedAt: Date.now() - 86400000 * 5,
        metadata: {
          username: 'alex.personal@outlook.com',
          password: 'OutlookSecurePass99$',
          website: 'https://outlook.live.com',
          notes: 'Secondary personal inbox',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-card-1',
        type: 'card',
        title: 'Checking Debit Card',
        content: JSON.stringify({
          cardNumber: '•••• •••• •••• 4821',
          expiryMonth: '09',
          expiryYear: '29',
          cvv: '742',
          cardholderName: 'Alex Doe',
          bankName: 'Apex Trust Bank',
          cardType: 'visa',
        }),
        folder: 'Finance',
        createdAt: Date.now() - 86400000 * 7,
        updatedAt: Date.now() - 86400000 * 7,
        metadata: {
          cardNumber: '•••• •••• •••• 4821',
          expiryMonth: '09',
          expiryYear: '29',
          cvv: '742',
          cardholderName: 'Alex Doe',
          bankName: 'Apex Trust Bank',
          cardType: 'visa',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-identity-1',
        type: 'identity',
        title: 'Primary Passport Profile',
        content: JSON.stringify({
          documentType: 'Passport',
          fullName: 'Alex Doe',
          documentNumber: 'P89234190',
          issuingCountry: 'United States',
          issueDate: '2023-05-12',
          expiryDate: '2033-05-12',
          notes: 'Primary Travel Passport',
        }),
        folder: 'Personal',
        createdAt: Date.now() - 86400000 * 8,
        updatedAt: Date.now() - 86400000 * 8,
        metadata: {
          documentType: 'Passport',
          fullName: 'Alex Doe',
          documentNumber: 'P89234190',
          issuingCountry: 'United States',
          issueDate: '2023-05-12',
          expiryDate: '2033-05-12',
          notes: 'Primary Travel Passport',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-contact-1',
        type: 'contact',
        title: 'Sarah Doe (Emergency)',
        content: JSON.stringify({
          email: 'sarah.doe@example.com',
          phone: '+1 (555) 234-5678',
          company: 'Family Support',
          notes: 'Primary emergency contact',
        }),
        folder: 'Personal',
        createdAt: Date.now() - 86400000 * 9,
        updatedAt: Date.now() - 86400000 * 9,
        metadata: {
          email: 'sarah.doe@example.com',
          phone: '+1 (555) 234-5678',
          company: 'Family Support',
          notes: 'Primary emergency contact',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-location-1',
        type: 'location',
        title: 'Home Residence',
        content: JSON.stringify({
          latitude: 37.7749,
          longitude: -122.4194,
          address: '742 Evergreen Terrace, San Francisco, CA',
        }),
        folder: 'Personal',
        createdAt: Date.now() - 86400000 * 10,
        updatedAt: Date.now() - 86400000 * 10,
        metadata: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: '742 Evergreen Terrace, San Francisco, CA',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-todo-1',
        type: 'todo',
        title: 'Finalize quarterly goals',
        content: JSON.stringify({
          task: 'Finalize quarterly goals',
          description: 'Review sprint deliverables and archive completed project tasks.',
          priority: 'medium',
          completed: false,
          dueDate: '2026-09-01',
        }),
        folder: 'Work',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 86400000 * 2,
        metadata: {
          task: 'Finalize quarterly goals',
          description: 'Review sprint deliverables and archive completed project tasks.',
          priority: 'medium',
          completed: false,
          dueDate: '2026-09-01',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-chat-1',
        type: 'chat',
        title: 'Project Lead Workspace',
        content: JSON.stringify({
          participants: ['Alex Doe', 'Project Lead'],
          disappearingTimer: 'off',
          messages: [
            {
              id: 'decoy-msg-1',
              sender: 'Project Lead',
              text: 'Welcome to the project workspace! All documentation is synced.',
              timestamp: Date.now() - 3600000 * 3,
            },
            {
              id: 'decoy-msg-2',
              sender: 'Alex Doe',
              text: 'Thanks! Reviewing the onboarding notes now.',
              timestamp: Date.now() - 3600000 * 2,
            },
          ],
          updatedAt: Date.now() - 3600000 * 2,
        }),
        folder: 'Work',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 3600000 * 2,
        metadata: {
          participants: ['Alex Doe', 'Project Lead'],
          disappearingTimer: 'off',
          updatedAt: Date.now() - 3600000 * 2,
          isE2EE: true,
        },
      },
      {
        id: 'decoy-secret-1',
        type: 'secret',
        title: 'Demo Mapbox API Key',
        content: JSON.stringify({
          key: 'sk_live_demo_987213401928341092834',
          value: 'sk_live_demo_987213401928341092834',
          type: 'API Key',
          service: 'Mapbox API Token',
          notes: 'Read-only demo telemetry key',
        }),
        folder: 'Developer',
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now() - 86400000 * 4,
        metadata: {
          key: 'sk_live_demo_987213401928341092834',
          value: 'sk_live_demo_987213401928341092834',
          type: 'API Key',
          service: 'Mapbox API Token',
          isE2EE: true,
        },
      },
      {
        id: 'decoy-audio-1',
        type: 'audio',
        title: 'Meeting Voice Memo.m4a',
        content:
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
        folder: 'Recordings',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 86400000 * 3,
        metadata: {
          mimeType: 'audio/m4a',
          size: 512,
          duration: 4.2,
          isE2EE: true,
        },
      },
      {
        id: 'decoy-file-1',
        type: 'file',
        title: 'Product_Catalog_2026.pdf',
        content:
          'data:application/pdf;base64,JVBERi0xLjMKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0tpZHMgWzUgMCBSXQovQ291bnQgMQovVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1BhcmVudCA0IDAgUgovQ29udGVudHMgNiAwIFIKL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0xlbmd0aCAwCj4+CnN0cmVhbQplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmoKPDwKL1BhZ2VzIDQgMCBSCi9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iagp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAxMzkgMDAwMDAgbiAKMDAwMDAwMDAxOSAwMDAwMCBuIAowMDAwMDAwMDczIDAwMDAwIG4gCjAwMDAwMDAxMTggMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA3Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoxODQKJCVFT0YK',
        folder: 'Documents',
        createdAt: Date.now() - 86400000 * 5,
        updatedAt: Date.now() - 86400000 * 5,
        metadata: {
          mimeType: 'application/pdf',
          size: 1024,
          extension: 'pdf',
          isE2EE: true,
        },
      },
    ];

    set({
      items: dummyItems,
      isUnlocked: true,
      isVaultReady: true,
      isDecoyMode: true,
      username: identity || 'alex_doe',
      masterKey: null,
      vaultId: `v-${Date.now()}`,
      isLoading: false,
      syncStatus: 'success',
    });

    logActivity({
      actionType: 'auth_login',
      itemName: 'Vault Session',
      description: 'Vault unlocked successfully.',
      status: 'success',
    });
    toast.success(`Synced ${dummyItems.length} items`);
  },

  setDecoyMode: (enabled: boolean) => set({ isDecoyMode: enabled }),

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
        ['encrypt', 'decrypt'],
      );
      keyBuf.fill(0);

      const initialSnapshot = await loadVaultSnapshot(cryptoKey);
      const migratedItems = await migrateLegacyVaultIfNeeded(
        cryptoKey,
        derivedVaultId,
        initialSnapshot.items,
      );
      const snapshot =
        migratedItems === initialSnapshot.items
          ? initialSnapshot
          : await loadVaultSnapshot(cryptoKey);

      const localItems = await loadLocalItemsFromDb().catch(() => []);

      const now = Date.now();
      set((state) => {
        const syncedState = buildSyncedSnapshotState(state, snapshot, {
          includeLocalRuntimeItems: true,
          additionalLocalItems: localItems,
          now,
        });
        return {
          ...syncedState,
          isDiscreetMode: Boolean(syncedState.preferences.isDiscreetModeEnabled),
          isUnlocked: true,
          isVaultReady: true,
          masterKey: cryptoKey,
          vaultId: derivedVaultId,
          username: identity,
        };
      });

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
              exported,
            );
          }

          set({ rsaKeyPair: pair });
        })(),
        'RSA Identity Sync',
      );

      setActivityLoggingEnabled(
        resolveActivityLoggingPreference(snapshot, get().preferences.isActivityLoggingEnabled),
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
      try {
        revokeAllActiveBlobUrls();
      } catch {
        /* ignore */
      }
      try {
        clearCryptoKeyCache();
      } catch {
        /* ignore */
      }
      useIntegrityStore.getState().resetIntegrityState();

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

  handleSessionRevoked: (detail) => {
    set({
      sessionRevokedState: {
        isRevoked: true,
        reason: detail?.reason || 'REVOKED_BY_ANOTHER_DEVICE',
        sessionId: detail?.sessionId,
        timestamp: detail?.timestamp || Date.now(),
      },
      isUnlocked: false,
      isVaultReady: false,
      isDecoyMode: false,
      username: null,
      masterKey: null,
      vaultId: null,
      items: [],
      syncStatus: 'idle',
      lastSyncError: null,
      hasPendingSyncRetry: false,
      pinningItemIds: [],
    });

    try {
      revokeAllActiveBlobUrls();
    } catch {
      /* ignore */
    }
    try {
      clearCryptoKeyCache();
    } catch {
      /* ignore */
    }

    clearAuthToken();
    clearCloudSessionHint();
    clearRememberedVaultAccess();
    stopSessionSecurityWatcher();

    toast.error('Session terminated: Access has been revoked from another device.', {
      duration: 8000,
    });
  },

  dismissSessionRevoked: () => {
    set({ sessionRevokedState: null });
  },

  lock: () => {
    try {
      revokeAllActiveBlobUrls();
    } catch {
      /* ignore */
    }

    const { masterKey, preferences, items } = get();

    logActivity({
      actionType: 'auth_lock',
      itemName: getSessionName(),
      description: 'Vault locked',
      status: 'success',
    });

    if (masterKey && preferences.isActivityLoggingEnabled && getAuthToken()) {
      runInBackground(uploadLogsToCloud(useActivityStore.getState().entries), 'Activity log sync');
    }

    if (preferences.isPurgeTrashOnLockEnabled && items.length > 0) {
      const trashItems = items.filter((item) => Boolean(item.deletedAt));
      if (trashItems.length > 0) {
        // Persist active items and safely purge soft-deleted items
        void (async () => {
          try {
            await VaultService.purgeDeletedItems(masterKey, items, {
              syncCloud: Boolean(masterKey),
            });
          } catch (e) {
            // Ignore lock save errors
          }
        })();
      }
    }

    useActivityStore.getState().clearActivity();
    useNotificationStore.getState().resetStore();
    useIntegrityStore.getState().resetIntegrityState();
    useGlobalNavigationStore.getState().resetStore();
    useVideoMiniPlayerStore.getState().closeMiniPlayer();
    clearCryptoKeyCache();

    set({
      isUnlocked: false,
      isVaultReady: false,
      isDecoyMode: false,
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

  panicLock: () => {
    try {
      revokeAllActiveBlobUrls();
    } catch {
      /* ignore */
    }
    get().lock();
    toast.error('🚨 Vault locked immediately via Panic Button.');
  },

  toggleDiscreetMode: () => {
    const next = !get().isDiscreetMode;
    set({ isDiscreetMode: next });
    get().updatePreferences({ isDiscreetModeEnabled: next });
    if (next) {
      toast.info('Discreet Mode active. Media thumbnails are blurred.');
    } else {
      toast.info('Discreet Mode deactivated.');
    }
  },

  setDiscreetMode: (enabled: boolean) => {
    set({ isDiscreetMode: enabled });
    get().updatePreferences({ isDiscreetModeEnabled: enabled });
  },

  fullLogout: (options) => {
    if (!options?.skipServerLogout) {
      // Fire and forget server-side logout
      void logoutVaultSession();
    }

    try {
      revokeAllActiveBlobUrls();
    } catch {
      /* ignore */
    }

    clearAuthToken();
    clearCloudSessionHint();
    clearRememberedVaultAccess();
    useNotificationStore.getState().resetStore();
    useIntegrityStore.getState().resetIntegrityState();
    useGlobalNavigationStore.getState().resetStore();
    useVideoMiniPlayerStore.getState().closeMiniPlayer();
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
      rsaKeyPair: get().rsaKeyPair || currentState.rsaKeyPair,
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

    if (newPreferences.decoyPasswordHash) {
      try {
        localStorage.setItem('vault_decoy_pin_hash', newPreferences.decoyPasswordHash);
        localStorage.setItem(
          'vault_decoy_enabled',
          String(newPreferences.isDecoyVaultEnabled ?? true),
        );
      } catch {
        /* ignore */
      }
    } else if (sanitizedUpdates.isDecoyVaultEnabled === false) {
      try {
        localStorage.removeItem('vault_decoy_pin_hash');
        localStorage.setItem('vault_decoy_enabled', 'false');
      } catch {
        /* ignore */
      }
    }

    setActivityLoggingEnabled(newPreferences.isActivityLoggingEnabled);
    set({ preferences: newPreferences });

    queueSettingsSync({
      masterKey: currentState.masterKey,
      preferences: newPreferences,
      allowRestrictedTypes: currentState.allowRestrictedTypes,
      rsaKeyPair: get().rsaKeyPair || currentState.rsaKeyPair,
    });
  },

  migrateLocalToCloud: async () => {
    return;
  },

  changeMasterKey: async (newKey: string, onProgress?: (done: number, total: number) => void) => {
    const { items, masterKey: oldMasterKey, username, isDecoyMode } = get();
    if (isDecoyMode) {
      toast.success(
        'master Key rotation complete. Your encrypted data now requires the new master Key.',
      );
      logActivity({
        actionType: 'password_change',
        itemName: 'master Key',
        description: 'master Key rotated in isolated session',
        status: 'success',
      });
      return;
    }

    if (!oldMasterKey || !username) {
      const error = new Error('Vault must be unlocked to change master key');
      handleError(error, 'Key Rotation');
      throw error;
    }

    set({ isLoading: true });
    try {
      const credentialValidation = validatePassword(newKey);
      if (!credentialValidation.isValid) {
        throw new Error(
          credentialValidation.error || 'Master key does not meet security requirements.',
        );
      }

      const salt = await fetchVaultSalt(username).catch(() => `${username}-vault-pqc-salt`);
      const resolvedNewKey = await deriveKey(newKey, salt);

      const newVaultId = await getVaultId(resolvedNewKey);
      if (newVaultId === get().vaultId) {
        throw new Error('New master key must be different from the current one.');
      }

      // Always rotate from both local storage and the latest cloud snapshot to avoid leaving any
      // locally or remotely-synced items encrypted with the previous key.
      const localItems = await loadLocalItemsFromDb().catch(() => []);
      const cloudItems = await downloadAllFromCloud(oldMasterKey).catch(() => []);
      const mergedItemsMap = new Map<string, VaultItem>();
      for (const item of [...items, ...localItems, ...cloudItems]) {
        if (!item || !item.id) continue;
        const existing = mergedItemsMap.get(item.id);
        if (!existing) {
          mergedItemsMap.set(item.id, item);
          continue;
        }

        // Always prioritize real binary payload (Uint8Array) over a remote URI pointer string
        const existingHasBinary = existing.content instanceof Uint8Array;
        const itemHasBinary = item.content instanceof Uint8Array;

        if (existingHasBinary && !itemHasBinary) {
          const isNewer = (item.updatedAt || 0) > (existing.updatedAt || 0);
          mergedItemsMap.set(item.id, {
            ...(isNewer ? item : existing),
            content: existing.content,
          });
        } else if (!existingHasBinary && itemHasBinary) {
          const isNewer = (existing.updatedAt || 0) > (item.updatedAt || 0);
          mergedItemsMap.set(item.id, {
            ...(isNewer ? existing : item),
            content: item.content,
          });
        } else {
          if ((item.updatedAt || 0) >= (existing.updatedAt || 0)) {
            mergedItemsMap.set(item.id, item);
          }
        }
      }
      const sourceItems = Array.from(mergedItemsMap.values());
      const total = sourceItems.length;

      const updatedItems: VaultItem[] = new Array(total);
      let rotatedCount = 0;

      await runInParallelPool(
        sourceItems,
        async (item, i) => {
          try {
            const newContent = await reencryptVaultItemContent(item, oldMasterKey, resolvedNewKey);

            const updatedItem = {
              ...item,
              content: newContent,
              updatedAt: Date.now(),
            };
            await uploadItemToCloud(updatedItem, resolvedNewKey);
            await saveItem(updatedItem).catch(() => {});
            updatedItems[i] = updatedItem;

            rotatedCount += 1;
            reportProgress(onProgress, rotatedCount, total);
            await maybeYieldToMainThread(total, KEY_ROTATION_YIELD_THRESHOLD);
          } catch (err: unknown) {
            const itemLabel = item.title?.trim() || item.id || 'Untitled item';
            throw new Error(
              `Key rotation failed at "${itemLabel}": ${getErrorMessage(err, 'Unknown error')}`,
            );
          }
        },
        6,
      );

      // Re-encrypt settings for the new vault
      const { preferences, allowRestrictedTypes, rsaKeyPair } = get();
      const exportedRsa = await exportRsaKeysIfAvailable(rsaKeyPair);
      await VaultService.syncSettings(
        resolvedNewKey,
        preferences,
        allowRestrictedTypes,
        exportedRsa,
        { force: true },
      );
      await uploadKeyCheckToCloud(resolvedNewKey, { force: true });

      const newKeyBuf = base64ToUint8Array(resolvedNewKey);
      const resolvedNewCryptoKey = await crypto.subtle.importKey(
        'raw',
        newKeyBuf as any,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
      newKeyBuf.fill(0);

      set({
        items: updatedItems,
        masterKey: resolvedNewCryptoKey,
        vaultId: newVaultId,
        isLoading: false,
      });

      toast.success(
        'master Key rotation complete. Your encrypted data now requires the new master Key.',
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
        'Profile sync',
      );
      runInBackground(
        revokeVaultDeviceSession({
          revokeAllOther: true,
          revokeCurrent: false,
        }),
        'Session revoke after master key rotation',
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
    const { items, masterKey } = get();
    let sourceItems = items;
    if (masterKey) {
      try {
        const localItems = await loadLocalItemsFromDb().catch(() => []);
        const merged = new Map<string, VaultItem>();
        for (const item of [...items, ...localItems]) {
          const existing = merged.get(item.id);
          if (!existing) {
            merged.set(item.id, item);
          } else if (
            (existing.content === '' ||
              (typeof existing.content === 'string' && existing.content.length === 0)) &&
            (item.content instanceof Uint8Array ||
              (typeof item.content === 'string' && item.content.length > 0))
          ) {
            merged.set(item.id, item);
          } else if ((item.updatedAt || 0) >= (existing.updatedAt || 0)) {
            merged.set(item.id, item);
          }
        }
        sourceItems = Array.from(merged.values());
      } catch {
        sourceItems = items;
      }
    }

    const itemsToExport = [];
    const total = sourceItems.length;

    for (let i = 0; i < total; i++) {
      const item = sourceItems[i];
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
      description: `Exported ${sourceItems.length} items`,
      status: 'success',
    });
    return exported;
  },

  importVaultData: async (
    rawItems: unknown[],
    onProgress?: (done: number, total: number) => void,
  ) => {
    const { masterKey, isUnlocked, isDecoyMode } = get();
    if (!isUnlocked || (!masterKey && !isDecoyMode)) {
      throw new Error('Vault must be unlocked to import data.');
    }

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

      if (isDecoyMode) {
        set((state) => {
          const map = new Map<string, VaultItem>();
          for (const item of [...state.items, ...newItems]) {
            map.set(item.id, item);
          }
          return { items: Array.from(map.values()), isLoading: false };
        });
        toast.success(`Imported ${total} items successfully`);
        logActivity({
          actionType: 'import',
          itemName: 'Vault import',
          description: `Imported ${total} items in isolated session`,
          status: 'success',
        });
        return;
      }

      let completedCount = 0;

      await runInParallelPool(
        newItems,
        async (item) => {
          await uploadItemToCloud(item, masterKey!);
          completedCount += 1;
          reportProgress(onProgress, completedCount, total);
          await maybeYieldToMainThread(total, IMPORT_YIELD_THRESHOLD);
        },
        6,
      );

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
    await get().fetchItems('manual');
  },

  retryFailedSync: async () => {
    await get().fetchItems('retry');
  },

  fetchItems: async (trigger = 'background') => {
    const { isUnlocked, masterKey, isDecoyMode, items } = get();
    if (!isUnlocked || (!masterKey && !isDecoyMode)) return;

    const toastCopy = getSyncToastCopy(trigger);
    const toastId = toast.loading(toastCopy.loadingTitle, {
      description: toastCopy.loadingDescription,
    });

    if (isDecoyMode) {
      setTimeout(() => {
        toast.success(toastCopy.successTitle, {
          id: toastId,
          description: toastCopy.successDescription(items.length),
        });
      }, 300);
      return;
    }

    set({
      isLoading: true,
      syncStatus: 'syncing',
      lastSyncAttemptAt: Date.now(),
      lastSyncError: null,
    });
    try {
      const snapshot = await loadVaultSnapshot(masterKey!);
      const localItems = await loadLocalItemsFromDb().catch(() => []);

      const now = Date.now();
      set((state) =>
        buildSyncedSnapshotState(state, snapshot, {
          includeLocalRuntimeItems: true,
          additionalLocalItems: localItems,
          now,
        }),
      );

      setActivityLoggingEnabled(
        resolveActivityLoggingPreference(snapshot, get().preferences.isActivityLoggingEnabled),
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
    const { isUnlocked, masterKey, username, isDecoyMode, sessionRevokedState } = get();
    if (sessionRevokedState?.isRevoked) {
      const err = new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
      toast.error('Action blocked: Your session has been revoked.');
      throw err;
    }
    if (!isUnlocked || (!masterKey && !isDecoyMode)) {
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
      id: isDecoyMode ? `decoy-${crypto.randomUUID()}` : crypto.randomUUID(),
      title: normalizedTitle,
      username: username || undefined,
      source,
      createdAt: now,
      updatedAt: now,
    };

    if (isDecoyMode) {
      set((state) => ({
        items: [newItem, ...state.items.filter((i) => i.id !== newItem.id)],
        isLoading: false,
      }));
      toast.success(`${newItem.title} saved to cloud`);
      logActivity({
        actionType: newItem.type === 'password' ? 'password_create' : 'file_upload',
        itemName: newItem.title,
        description: `${newItem.type} added in isolated session`,
        status: 'success',
      });
      return newItem;
    }

    set({ isLoading: true });
    try {
      if (newItem.source === 'cloud') {
        try {
          await uploadItemToCloud(newItem, masterKey!, onProgress);
        } catch (uploadErr: any) {
          const code = getApiErrorCode(uploadErr);
          if (
            code === 'SESSION_REVOKED' ||
            uploadErr?.status === 401 ||
            uploadErr?.response?.status === 401
          ) {
            get().handleSessionRevoked({ reason: 'REVOKED_BY_SERVER' });
            throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
          }
          console.warn(
            'Cloud upload failed, retaining item locally in IndexedDB as fallback:',
            uploadErr,
          );
          newItem.source = 'local';
        }
      }

      // Persist to local IndexedDB
      await saveItem(newItem);

      // Memory optimization: For large binary payloads saved in cloud/IndexedDB,
      // create a lightweight copy for in-memory React state so the browser doesn't run out of memory.
      const inMemoryItem: VaultItem =
        newItem.source === 'cloud' &&
        newItem.content instanceof Uint8Array &&
        newItem.content.byteLength > 512 * 1024
          ? { ...newItem, content: '' }
          : newItem;

      set((state) => ({
        items: [inMemoryItem, ...state.items.filter((i) => i.id !== inMemoryItem.id)],
        isLoading: false,
      }));
      useIntegrityStore
        .getState()
        .rebuildLocalMerkleTree(get().items)
        .catch(() => {});
      toast.success(
        `${newItem.title} saved ${newItem.source === 'local' ? 'locally' : 'to cloud'}`,
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

  deleteItem: async (id: string) => get().removeItem(id),

  removeItem: async (id: string) => {
    const { masterKey, items, isDecoyMode, sessionRevokedState } = get();
    if (sessionRevokedState?.isRevoked) {
      toast.error('Action blocked: Your session has been revoked.');
      throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
    }
    if (!masterKey && !isDecoyMode) return;

    const item = items.find((i) => i.id === id);
    set({ isLoading: true });

    if (isDecoyMode) {
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
      return;
    }

    try {
      if (item?.source === 'local') {
        await deleteItem(id);
      } else {
        try {
          await deleteItemFromCloud(id, masterKey!);
        } catch (cloudErr: any) {
          const code = getApiErrorCode(cloudErr);
          if (
            code === 'SESSION_REVOKED' ||
            cloudErr?.status === 401 ||
            cloudErr?.response?.status === 401
          ) {
            get().handleSessionRevoked({ reason: 'REVOKED_BY_SERVER' });
            throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
          }
          if (code !== 'ITEM_NOT_FOUND') {
            console.warn('Failed to delete item from cloud:', cloudErr);
          }
        }
        await deleteItem(id);
      }
      set((state) => ({
        items: state.items.filter((i) => i.id !== id),
        isLoading: false,
      }));
      useIntegrityStore
        .getState()
        .rebuildLocalMerkleTree(get().items)
        .catch(() => {});
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
    const { items, masterKey, isDecoyMode, sessionRevokedState } = get();
    if (sessionRevokedState?.isRevoked) {
      toast.error('Action blocked: Your session has been revoked.');
      throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
    }
    const item = items.find((i) => i.id === id);
    if (!item || (!masterKey && !isDecoyMode)) return;

    const updatedItem: VaultItem = {
      ...item,
      ...updates,
      source: updates.source || item.source || 'cloud',
      username: updates.username || item.username || get().username || undefined,
      updatedAt: Date.now(),
    };

    set({ isLoading: true });

    if (isDecoyMode) {
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
      return;
    }

    try {
      if (updatedItem.source !== 'local') {
        try {
          await uploadItemToCloud(updatedItem, masterKey!);
        } catch (uploadErr: any) {
          const code = getApiErrorCode(uploadErr);
          if (
            code === 'SESSION_REVOKED' ||
            uploadErr?.status === 401 ||
            uploadErr?.response?.status === 401
          ) {
            get().handleSessionRevoked({ reason: 'REVOKED_BY_SERVER' });
            throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
          }
          console.warn(
            'Cloud upload failed during update, retaining locally in IndexedDB:',
            uploadErr,
          );
        }
      }

      await saveItem(updatedItem);

      const inMemoryItem: VaultItem =
        updatedItem.source === 'cloud' &&
        updatedItem.content instanceof Uint8Array &&
        updatedItem.content.byteLength > 512 * 1024
          ? { ...updatedItem, content: '' }
          : updatedItem;

      set((state) => ({
        items: state.items.map((i) => (i.id === id ? inMemoryItem : i)),
        isLoading: false,
      }));
      useIntegrityStore
        .getState()
        .rebuildLocalMerkleTree(get().items)
        .catch(() => {});
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
    const { items, pinningItemIds, isDecoyMode, sessionRevokedState } = get();
    if (sessionRevokedState?.isRevoked) {
      toast.error('Action blocked: Your session has been revoked.');
      throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
    }
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

    if (isDecoyMode) {
      set((state) => ({
        pinningItemIds: state.pinningItemIds.filter((itemId) => itemId !== id),
      }));
      return;
    }

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
            : i,
        ),
        pinningItemIds: state.pinningItemIds.filter((itemId) => itemId !== id),
      }));
    } catch (error: any) {
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? item : i)),
        pinningItemIds: state.pinningItemIds.filter((itemId) => itemId !== id),
      }));
      const code = getApiErrorCode(error);
      if (code === 'SESSION_REVOKED' || error?.status === 401 || error?.response?.status === 401) {
        get().handleSessionRevoked({ reason: 'REVOKED_BY_SERVER' });
        throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
      }
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
    const { items, masterKey, isDecoyMode, sessionRevokedState } = get();
    if (sessionRevokedState?.isRevoked) {
      toast.error('Action blocked: Your session has been revoked.');
      throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
    }
    if ((!masterKey && !isDecoyMode) || batchUpdates.length === 0) return;

    set({ isLoading: true });
    const now = Date.now();

    const updatedItems = items.map((item) => {
      const update = batchUpdates.find((u) => u.id === item.id);
      if (!update) return item;
      return {
        ...item,
        ...update.updates,
        source: update.updates.source || item.source || 'cloud',
        updatedAt: now,
      };
    });

    if (isDecoyMode) {
      set({ items: updatedItems, isLoading: false });
      toast.success(`Updated ${batchUpdates.length} items`);
      return;
    }

    try {
      // Persist to local IndexedDB and upload all changed items to cloud in parallel
      const currentBatch = batchUpdates
        .map((u) => updatedItems.find((i) => i.id === u.id))
        .filter((item): item is VaultItem => Boolean(item));

      for (const item of currentBatch) {
        try {
          await saveItem(item);
        } catch (saveErr) {
          console.warn('Failed to save batch item to local DB:', saveErr);
        }
      }

      await runInParallelPool(
        currentBatch,
        async (item) => {
          try {
            await uploadItemToCloud(item, masterKey!);
          } catch (uploadErr: any) {
            const code = getApiErrorCode(uploadErr);
            if (
              code === 'SESSION_REVOKED' ||
              uploadErr?.status === 401 ||
              uploadErr?.response?.status === 401
            ) {
              get().handleSessionRevoked({ reason: 'REVOKED_BY_SERVER' });
              throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
            }
            throw uploadErr;
          }
        },
        6,
      );

      set({ items: updatedItems, isLoading: false });
      useIntegrityStore
        .getState()
        .rebuildLocalMerkleTree(get().items)
        .catch(() => {});
      toast.success(`Updated ${batchUpdates.length} items`);
      runInBackground(get().syncLogs(), 'Activity log sync');
    } catch (error) {
      handleError(error, 'Batch Update');
      set({ isLoading: false });
    }
  },

  syncLogs: async () => {
    const { isUnlocked, masterKey, preferences, isDecoyMode } = get();
    if (!isUnlocked || isDecoyMode || !masterKey || !preferences.isActivityLoggingEnabled) return;

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
        new Map([...remoteLogs, ...localLogs].map((entry) => [entry.id, entry])).values(),
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
    const { masterKey, isDecoyMode, sessionRevokedState } = get();
    if (sessionRevokedState?.isRevoked) {
      toast.error('Action blocked: Your session has been revoked.');
      throw new Error('SESSION_REVOKED: Operation prohibited on revoked session.');
    }
    if (!masterKey && !isDecoyMode) {
      toast.error('Unlock vault first');
      return;
    }

    if (isDecoyMode) {
      set({
        items: [],
        isUnlocked: false,
        isVaultReady: false,
        isDecoyMode: false,
        isLoading: false,
      });
      toast.success('ALL DATA PURGED');
      logActivity({
        actionType: 'item_delete',
        itemName: 'Full Vault',
        description: 'Decoy vault purged in isolated session',
        status: 'success',
      });
      return;
    }

    set({ isLoading: true });
    try {
      const cloudItems = await downloadAllFromCloud(masterKey!);

      // Batch purge remote assets
      await Promise.allSettled([
        ...cloudItems.map((item) => deleteItemFromCloud(item.id, masterKey!)),
        deleteItemFromCloud('__settings__', masterKey!),
        deleteItemFromCloud('__logs__', masterKey!),
        deleteItemFromCloud('__profile__', masterKey!),
        deleteItemFromCloud('__keycheck__', masterKey!),
      ]);
      clearCloudSessionHint();
      clearRememberedVaultAccess();

      // Clear local IndexedDB, blob URLs and crypto caches
      try {
        revokeAllActiveBlobUrls();
      } catch {
        /* ignore */
      }
      try {
        clearCryptoKeyCache();
      } catch {
        /* ignore */
      }
      try {
        await clearVault();
      } catch {
        /* ignore */
      }

      useActivityStore.getState().clearActivity();
      useNotificationStore.getState().resetStore();
      useIntegrityStore.getState().resetIntegrityState();
      useGlobalNavigationStore.getState().resetStore();
      useVideoMiniPlayerStore.getState().closeMiniPlayer();

      set({
        items: [],
        isUnlocked: false,
        isVaultReady: false,
        masterKey: null,
        vaultId: null,
        username: null,
        isLoading: false,
      });

      toast.success('ALL DATA PURGED');
      logActivity({
        actionType: 'item_delete',
        itemName: 'Full Vault',
        description: 'Emergency destruction complete',
        status: 'success',
      });

      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), RELOAD_AFTER_PURGE_DELAY_MS);
      }
    } catch (error) {
      handleError(error, 'Emergency Destruction');
      set({ isLoading: false });
    }
  },

  emergencyLocalWipe: async () => {
    try {
      revokeAllActiveBlobUrls();
    } catch {
      /* ignore */
    }

    try {
      clearCryptoKeyCache();
    } catch {
      /* ignore */
    }

    try {
      await clearVault();
    } catch {
      /* ignore */
    }

    try {
      clearAuthToken();
      clearCloudSessionHint();
      clearRememberedVaultAccess();
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('vault_cloud_session_hint');
        localStorage.removeItem('vault_remembered_access');
        localStorage.removeItem('vault_remembered_access_secret');
        localStorage.setItem('vault_emergency_wiped_at', String(Date.now()));
      }
    } catch {
      /* ignore */
    }

    useActivityStore.getState().clearActivity();
    useNotificationStore.getState().resetStore();
    useIntegrityStore.getState().resetIntegrityState();
    useGlobalNavigationStore.getState().resetStore();
    useVideoMiniPlayerStore.getState().closeMiniPlayer();

    set({
      items: [],
      isUnlocked: false,
      isVaultReady: false,
      masterKey: null,
      vaultId: null,
      username: null,
      rsaKeyPair: null,
      syncStatus: 'idle',
      lastSyncError: null,
      hasPendingSyncRetry: false,
      pinningItemIds: [],
    });

    logActivity({
      actionType: 'auth_lock',
      itemName: "Dead Man's Switch Shredder",
      description:
        'Emergency local wipe executed after brute-force threshold reached. Cloud data preserved.',
      status: 'failure',
    });
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

// Real-time automatic session revocation and token-cleared listeners
let isHandlingTokenCleared = false;

if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_REVOKED_EVENT, (event: any) => {
    useVaultStore.getState().handleSessionRevoked(event?.detail);
  });

  window.addEventListener(AUTH_TOKEN_CLEARED_EVENT, () => {
    if (isHandlingTokenCleared) return;
    isHandlingTokenCleared = true;
    try {
      const { isUnlocked, isVaultReady, sessionRevokedState } = useVaultStore.getState();
      if (!sessionRevokedState?.isRevoked && (isUnlocked || isVaultReady)) {
        useVaultStore.getState().lock();
      }
    } finally {
      setTimeout(() => {
        isHandlingTokenCleared = false;
      }, 100);
    }
  });
}
