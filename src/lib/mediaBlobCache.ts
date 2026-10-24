import { createTrackedBlobUrl, revokeBlobUrl } from './blobRegistry';

interface CachedBlob {
  url: string;
  size: number;
  lastAccessed: number;
}

const MAX_CACHE_ITEMS = 12;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB max in-memory decrypted cache

const cache = new Map<string, CachedBlob>();
let currentTotalBytes = 0;

/**
 * Evict oldest entries until cache is within bounds
 */
function evictIfNecessary() {
  if (cache.size <= MAX_CACHE_ITEMS && currentTotalBytes <= MAX_TOTAL_BYTES) {
    return;
  }

  // Sort by lastAccessed ascending
  const entries = Array.from(cache.entries()).sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

  for (const [key, item] of entries) {
    if (cache.size <= MAX_CACHE_ITEMS && currentTotalBytes <= MAX_TOTAL_BYTES) {
      break;
    }
    revokeBlobUrl(item.url);
    currentTotalBytes -= item.size;
    cache.delete(key);
  }
}

/**
 * Returns cached decrypted Blob URL if still valid
 */
export function getCachedMediaBlobUrl(cacheKey: string): string | null {
  if (!cacheKey) return null;
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  entry.lastAccessed = Date.now();
  return entry.url;
}

/**
 * Stores a decrypted Blob in the session cache and returns a tracked Blob URL
 */
export function setCachedMediaBlob(cacheKey: string, blob: Blob): string {
  if (!cacheKey || !blob) {
    return createTrackedBlobUrl(blob);
  }

  const existing = cache.get(cacheKey);
  if (existing) {
    existing.lastAccessed = Date.now();
    return existing.url;
  }

  const url = createTrackedBlobUrl(blob);
  const size = blob.size || 0;

  cache.set(cacheKey, {
    url,
    size,
    lastAccessed: Date.now(),
  });
  currentTotalBytes += size;

  evictIfNecessary();
  return url;
}

/**
 * Directly records an already-created Blob URL in cache
 */
export function setCachedMediaBlobUrl(cacheKey: string, url: string, size = 1024 * 1024): void {
  if (!cacheKey || !url) return;
  const existing = cache.get(cacheKey);
  if (existing) {
    existing.lastAccessed = Date.now();
    return;
  }

  cache.set(cacheKey, {
    url,
    size,
    lastAccessed: Date.now(),
  });
  currentTotalBytes += size;
  evictIfNecessary();
}

/**
 * Panic lock / logout: securely revoke and wipe all decrypted media URLs from RAM
 */
export function clearMediaBlobCache(): void {
  for (const item of cache.values()) {
    revokeBlobUrl(item.url);
  }
  cache.clear();
  currentTotalBytes = 0;
}

// Auto-register panic lock and vault lock listeners in browser
if (typeof window !== 'undefined') {
  window.addEventListener('vault:panic-lock', clearMediaBlobCache);
  window.addEventListener('vault:lock', clearMediaBlobCache);
}
