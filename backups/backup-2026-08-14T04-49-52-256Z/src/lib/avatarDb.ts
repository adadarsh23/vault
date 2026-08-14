// avatarDb.ts
// Offline IndexedDB Queue for Profile Avatar Synchronization using idb

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface QueuedAvatar {
  id: string;
  userId: string;
  contentHash: string;
  blob: Blob;
  mimeType: string;
  blurHash: string;
  timestamp: number;
  retryCount: number;
}

interface AvatarDBSchema extends DBSchema {
  avatar_queue: {
    key: string;
    value: QueuedAvatar;
    indexes: { 'by-userId': string; 'by-timestamp': number };
  };
}

const DB_NAME = 'vault-avatar-sync-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AvatarDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<AvatarDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AvatarDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('avatar_queue')) {
          const store = db.createObjectStore('avatar_queue', { keyPath: 'id' });
          store.createIndex('by-userId', 'userId');
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Persists an un-synced avatar update into IndexedDB when network is unavailable
 */
export async function queueOfflineAvatar(avatar: Omit<QueuedAvatar, 'retryCount'>): Promise<void> {
  const db = await getDb();
  await db.put('avatar_queue', {
    ...avatar,
    retryCount: 0,
  });
}

/**
 * Retrieves all pending avatar updates for a given user (or all users)
 */
export async function getPendingAvatars(userId?: string): Promise<QueuedAvatar[]> {
  const db = await getDb();
  if (userId) {
    return db.getAllFromIndex('avatar_queue', 'by-userId', userId);
  }
  return db.getAll('avatar_queue');
}

/**
 * Removes a successfully synchronized avatar from the offline queue
 */
export async function removeQueuedAvatar(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('avatar_queue', id);
}

/**
 * Registers background sync with Service Worker if supported, otherwise returns false
 */
export async function registerAvatarSync(): Promise<boolean> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('avatar-sync');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
