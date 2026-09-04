import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigationType, type Location } from 'react-router-dom';

/**
 * Saved scroll coordinates for window and registered custom containers.
 */
export interface SavedPosition {
  x: number;
  y: number;
  containers?: Record<string, { top: number; left: number }>;
  timestamp: number;
}

export interface ScrollRestorationProps {
  /**
   * Custom function to compute a unique storage key for a given location.
   * Defaults to `location.key` (or `pathname + search` for default/empty keys).
   */
  getKey?: (location: Location) => string;

  /**
   * Key used to persist scroll positions across page reloads in sessionStorage.
   * Defaults to `'react-router-scroll-positions'`.
   */
  storageKey?: string;

  /**
   * If true, prevents automatic scrolling to (0, 0) on PUSH/REPLACE navigations.
   * Defaults to `false`.
   */
  preventScrollReset?: boolean;

  /**
   * Explicit pixel position to scroll to on navigation.
   * If `false`, scrolling is completely bypassed.
   */
  restoreScrollPosition?: number | false;

  /**
   * CSS selector for custom internal scroll containers to also track and restore.
   * Defaults to `'[data-scroll-container="true"]'`.
   */
  containerSelector?: string;

  /**
   * Whether to scroll smoothly to hash anchors (`#my-anchor`).
   * Automatically falls back to instant scroll if `prefers-reduced-motion` is active.
   * Defaults to `true`.
   */
  smoothHashScroll?: boolean;

  /**
   * Top offset (in px) when scrolling to hash anchors to account for fixed headers.
   * Defaults to `72` (standard navbar height).
   */
  hashHeaderOffset?: number;

  /**
   * Maximum duration (in ms) to poll / observe for async content height to settle.
   * Especially important for routes wrapped in `<Suspense>`, `<AnimatePresence>`, or lazy chunks.
   * Defaults to `1500`.
   */
  maxAsyncWaitMs?: number;

  /**
   * Enable verbose logging for debugging in development.
   * Defaults to `false`.
   */
  debug?: boolean;
}

const DEFAULT_STORAGE_KEY = 'react-router-scroll-positions';
const DEFAULT_CONTAINER_SELECTOR = '[data-scroll-container="true"]';
const MAX_CACHE_ENTRIES = 60; // LRU limit to keep memory and storage lightweight

// High-speed in-memory cache
const memoryScrollCache = new Map<string, SavedPosition>();

/**
 * Clear the in-memory scroll cache (useful for testing or full app logout).
 */
export function clearScrollCache(): void {
  memoryScrollCache.clear();
}

/**
 * Safely access sessionStorage across all browser environments.
 * Prevents SecurityError in sandboxed iframes, private browsing modes, and storage quota limits.
 */
function getSafeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    if ('sessionStorage' in window && window.sessionStorage) {
      const probeKey = '__sr_probe__';
      window.sessionStorage.setItem(probeKey, '1');
      window.sessionStorage.removeItem(probeKey);
      return window.sessionStorage;
    }
  } catch {
    // Restricted or private browsing mode
  }
  return null;
}

/**
 * Safely load cached scroll positions from sessionStorage.
 */
function loadPositionsFromSessionStorage(storageKey: string): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [key, val] of Object.entries(parsed)) {
        if (val && typeof val === 'object' && 'x' in val && 'y' in val) {
          memoryScrollCache.set(key, val as SavedPosition);
        }
      }
    }
  } catch {
    // Gracefully ignore corrupted JSON or read errors
  }
}

/**
 * Safely persist in-memory cache to sessionStorage with LRU eviction.
 */
function savePositionsToSessionStorage(storageKey: string): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    // LRU eviction if capacity exceeded
    if (memoryScrollCache.size > MAX_CACHE_ENTRIES) {
      const entries = Array.from(memoryScrollCache.entries()).sort(
        (a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0),
      );
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
      for (const [k] of toRemove) {
        memoryScrollCache.delete(k);
      }
    }

    const payload = Object.fromEntries(memoryScrollCache.entries());
    storage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // QuotaExceededError or security restrictions
  }
}

/**
 * Safe CSS selector escape compatible with all browsers (including older Safari/Android).
 */
function safeCssEscape(str: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    try {
      return CSS.escape(str);
    } catch {
      // Fallback below
    }
  }
  return str.replace(/["\\]/g, '\\$&');
}

/**
 * Default key generator based on location.
 */
function defaultGetKey(location: Location): string {
  if (location.key && location.key !== 'default') {
    return location.key;
  }
  return `${location.pathname}${location.search}`;
}

/**
 * Safe window scroll coordinate getter.
 * Clamps negative values (fixes iOS Safari rubber-band/momentum bounce quirks).
 */
function getWindowScroll(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };

  const doc = document.documentElement;
  const body = document.body;

  const rawX = window.scrollX ?? window.pageXOffset ?? doc?.scrollLeft ?? body?.scrollLeft ?? 0;
  const rawY = window.scrollY ?? window.pageYOffset ?? doc?.scrollTop ?? body?.scrollTop ?? 0;

  return {
    x: Math.max(0, Math.round(rawX)),
    y: Math.max(0, Math.round(rawY)),
  };
}

/**
 * Safe window scroll setter compatible with all devices.
 * Uses window.scrollTo(x, y) to avoid TypeError: Invalid enum value for behavior: 'instant' on older Safari/iOS.
 */
function setWindowScroll(x: number, y: number, options?: ScrollToOptions): void {
  if (typeof window === 'undefined') return;

  const targetX = Math.max(0, x);
  const targetY = Math.max(0, y);

  if (options && (options.behavior || options.top !== undefined || options.left !== undefined)) {
    try {
      window.scrollTo({ left: targetX, top: targetY, ...options });
      return;
    } catch {
      // Fallback to numeric coordinates for older browser engines
    }
  }

  try {
    window.scrollTo(targetX, targetY);
  } catch {
    if (document.documentElement) {
      document.documentElement.scrollLeft = targetX;
      document.documentElement.scrollTop = targetY;
    }
    if (document.body) {
      document.body.scrollLeft = targetX;
      document.body.scrollTop = targetY;
    }
  }
}

/**
 * Capture current scroll coordinates of window and custom containers.
 */
function captureCurrentPosition(containerSelector: string): SavedPosition {
  const windowPos = getWindowScroll();

  const saved: SavedPosition = {
    x: windowPos.x,
    y: windowPos.y,
    timestamp: Date.now(),
  };

  if (typeof document !== 'undefined') {
    try {
      const containers = document.querySelectorAll<HTMLElement>(containerSelector);
      if (containers.length > 0) {
        const containerMap: Record<string, { top: number; left: number }> = {};
        containers.forEach((el, index) => {
          const id = el.id || el.getAttribute('data-scroll-id') || `container_${index}`;
          containerMap[id] = {
            top: Math.max(0, Math.round(el.scrollTop)),
            left: Math.max(0, Math.round(el.scrollLeft)),
          };
        });
        saved.containers = containerMap;
      }
    } catch {
      // Ignore DOM query issues
    }
  }

  return saved;
}

/**
 * Check if the active element is an input, textarea, or editable content.
 * Prevents mobile virtual keyboard disruptions during transitions.
 */
function isEditableElementActive(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.getAttribute('contenteditable') === 'true'
  );
}

/**
 * Production-Ready All-Device Compatible Scroll Restoration Component.
 *
 * Guaranteed compatibility across:
 * - iOS Safari (iPhone, iPad): Handles rubber-band negative scroll coordinates,
 *   viewport height changes, virtual keyboard focus, and older WebKit engines.
 * - Android (Chrome, Samsung Internet, Firefox Mobile, WebViews): Handles address bar
 *   collapsing/expanding, orientation changes, and touch gestures.
 * - Desktop (Chrome, Firefox, Safari, Edge): Supports high-refresh displays (120Hz+),
 *   trackpad inertial scrolling, and mouse wheel navigation.
 * - Low-Power / Legacy Devices: Zero forced reflows, passive listeners, and non-blocking RAF loops.
 */
export function ScrollRestoration({
  getKey = defaultGetKey,
  storageKey = DEFAULT_STORAGE_KEY,
  preventScrollReset = false,
  restoreScrollPosition,
  containerSelector = DEFAULT_CONTAINER_SELECTOR,
  smoothHashScroll = true,
  hashHeaderOffset = 72,
  maxAsyncWaitMs = 1500,
  debug = false,
}: ScrollRestorationProps) {
  const location = useLocation();
  const navigationType = useNavigationType();

  const prevLocationRef = useRef<Location>(location);
  const cancelActiveRestorationRef = useRef<(() => void) | null>(null);

  // Initialize from sessionStorage on mount
  useEffect(() => {
    loadPositionsFromSessionStorage(storageKey);
  }, [storageKey]);

  // Set browser history.scrollRestoration to 'manual' safely
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let original: globalThis.ScrollRestoration | undefined;
    try {
      if ('scrollRestoration' in window.history) {
        original = window.history.scrollRestoration;
        window.history.scrollRestoration = 'manual';
      }
    } catch {
      // Safe fallback in restricted environments
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        try {
          if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
          }
        } catch {}
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      try {
        if (original && 'scrollRestoration' in window.history) {
          window.history.scrollRestoration = original;
        }
      } catch {}
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // Cleanup active async observers, RAF, and timeouts on unmount
  useEffect(() => {
    return () => {
      if (cancelActiveRestorationRef.current) {
        cancelActiveRestorationRef.current();
        cancelActiveRestorationRef.current = null;
      }
    };
  }, []);

  // Save current scroll coordinates helper
  const recordCurrentScroll = useCallback(
    (targetLocation: Location) => {
      const key = getKey(targetLocation);
      const pos = captureCurrentPosition(containerSelector);
      memoryScrollCache.set(key, pos);
      if (debug) {
        console.debug('[ScrollRestoration] Saved position for key:', key, pos);
      }
    },
    [getKey, containerSelector, debug],
  );

  // Throttled scroll listener using requestAnimationFrame for optimal 60fps/120fps performance
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          recordCurrentScroll(location);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });

    // Also attach scroll listeners directly to matching containers
    const containers = document.querySelectorAll<HTMLElement>(containerSelector);
    containers.forEach((el) => {
      el.addEventListener('scroll', onScroll, { passive: true });
    });

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      containers.forEach((el) => {
        el.removeEventListener('scroll', onScroll);
      });
      const pos = captureCurrentPosition(containerSelector);
      const hasPos =
        pos.x > 0 ||
        pos.y > 0 ||
        (pos.containers && Object.values(pos.containers).some((c) => c.top > 0 || c.left > 0));
      if (hasPos) {
        memoryScrollCache.set(getKey(location), pos);
        savePositionsToSessionStorage(storageKey);
      }
    };
  }, [location, recordCurrentScroll, containerSelector, storageKey]);

  // Flush scroll positions on pagehide and beforeunload
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUnload = () => {
      recordCurrentScroll(location);
      savePositionsToSessionStorage(storageKey);
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [location, recordCurrentScroll, storageKey]);

  // Primary scroll restoration effect triggered on location & navigation changes
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    // Hydrate from sessionStorage immediately if cache is empty (e.g. on page refresh F5)
    if (memoryScrollCache.size === 0) {
      loadPositionsFromSessionStorage(storageKey);
    }

    // Abort any pending async restoration loops from the previous route
    if (cancelActiveRestorationRef.current) {
      cancelActiveRestorationRef.current();
      cancelActiveRestorationRef.current = null;
    }

    // Save previous route scroll position before restoring new route
    if (prevLocationRef.current && prevLocationRef.current !== location) {
      recordCurrentScroll(prevLocationRef.current);
    }
    prevLocationRef.current = location;

    // Explicit bypass
    if (restoreScrollPosition === false) {
      return;
    }

    // Explicit pixel coordinate
    if (typeof restoreScrollPosition === 'number') {
      setWindowScroll(0, restoreScrollPosition);
      return;
    }

    const currentKey = getKey(location);
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // =========================================================================
    // CASE 1: POP Navigation (Browser Back / Forward Button)
    // =========================================================================
    if (navigationType === 'POP') {
      const saved = memoryScrollCache.get(currentKey);
      const hasContainerScroll =
        saved?.containers &&
        Object.values(saved.containers).some((c) => (c.top || 0) > 0 || (c.left || 0) > 0);
      const hasPositiveScroll = saved && (saved.x > 0 || saved.y > 0 || hasContainerScroll);

      if (hasPositiveScroll) {
        if (debug) {
          console.debug('[ScrollRestoration] Restoring POP position for key:', currentKey, saved);
        }

        let isCancelled = false;
        let animationFrameId: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let observer: MutationObserver | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        // Clean-up handler
        const cleanup = () => {
          isCancelled = true;
          if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
          if (timeoutId !== null) clearTimeout(timeoutId);
          if (pollInterval !== null) clearInterval(pollInterval);
          if (observer) observer.disconnect();
          if (resizeObserver) resizeObserver.disconnect();
          window.removeEventListener('wheel', handleUserInterruption);
          window.removeEventListener('touchmove', handleUserInterruption);
          window.removeEventListener('keydown', handleKeyInterruption);
          window.removeEventListener('pointerdown', handleUserInterruption);
        };

        // User intent protection: If user scrolls or drags, abort restoration immediately
        const handleUserInterruption = () => {
          cleanup();
        };

        const handleKeyInterruption = (e: KeyboardEvent) => {
          const scrollKeys = [
            'Space',
            'PageUp',
            'PageDown',
            'End',
            'Home',
            'ArrowLeft',
            'ArrowUp',
            'ArrowRight',
            'ArrowDown',
          ];
          if (scrollKeys.includes(e.code) || scrollKeys.includes(e.key)) {
            cleanup();
          }
        };

        window.addEventListener('wheel', handleUserInterruption, { passive: true });
        window.addEventListener('touchmove', handleUserInterruption, { passive: true });
        window.addEventListener('keydown', handleKeyInterruption, { passive: true });
        window.addEventListener('pointerdown', handleUserInterruption, { passive: true });

        const executeRestore = () => {
          if (
            isCancelled ||
            typeof window === 'undefined' ||
            typeof document === 'undefined' ||
            !document.body
          ) {
            return;
          }

          // Do not hijack scroll if user is actively typing in a form input
          if (isEditableElementActive()) {
            return;
          }

          // 1. Restore window scroll position safely
          setWindowScroll(saved.x, saved.y, { behavior: 'auto' });

          // 2. Restore custom scroll containers
          let allContainersSatisfied = true;
          if (saved.containers) {
            try {
              const containers = document.querySelectorAll<HTMLElement>(containerSelector);
              containers.forEach((el, index) => {
                const id = el.id || el.getAttribute('data-scroll-id') || `container_${index}`;
                const pos = saved.containers?.[id];
                if (pos) {
                  el.scrollTop = pos.top;
                  el.scrollLeft = pos.left;

                  // Check if container height allowed full restoration
                  if (pos.top > 0 && el.scrollHeight - el.clientHeight < pos.top - 2) {
                    allContainersSatisfied = false;
                  }
                }
              });
            } catch {
              // Ignore selector errors
            }
          }

          // Check if window height was sufficient
          const doc = document.documentElement;
          const body = document.body;
          const scrollHeight = Math.max(doc?.scrollHeight || 0, body?.scrollHeight || 0);
          const clientHeight = Math.max(window.innerHeight || 0, doc?.clientHeight || 0);
          const maxScrollY = Math.max(0, scrollHeight - clientHeight);
          const windowSatisfied = saved.y === 0 || maxScrollY >= saved.y - 2;

          // If content layout is fully satisfied, finish early
          if (windowSatisfied && allContainersSatisfied) {
            cleanup();
          }
        };

        // Double RAF for React layout settling
        animationFrameId = window.requestAnimationFrame(() => {
          animationFrameId = window.requestAnimationFrame(() => {
            executeRestore();

            if (!isCancelled) {
              // Strategy A: MutationObserver for added DOM nodes
              if (typeof MutationObserver !== 'undefined' && document.body) {
                try {
                  observer = new MutationObserver(() => {
                    executeRestore();
                  });
                  observer.observe(document.body, { childList: true, subtree: true });
                } catch {}
              }

              // Strategy B: ResizeObserver for container size expansion
              if (typeof ResizeObserver !== 'undefined') {
                try {
                  resizeObserver = new ResizeObserver(() => {
                    executeRestore();
                  });
                  if (document.documentElement) {
                    resizeObserver.observe(document.documentElement);
                  }
                  const containers = document.querySelectorAll<HTMLElement>(containerSelector);
                  containers.forEach((c) => resizeObserver?.observe(c));
                } catch {}
              }

              // Strategy C: Polling fallback for older mobile engines without ResizeObserver
              if (!resizeObserver && !observer) {
                let pollCount = 0;
                pollInterval = setInterval(() => {
                  executeRestore();
                  pollCount++;
                  if (pollCount > 10) {
                    if (pollInterval) clearInterval(pollInterval);
                  }
                }, 100);
              }

              // Maximum timeout safety valve to prevent background observers running indefinitely
              timeoutId = setTimeout(() => {
                cleanup();
              }, maxAsyncWaitMs);
            }
          });
        });

        cancelActiveRestorationRef.current = cleanup;
        return;
      }
    }

    // =========================================================================
    // CASE 2: Hash Navigation (#my-anchor)
    // =========================================================================
    if (location.hash) {
      const rawHash = location.hash.replace(/^#/, '');
      let decodedHash = rawHash;
      try {
        decodedHash = decodeURIComponent(rawHash);
      } catch {
        // Keep raw hash if malformed URI
      }

      if (decodedHash) {
        let attempts = 0;
        const maxAttempts = 25; // Check for up to 800ms
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let isCancelled = false;

        const scrollToTarget = () => {
          if (isCancelled) return;

          let target: HTMLElement | null = null;
          try {
            target =
              document.getElementById(decodedHash) ||
              document.querySelector(`[name="${safeCssEscape(decodedHash)}"]`) ||
              document.querySelector(`#${safeCssEscape(decodedHash)}`);
          } catch {
            target = document.getElementById(decodedHash);
          }

          if (target) {
            // Check if inside custom scroll container
            const parentContainer =
              typeof target.closest === 'function'
                ? target.closest<HTMLElement>(containerSelector)
                : null;
            if (parentContainer) {
              const targetRect = target.getBoundingClientRect();
              const containerRect = parentContainer.getBoundingClientRect();
              const relativeTop =
                targetRect.top - containerRect.top + parentContainer.scrollTop - hashHeaderOffset;

              try {
                parentContainer.scrollTo({
                  top: Math.max(0, relativeTop),
                  behavior: smoothHashScroll && !prefersReducedMotion ? 'smooth' : 'auto',
                });
              } catch {
                parentContainer.scrollTop = Math.max(0, relativeTop);
              }
            } else {
              const elementPosition =
                target.getBoundingClientRect().top +
                (window.pageYOffset || document.documentElement.scrollTop || 0);
              const offsetPosition = Math.max(0, elementPosition - hashHeaderOffset);

              setWindowScroll(0, offsetPosition, {
                behavior: smoothHashScroll && !prefersReducedMotion ? 'smooth' : 'auto',
              });
            }
          } else if (attempts < maxAttempts) {
            attempts++;
            timeoutId = setTimeout(scrollToTarget, 32);
          }
        };

        timeoutId = setTimeout(scrollToTarget, 16);

        cancelActiveRestorationRef.current = () => {
          isCancelled = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
        };

        return;
      }
    }

    // =========================================================================
    // CASE 3: Standard PUSH / REPLACE Navigation (Reset to Top)
    // =========================================================================
    if (preventScrollReset !== true) {
      if (debug) {
        console.debug('[ScrollRestoration] Resetting scroll to top for navigation');
      }

      setWindowScroll(0, 0);

      try {
        const containers = document.querySelectorAll<HTMLElement>(containerSelector);
        containers.forEach((el) => {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        });
      } catch {
        // Ignore DOM query issues
      }
    }
  }, [
    location,
    navigationType,
    getKey,
    preventScrollReset,
    restoreScrollPosition,
    containerSelector,
    smoothHashScroll,
    hashHeaderOffset,
    maxAsyncWaitMs,
    recordCurrentScroll,
    debug,
  ]);

  return null;
}

export default ScrollRestoration;
