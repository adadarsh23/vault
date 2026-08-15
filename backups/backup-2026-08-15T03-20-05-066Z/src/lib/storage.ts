import { logger } from './logger';

export type VaultItemType =
  // Personal Information
  | 'identity'
  | 'contact'
  | 'password'
  | 'card'
  | 'wifi'
  | 'secret'
  // Notes & Productivity
  | 'note'
  | 'todo'
  | 'chat'
  | 'location'
  // Media
  | 'photo'
  | 'video'
  | 'audio'
  // Documents & Files
  | 'document'
  | 'file';

const VAULT_ITEM_TYPES = new Set<VaultItemType>([
  // Personal Information
  'identity',
  'contact',
  'password',
  'card',
  'wifi',
  'secret',
  // Notes & Productivity
  'note',
  'todo',
  'chat',
  'location',
  // Media
  'photo',
  'video',
  'audio',
  // Documents & Files
  'document',
  'file',
]);

export type VaultItemMetadata = Record<string, any>;

export interface VaultItem {
  id: string;
  type: VaultItemType;
  title: string;
  content: string | Uint8Array;
  metadata?: VaultItemMetadata;
  source?: string;
  folder?: string;
  username?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  isPinned?: boolean;
  pinnedAt?: number | null;
}

// Permanent vault data lives in the cloud. Browser-side local vault data is persisted in IndexedDB.
const sessionVaultItems = new Map<string, VaultItem>();

const LOCAL_DB_NAME = 'VaultLocalStorage';
const LOCAL_DB_VERSION = 1;
const LOCAL_STORE_NAME = 'vault_local_items';

const openLocalDB = (): Promise<IDBDatabase | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
          db.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => {
        logger.warn('Failed to open IndexedDB storage', { error: err });
        resolve(null);
      };
    } catch (e) {
      logger.warn('Exception while opening IndexedDB storage', { error: e });
      resolve(null);
    }
  });
};

export const saveItemToLocalDb = async (item: VaultItem): Promise<void> => {
  const db = await openLocalDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => {
        logger.warn('IndexedDB put error while saving item', { id: item.id, error: event });
        resolve();
      };
    } catch (e) {
      logger.warn('Exception saving item to IndexedDB', { id: item.id, error: e });
      resolve();
    }
  });
};

export const loadLocalItemsFromDb = async (): Promise<VaultItem[]> => {
  const db = await openLocalDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const items = (request.result as VaultItem[]) || [];
        items.forEach((item) => {
          if (item && item.id) {
            sessionVaultItems.set(item.id, item);
          }
        });
        resolve(items);
      };
      request.onerror = (event) => {
        logger.warn('IndexedDB getAll error while loading local items', { error: event });
        resolve([]);
      };
    } catch (e) {
      logger.warn('Exception loading local items from IndexedDB', { error: e });
      resolve([]);
    }
  });
};

export const deleteItemFromLocalDb = async (id: string): Promise<void> => {
  const db = await openLocalDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => {
        logger.warn('IndexedDB delete error', { id, error: event });
        resolve();
      };
    } catch (e) {
      logger.warn('Exception deleting item from IndexedDB', { id, error: e });
      resolve();
    }
  });
};

export const clearLocalDb = async (): Promise<void> => {
  const db = await openLocalDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => {
        logger.warn('IndexedDB clear error', { error: event });
        resolve();
      };
    } catch (e) {
      logger.warn('Exception clearing IndexedDB', { error: e });
      resolve();
    }
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidVaultItemType = (value: unknown): value is VaultItemType =>
  typeof value === 'string' && VAULT_ITEM_TYPES.has(value as VaultItemType);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length ? trimmedValue : undefined;
};

const normalizeTimestamp = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
};

const cloneValue = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  if (value instanceof Uint8Array) {
    return new Uint8Array(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry)) as T;
  }

  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneValue(entry);
    }
    return clone as T;
  }

  return value;
};

const cloneVaultItem = (item: VaultItem): VaultItem => ({
  ...item,
  content: item.content instanceof Uint8Array ? new Uint8Array(item.content) : item.content,
  metadata: item.metadata ? cloneValue(item.metadata) : undefined,
});

const normalizeVaultItem = (item: VaultItem): VaultItem => {
  const now = Date.now();
  const normalizedId = normalizeOptionalString(item.id);
  if (!normalizedId) {
    throw new Error('Vault item id is required.');
  }

  if (!isValidVaultItemType(item.type)) {
    throw new Error(`Unsupported vault item type: ${String(item.type)}`);
  }

  const normalizedTitle = normalizeOptionalString(item.title);
  if (!normalizedTitle) {
    throw new Error(`Vault item "${normalizedId}" title is required.`);
  }

  if (!(item.content instanceof Uint8Array) && typeof item.content !== 'string') {
    throw new Error(
      `Vault item "${normalizedId}" has invalid content. Expected string or Uint8Array.`
    );
  }

  const createdAt = normalizeTimestamp(item.createdAt, now);
  const updatedAt = normalizeTimestamp(item.updatedAt, createdAt);

  const metadata = isRecord(item.metadata)
    ? (cloneValue(item.metadata) as VaultItemMetadata)
    : undefined;

  const isPinned = Boolean(item.isPinned);
  const pinnedAt = isPinned ? normalizeTimestamp(item.pinnedAt, updatedAt) : null;

  return {
    ...item,
    id: normalizedId,
    title: normalizedTitle,
    type: item.type,
    content: item.content instanceof Uint8Array ? new Uint8Array(item.content) : item.content,
    metadata,
    source: normalizeOptionalString(item.source),
    folder: normalizeOptionalString(item.folder),
    username: normalizeOptionalString(item.username),
    createdAt,
    updatedAt: Math.max(updatedAt, createdAt),
    deletedAt:
      item.deletedAt === undefined ? undefined : normalizeTimestamp(item.deletedAt, updatedAt),
    isPinned,
    pinnedAt,
  };
};

export const saveItem = async (item: VaultItem): Promise<void> => {
  const normalizedItem = normalizeVaultItem(item);
  sessionVaultItems.set(normalizedItem.id, normalizedItem);
  if (normalizedItem.source === 'local') {
    await saveItemToLocalDb(normalizedItem);
  }
};

export const getItems = async (type?: VaultItem['type']): Promise<VaultItem[]> => {
  if (sessionVaultItems.size === 0) {
    await loadLocalItemsFromDb();
  }
  const items = Array.from(sessionVaultItems.values());
  const filteredItems = type ? items.filter((item) => item.type === type) : items;
  return filteredItems.map((item) => cloneVaultItem(item));
};

export const getItem = async (id: string): Promise<VaultItem | undefined> => {
  const normalizedId = normalizeOptionalString(id);
  if (!normalizedId) {
    return undefined;
  }

  let item = sessionVaultItems.get(normalizedId);
  if (!item) {
    await loadLocalItemsFromDb();
    item = sessionVaultItems.get(normalizedId);
  }
  return item ? cloneVaultItem(item) : undefined;
};

export const deleteItem = async (id: string): Promise<void> => {
  const normalizedId = normalizeOptionalString(id);
  if (!normalizedId) {
    return;
  }

  sessionVaultItems.delete(normalizedId);
  await deleteItemFromLocalDb(normalizedId);
};

export const clearVault = async (): Promise<void> => {
  sessionVaultItems.clear();
  await clearLocalDb();
};
