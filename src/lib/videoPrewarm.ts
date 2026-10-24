/**
 * Intent-Based Speculative Prewarming & Preload Queue
 *
 * Tracks hover / tap intentions and speculatively warms up decryption
 * before the user even clicks Play.
 * Eliminates click-to-playback perceived latency down to ~0ms.
 */

import { VaultItem } from './storage';
import { getVaultItemPreviewUrl, getVaultItemPreviewRevision } from './filePreview';
import { getCachedMediaBlobUrl } from './mediaBlobCache';

const pendingPrewarms = new Set<string>();
const prewarmTimers = new Map<string, number>();

/**
 * Speculatively warms up the decryption of a vault item after a 800ms hover threshold.
 */
export function prewarmVaultMedia(
  item: VaultItem,
  masterKey: string | CryptoKey | null | undefined,
  mimeType?: string,
  delayMs: number = 800,
) {
  if (!item || !masterKey) return;
  // If item is already on server (e.g. GridFS/disk streaming), no worker prewarm required
  const rawItem = item as any;
  if (rawItem.gridFsId || (rawItem.file?.filePath && !item.content)) return;
  const cacheKey = getVaultItemPreviewRevision(item);
  if (getCachedMediaBlobUrl(cacheKey)) {
    // Already in ultra-fast RAM cache
    return;
  }

  // Clear existing timer if any
  if (prewarmTimers.has(item.id)) {
    window.clearTimeout(prewarmTimers.get(item.id));
  }

  const timer = window.setTimeout(async () => {
    prewarmTimers.delete(item.id);
    if (pendingPrewarms.has(item.id)) return;
    pendingPrewarms.add(item.id);

    try {
      // Run background decryption into LRU mediaBlobCache
      await getVaultItemPreviewUrl(item, masterKey, mimeType);
    } catch {
      // Silently swallow speculative failures
    } finally {
      pendingPrewarms.delete(item.id);
    }
  }, delayMs);

  prewarmTimers.set(item.id, timer);
}

/**
 * Cancel prewarm if the user moves mouse away before threshold
 */
export function cancelPrewarmVaultMedia(itemId: string) {
  const timer = prewarmTimers.get(itemId);
  if (timer) {
    window.clearTimeout(timer);
    prewarmTimers.delete(itemId);
  }
}
