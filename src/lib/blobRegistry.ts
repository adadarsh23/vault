// blobRegistry.ts
// Centralized in-memory Blob URL manager with instant panic revocation

const activeBlobUrls = new Set<string>();

/**
 * Creates a tracked Blob URL that will be automatically destroyed on panic lock or vault lock.
 */
export function createTrackedBlobUrl(blob: Blob): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return '';
  }
  const url = URL.createObjectURL(blob);
  activeBlobUrls.add(url);
  return url;
}

/**
 * Registers an existing blob: URL into the tracking set.
 */
export function registerBlobUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('blob:')) {
    activeBlobUrls.add(url);
  }
  return url;
}

/**
 * Safely revokes a specific Blob URL and removes it from the tracking set.
 */
export function revokeBlobUrl(url: string | null | undefined): void {
  if (!url || typeof url !== 'string') return;
  if (url.startsWith('blob:')) {
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    } catch {
      /* ignore */
    } finally {
      activeBlobUrls.delete(url);
    }
  }
}

/**
 * Instant panic purge: revokes ALL registered in-memory blob URLs, unmounts media,
 * and notifies listening media players to clear their buffers and src tags.
 */
export function revokeAllActiveBlobUrls(): number {
  const count = activeBlobUrls.size;
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    for (const url of activeBlobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
  }
  activeBlobUrls.clear();

  // Dispatch media shutdown events
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('vault:panic-lock'));
      window.dispatchEvent(
        new CustomEvent('vault-audio-play', { detail: { playerId: '__stop_all__' } }),
      );
    } catch {
      /* ignore */
    }

    // Force stop all DOM video/audio elements immediately
    try {
      const mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach((el) => {
        const media = el as HTMLMediaElement;
        try {
          media.pause();
          media.currentTime = 0;
          media.removeAttribute('src');
          media.load();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  return count;
}

/**
 * Returns the count of currently active tracked Blob URLs.
 */
export function getActiveBlobUrlCount(): number {
  return activeBlobUrls.size;
}
