export type VaultItemType =
  | 'photo'
  | 'video'
  | 'audio'
  | 'note'
  | 'chat'
  | 'todo'
  | 'password'
  | 'secret'
  | 'contact'
  | 'document'
  | 'file'
  | 'location'
  | 'card'
  | 'identity'
  | 'wifi';

const VAULT_ITEM_TYPES = new Set<VaultItemType>([
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

// Permanent vault data lives in the cloud. Browser-side vault data is runtime-only.
const sessionVaultItems = new Map<string, VaultItem>();

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
};

export const getItems = async (type?: VaultItem['type']): Promise<VaultItem[]> => {
  const items = Array.from(sessionVaultItems.values());
  const filteredItems = type ? items.filter((item) => item.type === type) : items;
  return filteredItems.map((item) => cloneVaultItem(item));
};

export const getItem = async (id: string): Promise<VaultItem | undefined> =>
  (() => {
    const normalizedId = normalizeOptionalString(id);
    if (!normalizedId) {
      return undefined;
    }

    const item = sessionVaultItems.get(normalizedId);
    return item ? cloneVaultItem(item) : undefined;
  })();

export const deleteItem = async (id: string): Promise<void> => {
  const normalizedId = normalizeOptionalString(id);
  if (!normalizedId) {
    return;
  }

  sessionVaultItems.delete(normalizedId);
};

export const clearVault = async (): Promise<void> => {
  sessionVaultItems.clear();
};
