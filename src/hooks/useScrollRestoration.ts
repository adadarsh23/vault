import { useEffect, useLayoutEffect, useCallback, useRef, RefObject } from 'react';

const memoryScrollCache = new Map<string, { top: number; left: number; timestamp?: number }>();
const MAX_CACHE_ENTRIES = 100;

export function clearHookScrollCache(): void {
  memoryScrollCache.clear();
}

export interface ScrollRestorationOptions {
  enabled?: boolean;
  autoRestore?: boolean;
  throttleMs?: number;
  saveToSessionStorage?: boolean;
  maxAsyncWaitMs?: number;
  onRestore?: (position: { top: number; left: number }) => void;
}

/**
 * Safely access sessionStorage across all mobile and desktop browsers.
 */
function getSafeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    if ('sessionStorage' in window && window.sessionStorage) {
      const testKey = '__sr_hook_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    }
  } catch {
    // Restricted or private browsing mode
  }
  return null;
}

/**
 * Enterprise reusable hook to save and restore scroll position for custom scroll containers
 * (e.g. overflow-y: auto / scroll divs, editor textareas, or list views).
 *
 * All-Device & Same-Page Compatible:
 * - Restores scroll on same-page reload (F5 / Refresh / Unlocking vault).
 * - Multi-tier async observation: MutationObserver + ResizeObserver (on element and children) + High-frequency Polling.
 * - Flushes scroll position to sessionStorage on beforeunload and pagehide.
 * - Clamps coordinates to prevent iOS rubber-band negative numbers.
 * - Cancels on user interaction (wheel, touchmove, pointerdown).
 */
export function useScrollRestoration(
  key: string,
  ref: RefObject<HTMLElement | null>,
  options: ScrollRestorationOptions = {},
) {
  const {
    enabled = true,
    autoRestore = true,
    throttleMs = 100,
    saveToSessionStorage = true,
    maxAsyncWaitMs = 1500,
    onRestore,
  } = options;

  const storageKey = `scroll_pos_${key}`;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelActiveRestoreRef = useRef<(() => void) | null>(null);

  // Helper to read position from cache/sessionStorage
  const getSavedPosition = useCallback((): { top: number; left: number } => {
    if (memoryScrollCache.has(key)) {
      const cached = memoryScrollCache.get(key)!;
      return { top: cached.top, left: cached.left };
    }
    if (saveToSessionStorage) {
      const storage = getSafeSessionStorage();
      if (storage) {
        try {
          const stored = storage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed === 'object' && parsed !== null) {
              const pos = {
                top: Math.max(0, Math.round(Number(parsed.top) || 0)),
                left: Math.max(0, Math.round(Number(parsed.left) || 0)),
              };
              memoryScrollCache.set(key, { ...pos, timestamp: Date.now() });
              return pos;
            }
          }
        } catch {
          // Ignore session storage errors
        }
      }
    }
    return { top: 0, left: 0 };
  }, [key, saveToSessionStorage, storageKey]);

  // Save scroll position with throttling & coordinate clamping
  const saveScrollPosition = useCallback(() => {
    if (!enabled || !ref.current) return;
    const element = ref.current;
    const pos = {
      top: Math.max(0, Math.round(element.scrollTop)),
      left: Math.max(0, Math.round(element.scrollLeft)),
      timestamp: Date.now(),
    };

    memoryScrollCache.set(key, pos);

    // Evict oldest if exceeding capacity
    if (memoryScrollCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = memoryScrollCache.keys().next().value;
      if (oldestKey) memoryScrollCache.delete(oldestKey);
    }

    if (saveToSessionStorage) {
      const storage = getSafeSessionStorage();
      if (storage) {
        try {
          storage.setItem(storageKey, JSON.stringify({ top: pos.top, left: pos.left }));
        } catch {
          // Ignore quota errors
        }
      }
    }
  }, [enabled, key, ref, saveToSessionStorage, storageKey]);

  // Restore scroll position with async tolerance and multi-tier observation
  const restoreScrollPosition = useCallback(() => {
    if (!enabled || !ref.current) return;

    if (cancelActiveRestoreRef.current) {
      cancelActiveRestoreRef.current();
      cancelActiveRestoreRef.current = null;
    }

    const pos = getSavedPosition();
    if (pos.top <= 0 && pos.left <= 0) return;

    const el = ref.current;
    let isCancelled = false;
    let animId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const cleanup = () => {
      isCancelled = true;
      if (animId !== null) cancelAnimationFrame(animId);
      if (timerId !== null) clearTimeout(timerId);
      if (pollId !== null) clearInterval(pollId);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      el.removeEventListener('wheel', handleInteraction);
      el.removeEventListener('touchmove', handleInteraction);
      el.removeEventListener('pointerdown', handleInteraction);
    };

    const handleInteraction = () => {
      cleanup();
    };

    el.addEventListener('wheel', handleInteraction, { passive: true });
    el.addEventListener('touchmove', handleInteraction, { passive: true });
    el.addEventListener('pointerdown', handleInteraction, { passive: true });

    const applyScroll = () => {
      if (isCancelled || !ref.current) return;
      const target = ref.current;

      target.scrollTop = pos.top;
      target.scrollLeft = pos.left;

      if (onRestore) {
        onRestore(pos);
      }

      // Check if target height allowed full restoration
      const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
      if (pos.top === 0 || maxScroll >= pos.top - 2 || target.scrollTop >= pos.top - 2) {
        cleanup();
      }
    };

    animId = requestAnimationFrame(() => {
      animId = requestAnimationFrame(() => {
        applyScroll();

        if (!isCancelled) {
          // 1. MutationObserver: Fires whenever children (cards, tables, lists) mount into the container
          if (typeof MutationObserver !== 'undefined' && ref.current) {
            try {
              mutationObserver = new MutationObserver(() => {
                applyScroll();
              });
              mutationObserver.observe(ref.current, { childList: true, subtree: true });
            } catch {}
          }

          // 2. ResizeObserver: Observe container AND its first child (which expands when content renders)
          if (typeof ResizeObserver !== 'undefined' && ref.current) {
            try {
              resizeObserver = new ResizeObserver(() => {
                applyScroll();
              });
              resizeObserver.observe(ref.current);
              if (ref.current.firstElementChild) {
                resizeObserver.observe(ref.current.firstElementChild);
              }
            } catch {}
          }

          // 3. High-frequency polling safety net: Guarantees restoration as soon as scrollHeight grows
          pollId = setInterval(() => {
            applyScroll();
          }, 50);

          timerId = setTimeout(() => {
            cleanup();
          }, maxAsyncWaitMs);
        }
      });
    });

    cancelActiveRestoreRef.current = cleanup;
  }, [enabled, getSavedPosition, onRestore, ref, maxAsyncWaitMs]);

  // Handle scroll listener with throttling
  useEffect(() => {
    if (!enabled || !ref.current) return;

    const element = ref.current;

    const handleScroll = () => {
      if (timeoutRef.current) return;
      timeoutRef.current = setTimeout(() => {
        saveScrollPosition();
        timeoutRef.current = null;
      }, throttleMs);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      saveScrollPosition();
    };
  }, [enabled, ref, saveScrollPosition, throttleMs]);

  // Flush scroll position to sessionStorage on page refresh (F5 / Reload) or closing tab
  useEffect(() => {
    if (!enabled || !saveToSessionStorage) return;

    const handleUnload = () => {
      saveScrollPosition();
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [enabled, saveToSessionStorage, saveScrollPosition]);

  // Restore on key change / mount if autoRestore is enabled
  useLayoutEffect(() => {
    if (autoRestore) {
      restoreScrollPosition();
    }
  }, [autoRestore, key, restoreScrollPosition]);

  return {
    saveScroll: saveScrollPosition,
    restoreScroll: restoreScrollPosition,
    saveScrollPosition,
    restoreScrollPosition,
    getSavedPosition,
  };
}
