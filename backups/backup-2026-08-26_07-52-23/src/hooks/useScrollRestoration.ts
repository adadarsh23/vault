import { useEffect, useLayoutEffect, useCallback, useRef, RefObject } from 'react';

const memoryScrollCache = new Map<string, { top: number; left: number }>();

export interface ScrollRestorationOptions {
  enabled?: boolean;
  autoRestore?: boolean;
  throttleMs?: number;
  saveToSessionStorage?: boolean;
  onRestore?: (position: { top: number; left: number }) => void;
}

/**
 * Reusable hook to save and restore scroll position for custom scroll containers
 * (e.g. overflow-y: auto / scroll divs, editor textareas, or list views).
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
    onRestore,
  } = options;

  const storageKey = `scroll_pos_${key}`;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to read position from cache/sessionStorage
  const getSavedPosition = useCallback((): { top: number; left: number } => {
    if (memoryScrollCache.has(key)) {
      return memoryScrollCache.get(key)!;
    }
    if (saveToSessionStorage && typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            return { top: Number(parsed.top) || 0, left: Number(parsed.left) || 0 };
          }
        }
      } catch {
        // Ignore session storage errors
      }
    }
    return { top: 0, left: 0 };
  }, [key, saveToSessionStorage, storageKey]);

  // Save scroll position with throttling
  const saveScrollPosition = useCallback(() => {
    if (!enabled || !ref.current) return;
    const element = ref.current;
    const pos = { top: element.scrollTop, left: element.scrollLeft };

    memoryScrollCache.set(key, pos);

    if (saveToSessionStorage && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(pos));
      } catch {
        // Ignore quota errors
      }
    }
  }, [enabled, key, ref, saveToSessionStorage, storageKey]);

  // Restore scroll position
  const restoreScrollPosition = useCallback(() => {
    if (!enabled || !ref.current) return;

    const pos = getSavedPosition();
    if (pos.top > 0 || pos.left > 0) {
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.scrollTop = pos.top;
          ref.current.scrollLeft = pos.left;
          if (onRestore) {
            onRestore(pos);
          }
        }
      });
    }
  }, [enabled, getSavedPosition, onRestore, ref]);

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
      // Save current scroll on cleanup/unmount
      saveScrollPosition();
    };
  }, [enabled, ref, saveScrollPosition, throttleMs]);

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
