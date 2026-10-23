import { create } from 'zustand';

export type ActivityStatus = 'success' | 'failure';

export type ActivityActionType =
  | 'file_upload'
  | 'file_preview'
  | 'file_download'
  | 'password_create'
  | 'password_change'
  | 'password_delete'
  | 'auth_login'
  | 'auth_lock'
  | 'vault_sync'
  | 'import'
  | 'export'
  | 'item_update'
  | 'item_delete'
  | 'item_create'
  | 'copy_value'
  | 'security_alert'
  | 'error';

export interface ActivityEntry {
  id: string;
  actionType: ActivityActionType;
  itemName: string;
  timestamp: number;
  userOrSessionId: string;
  sessionName?: string;
  status: ActivityStatus;
  description: string;
  isSynced?: boolean;
}

export type ActivityLogInput = Omit<ActivityEntry, 'id' | 'timestamp'> & { timestamp?: number };

interface ActivityState {
  entries: ActivityEntry[];
  count: number;
  logActivity: (entry: ActivityLogInput) => void;
  clearActivity: () => void;
  mergeEntries: (entries: ActivityEntry[]) => void;
  markAsSynced: (ids: string[]) => void;
}

const MAX_ITEM_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_SESSION_NAME_LENGTH = 160;
const MAX_ACTIVITY_ENTRIES = 5_000;

const ACTIVITY_ACTION_SET: Record<ActivityActionType, true> = {
  file_upload: true,
  file_preview: true,
  file_download: true,
  password_create: true,
  password_change: true,
  password_delete: true,
  auth_login: true,
  auth_lock: true,
  vault_sync: true,
  import: true,
  export: true,
  item_update: true,
  item_delete: true,
  item_create: true,
  copy_value: true,
  security_alert: true,
  error: true,
};

const ACTIVITY_STATUS_SET: Record<ActivityStatus, true> = {
  success: true,
  failure: true,
};

const safeNow = (): number => Date.now();

const generateEntryId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `activity-${safeNow()}-${Math.random().toString(16).slice(2, 10)}`;
};

const sanitizeString = (value: unknown, fallback: string, maxLength: number): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, maxLength);
};

const normalizeTimestamp = (value: unknown, fallback: number): number => {
  const timestamp = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return fallback;
  }
  return Math.floor(timestamp);
};

const normalizeActionType = (value: unknown): ActivityActionType => {
  if (typeof value === 'string' && value in ACTIVITY_ACTION_SET) {
    return value as ActivityActionType;
  }
  return 'error';
};

const normalizeStatus = (value: unknown): ActivityStatus => {
  if (typeof value === 'string' && value in ACTIVITY_STATUS_SET) {
    return value as ActivityStatus;
  }
  return 'failure';
};

const normalizeIsSynced = (value: unknown): boolean => value === true;

const normalizeSessionName = (value: unknown): string | undefined => {
  const normalized = sanitizeString(value, '', MAX_SESSION_NAME_LENGTH);
  return normalized || undefined;
};

const normalizeActivityEntry = (
  value: Partial<ActivityEntry>,
  fallback: {
    actionType: ActivityActionType;
    itemName: string;
    userOrSessionId: string;
    status: ActivityStatus;
    description: string;
    timestamp: number;
    isSynced: boolean;
  },
): ActivityEntry => {
  const timestamp = normalizeTimestamp(value.timestamp, fallback.timestamp);

  return {
    id: sanitizeString(value.id, generateEntryId(), MAX_IDENTIFIER_LENGTH),
    actionType: normalizeActionType(value.actionType ?? fallback.actionType),
    itemName: sanitizeString(value.itemName, fallback.itemName, MAX_ITEM_NAME_LENGTH),
    timestamp,
    userOrSessionId: sanitizeString(
      value.userOrSessionId,
      fallback.userOrSessionId,
      MAX_IDENTIFIER_LENGTH,
    ),
    sessionName: normalizeSessionName(value.sessionName),
    status: normalizeStatus(value.status ?? fallback.status),
    description: sanitizeString(value.description, fallback.description, MAX_DESCRIPTION_LENGTH),
    isSynced: normalizeIsSynced(value.isSynced !== undefined ? value.isSynced : fallback.isSynced),
  };
};

const pickPreferredEntry = (
  existing: ActivityEntry | undefined,
  candidate: ActivityEntry,
): ActivityEntry => {
  if (!existing) {
    return candidate;
  }
  if (candidate.timestamp > existing.timestamp) {
    return candidate;
  }
  if (candidate.timestamp < existing.timestamp) {
    return existing;
  }
  if (candidate.isSynced === true && existing.isSynced !== true) {
    return candidate;
  }
  return existing;
};

const normalizeAndLimitEntries = (entries: ActivityEntry[]): ActivityEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const deduped = new Map<string, ActivityEntry>();
  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const normalized = normalizeActivityEntry(rawEntry, {
      actionType: 'error',
      itemName: 'Unknown item',
      userOrSessionId: 'unknown',
      status: 'failure',
      description: 'Activity entry normalized due to invalid payload.',
      timestamp: safeNow(),
      isSynced: false,
    });
    deduped.set(normalized.id, pickPreferredEntry(deduped.get(normalized.id), normalized));
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY_ENTRIES);
};

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  count: 0,
  logActivity: (entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    set((state) => {
      const nextEntry = normalizeActivityEntry(entry, {
        actionType: 'error',
        itemName: 'App',
        userOrSessionId: 'unknown',
        status: 'failure',
        description: '',
        timestamp: safeNow(),
        isSynced: false,
      });

      const nextEntries = normalizeAndLimitEntries([nextEntry, ...state.entries]);
      return {
        entries: nextEntries,
        count: nextEntries.length,
      };
    });
  },
  clearActivity: () => {
    set({ entries: [], count: 0 });
  },
  mergeEntries: (newEntries) => {
    if (!Array.isArray(newEntries) || newEntries.length === 0) {
      return;
    }

    set((state) => {
      const unique = normalizeAndLimitEntries([...newEntries, ...state.entries]);

      return {
        entries: unique,
        count: unique.length,
      };
    });
  },
  markAsSynced: (ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return;
    }

    const idSet = new Set(ids.filter(Boolean));
    if (idSet.size === 0) {
      return;
    }

    set((state) => {
      let hasChange = false;
      const nextEntries = state.entries.map((e) => {
        if (idSet.has(e.id) && e.isSynced !== true) {
          hasChange = true;
          return { ...e, isSynced: true };
        }
        return e;
      });

      if (!hasChange) {
        return state;
      }

      return {
        entries: nextEntries,
        count: nextEntries.length,
      };
    });
  },
}));
