import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigationType, type Location } from 'react-router-dom';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
   * Optional predicate or custom coordinate resolver called before updating scroll on navigation.
   * - Return `false` to prevent scrolling.
   * - Return `[x, y]` to scroll to specific coordinates.
   * - Return `true` (or undefined) to proceed with standard restoration.
   */
  shouldUpdateScroll?: (
    prevLocation: Location | null,
    currentLocation: Location,
  ) => boolean | [number, number] | undefined;

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
let isSessionStorageAvailable: boolean | null = null;

/**
 * Clear the in-memory scroll cache and reset storage probe (useful for testing or full app logout).
 */
export function clearScrollCache(): void {
  memoryScrollCache.clear();
  isSessionStorageAvailable = null;
}

/**
 * Safe querySelectorAll helper that never throws DOMException on malformed/empty selectors.
 */
export function safeQuerySelectorAll<T extends Element = HTMLElement>(
  selector?: string,
  root: Document | HTMLElement = document,
): T[] {
  if (
    !selector ||
    typeof selector !== 'string' ||
    !selector.trim() ||
    typeof root === 'undefined'
  ) {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

/**
 * Safely access sessionStorage across all browser environments.
 * Prevents SecurityError in sandboxed iframes, private browsing modes, and storage quota limits.
 */
function getSafeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (isSessionStorageAvailable === false) return null;

  try {
    if ('sessionStorage' in window && window.sessionStorage) {
      if (isSessionStorageAvailable === true) {
        return window.sessionStorage;
      }
      const probeKey = '__sr_probe__';
      window.sessionStorage.setItem(probeKey, '1');
      window.sessionStorage.removeItem(probeKey);
      isSessionStorageAvailable = true;
      return window.sessionStorage;
    }
  } catch {
    isSessionStorageAvailable = false;
  }
  return null;
}

/**
 * Safely load cached scroll positions from sessionStorage with prototype pollution protection.
 */
function loadPositionsFromSessionStorage(storageKey: string): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, val] of Object.entries(parsed)) {
        // Prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

        if (val && typeof val === 'object' && 'x' in val && 'y' in val) {
          const rawVal = val as Record<string, unknown>;
          const x = Number(rawVal.x);
          const y = Number(rawVal.y);

          if (Number.isFinite(x) && Number.isFinite(y)) {
            let containerMap: Record<string, { top: number; left: number }> | undefined;
            if (
              rawVal.containers &&
              typeof rawVal.containers === 'object' &&
              !Array.isArray(rawVal.containers)
            ) {
              containerMap = {};
              for (const [cKey, cVal] of Object.entries(
                rawVal.containers as Record<string, unknown>,
              )) {
                if (cKey === '__proto__' || cKey === 'constructor' || cKey === 'prototype')
                  continue;
                if (cVal && typeof cVal === 'object') {
                  const cRec = cVal as Record<string, unknown>;
                  const top = Number(cRec.top);
                  const left = Number(cRec.left);
                  if (Number.isFinite(top) && Number.isFinite(left)) {
                    containerMap[cKey] = {
                      top: Math.max(0, Math.round(top)),
                      left: Math.max(0, Math.round(left)),
                    };
                  }
                }
              }
            }

            memoryScrollCache.set(key, {
              x: Math.max(0, Math.round(x)),
              y: Math.max(0, Math.round(y)),
              timestamp: Number(rawVal.timestamp) || Date.now(),
              containers: containerMap,
            });
          }
        }
      }
    }
  } catch {
    // Gracefully ignore corrupted JSON or read errors
  }
}

/**
 * Safely persist in-memory cache to sessionStorage with LRU eviction and quota error recovery.
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
    try {
      // Emergency recovery for QuotaExceededError on mobile / restricted environments
      // Retain only window x, y coordinates and the 15 most recent entries
      const compactPayload: Record<string, { x: number; y: number; timestamp: number }> = {};
      const entries = Array.from(memoryScrollCache.entries()).slice(-15);
      for (const [k, v] of entries) {
        compactPayload[k] = { x: v.x, y: v.y, timestamp: v.timestamp };
      }
      storage.setItem(storageKey, JSON.stringify(compactPayload));
    } catch {
      // If even compact payload cannot be stored, degrade silently
    }
  }
}

/**
 * Safe CSS selector escape compatible with all browsers (including older Safari/Android).
 */
function safeCssEscape(str: string): string {
  if (!str) return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    try {
      return CSS.escape(str);
    } catch {
      // Fallback below
    }
  }
  // Robust CSS selector escape fallback according to CSSOM specification
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Default key generator based on location.
 */
function defaultGetKey(location: Location): string {
  if (location && location.key && location.key !== 'default') {
    return location.key;
  }
  if (location) {
    return `${location.pathname || ''}${location.search || ''}`;
  }
  return 'default';
}

/**
 * Safe window scroll coordinate getter.
 * Clamps negative values (fixes iOS Safari rubber-band/momentum bounce quirks).
 */
export function getWindowScroll(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };

  try {
    const doc = document.documentElement;
    const body = document.body;
    const scrollingElement = document.scrollingElement;

    const rawX =
      window.scrollX ??
      window.pageXOffset ??
      scrollingElement?.scrollLeft ??
      doc?.scrollLeft ??
      body?.scrollLeft ??
      0;
    const rawY =
      window.scrollY ??
      window.pageYOffset ??
      scrollingElement?.scrollTop ??
      doc?.scrollTop ??
      body?.scrollTop ??
      0;

    return {
      x: Number.isFinite(rawX) ? Math.max(0, Math.round(rawX)) : 0,
      y: Number.isFinite(rawY) ? Math.max(0, Math.round(rawY)) : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

/**
 * Safe window scroll setter compatible with all devices.
 * Uses window.scrollTo(x, y) to avoid TypeError: Invalid enum value for behavior: 'instant' on older Safari/iOS.
 */
export function setWindowScroll(x: number, y: number, options?: ScrollToOptions): void {
  if (typeof window === 'undefined') return;

  const targetX = Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0;
  const targetY = Number.isFinite(y) ? Math.max(0, Math.round(y)) : 0;

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
    try {
      const targetEl = document.scrollingElement || document.documentElement || document.body;
      if (targetEl) {
        targetEl.scrollLeft = targetX;
        targetEl.scrollTop = targetY;
      }
    } catch {
      // Degrade gracefully
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

  const containers = safeQuerySelectorAll<HTMLElement>(containerSelector);
  if (containers.length > 0) {
    const containerMap: Record<string, { top: number; left: number }> = {};
    let hasContainerScroll = false;

    for (let index = 0; index < containers.length; index++) {
      const el = containers[index];
      if (!el) continue;
      const id = el.id || el.getAttribute('data-scroll-id') || `container_${index}`;
      const top = Number.isFinite(el.scrollTop) ? Math.max(0, Math.round(el.scrollTop)) : 0;
      const left = Number.isFinite(el.scrollLeft) ? Math.max(0, Math.round(el.scrollLeft)) : 0;
      if (top > 0 || left > 0) {
        containerMap[id] = { top, left };
        hasContainerScroll = true;
      }
    }
    if (hasContainerScroll) {
      saved.containers = containerMap;
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
  try {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (el as HTMLElement).isContentEditable === true ||
      el.getAttribute('contenteditable') === 'true'
    );
  } catch {
    return false;
  }
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
 * - Low-Power / Legacy Devices: Zero forced reflows, passive listeners, throttled RAF loops,
 *   and ResizeObserver notification storm protection.
 */
export function ScrollRestoration({
  getKey = defaultGetKey,
  storageKey = DEFAULT_STORAGE_KEY,
  preventScrollReset = false,
  restoreScrollPosition,
  shouldUpdateScroll,
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

  // Safe key computation helper with fallback
  const safeGetKey = useCallback(
    (loc: Location): string => {
      try {
        if (getKey) {
          const res = getKey(loc);
          if (res && typeof res === 'string') return res;
        }
      } catch (err) {
        if (debug) {
          console.warn(
            '[ScrollRestoration] Custom getKey threw an error, falling back to default:',
            err,
          );
        }
      }
      return defaultGetKey(loc);
    },
    [getKey, debug],
  );

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
      try {
        const key = safeGetKey(targetLocation);
        const pos = captureCurrentPosition(containerSelector);
        memoryScrollCache.set(key, pos);

        // Also index under pathname + search for seamless F5 / page reload restoration
        const pathSearchKey = `${targetLocation.pathname || ''}${targetLocation.search || ''}`;
        if (key !== pathSearchKey && pathSearchKey) {
          memoryScrollCache.set(pathSearchKey, pos);
        }
      } catch {
        // Silently catch to prevent console spam and disruption during active scrolling
      }
    },
    [safeGetKey, containerSelector],
  );

  // Throttled scroll listener using requestAnimationFrame for optimal 60fps/120fps performance
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ticking = false;
    let rafId: number | null = null;

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        rafId = window.requestAnimationFrame(() => {
          recordCurrentScroll(location);
          ticking = false;
          rafId = null;
        });
      }
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('scroll', onScroll, { capture: true });

      const pos = captureCurrentPosition(containerSelector);
      const hasPos =
        pos.x > 0 ||
        pos.y > 0 ||
        (pos.containers && Object.values(pos.containers).some((c) => c.top > 0 || c.left > 0));

      if (hasPos) {
        memoryScrollCache.set(safeGetKey(location), pos);
        savePositionsToSessionStorage(storageKey);
      }
    };
  }, [location, recordCurrentScroll, safeGetKey, containerSelector, storageKey]);

  // Flush scroll positions on pagehide, freeze, beforeunload, and visibilitychange (hidden)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUnload = () => {
      try {
        recordCurrentScroll(location);
        savePositionsToSessionStorage(storageKey);
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        handleUnload();
      }
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [location, recordCurrentScroll, storageKey]);

  // Primary scroll restoration effect triggered on location & navigation changes
  useIsomorphicLayoutEffect(() => {
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

    // Custom shouldUpdateScroll check
    if (shouldUpdateScroll) {
      try {
        const decision = shouldUpdateScroll(prevLocationRef.current, location);
        if (decision === false) {
          prevLocationRef.current = location;
          return;
        }
        if (Array.isArray(decision) && decision.length === 2) {
          const [targetX, targetY] = decision;
          setWindowScroll(targetX, targetY);
          prevLocationRef.current = location;
          return;
        }
      } catch (err) {
        if (debug) {
          console.warn('[ScrollRestoration] shouldUpdateScroll threw an error:', err);
        }
      }
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

    const currentKey = safeGetKey(location);
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // =========================================================================
    // CASE 1: POP Navigation (Browser Back / Forward Button)
    // =========================================================================
    if (navigationType === 'POP') {
      const pathSearchKey = `${location.pathname || ''}${location.search || ''}`;
      const saved =
        memoryScrollCache.get(currentKey) ||
        (pathSearchKey ? memoryScrollCache.get(pathSearchKey) : undefined);

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
          if (isCancelled) return;
          isCancelled = true;

          if (animationFrameId !== null) {
            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (pollInterval !== null) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (observer) {
            try {
              observer.disconnect();
            } catch {}
            observer = null;
          }
          if (resizeObserver) {
            try {
              resizeObserver.disconnect();
            } catch {}
            resizeObserver = null;
          }

          window.removeEventListener('wheel', handleUserInterruption);
          window.removeEventListener('touchmove', handleUserInterruption);
          window.removeEventListener('keydown', handleKeyInterruption);
          window.removeEventListener('pointerdown', handleUserInterruption);
          document.removeEventListener('visibilitychange', handleVisibilityChange);

          if (cancelActiveRestorationRef.current === cleanup) {
            cancelActiveRestorationRef.current = null;
          }
        };

        // User intent protection: If user scrolls or drags, abort restoration immediately
        const handleUserInterruption = () => {
          cleanup();
        };

        const handleKeyInterruption = (e: KeyboardEvent) => {
          const scrollKeys = [
            'Space',
            ' ',
            'Spacebar',
            'PageUp',
            'PageDown',
            'End',
            'Home',
            'ArrowLeft',
            'ArrowUp',
            'ArrowRight',
            'ArrowDown',
            'Up',
            'Down',
            'Left',
            'Right',
          ];
          if (scrollKeys.includes(e.code) || scrollKeys.includes(e.key)) {
            cleanup();
          }
        };

        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && !isCancelled) {
            executeRestore();
          }
        };

        window.addEventListener('wheel', handleUserInterruption, { passive: true });
        window.addEventListener('touchmove', handleUserInterruption, { passive: true });
        window.addEventListener('keydown', handleKeyInterruption, { passive: true });
        window.addEventListener('pointerdown', handleUserInterruption, { passive: true });
        document.addEventListener('visibilitychange', handleVisibilityChange);

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
            const containers = safeQuerySelectorAll<HTMLElement>(containerSelector);
            containers.forEach((el, index) => {
              const id = el.id || el.getAttribute('data-scroll-id') || `container_${index}`;
              const pos = saved.containers?.[id];
              if (pos) {
                try {
                  el.scrollTop = pos.top;
                  el.scrollLeft = pos.left;

                  // Check if container height allowed full restoration
                  if (pos.top > 0 && el.scrollHeight - el.clientHeight < pos.top - 2) {
                    allContainersSatisfied = false;
                  }
                } catch {}
              }
            });
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

        // RAF debouncing helper to prevent layout thrashing and ResizeObserver loop limit errors
        let rafPending = false;
        const scheduleRestore = () => {
          if (rafPending || isCancelled) return;
          rafPending = true;
          window.requestAnimationFrame(() => {
            rafPending = false;
            if (!isCancelled) {
              executeRestore();
            }
          });
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
                    scheduleRestore();
                  });
                  observer.observe(document.body, { childList: true, subtree: true });
                } catch {}
              }

              // Strategy B: ResizeObserver for container size expansion (de-bounced via RAF)
              if (typeof ResizeObserver !== 'undefined') {
                try {
                  resizeObserver = new ResizeObserver(() => {
                    scheduleRestore();
                  });
                  if (document.documentElement) {
                    resizeObserver.observe(document.documentElement);
                  }
                  const containers = safeQuerySelectorAll<HTMLElement>(containerSelector);
                  containers.forEach((c) => {
                    try {
                      resizeObserver?.observe(c);
                    } catch {}
                  });
                } catch {}
              }

              // Strategy C: Polling fallback for older mobile engines without ResizeObserver
              if (!resizeObserver && !observer) {
                let pollCount = 0;
                pollInterval = setInterval(() => {
                  executeRestore();
                  pollCount++;
                  if (pollCount > 10) {
                    if (pollInterval) {
                      clearInterval(pollInterval);
                      pollInterval = null;
                    }
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

      if (decodedHash || rawHash) {
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
              (document.getElementsByName(decodedHash)[0] as HTMLElement | undefined) ||
              (rawHash !== decodedHash ? document.getElementById(rawHash) : null) ||
              (rawHash !== decodedHash
                ? (document.getElementsByName(rawHash)[0] as HTMLElement | undefined)
                : null) ||
              document.querySelector(`[name="${safeCssEscape(decodedHash)}"]`) ||
              document.querySelector(`#${safeCssEscape(decodedHash)}`);
          } catch {
            target = document.getElementById(decodedHash) || document.getElementById(rawHash);
          }

          if (target) {
            // Check if inside custom scroll container
            let parentContainer: HTMLElement | null = null;
            try {
              parentContainer =
                typeof target.closest === 'function'
                  ? target.closest<HTMLElement>(containerSelector)
                  : null;
            } catch {}

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
                (window.pageYOffset || document.documentElement?.scrollTop || 0);
              const offsetPosition = Math.max(0, elementPosition - hashHeaderOffset);

              setWindowScroll(0, offsetPosition, {
                behavior: smoothHashScroll && !prefersReducedMotion ? 'smooth' : 'auto',
              });
            }

            // Accessibility: Focus target element for screen readers and keyboard users
            try {
              if (typeof target.focus === 'function' && document.activeElement !== target) {
                if (!target.hasAttribute('tabindex')) {
                  target.setAttribute('tabindex', '-1');
                }
                target.focus({ preventScroll: true });
              }
            } catch {}

            if (cancelActiveRestorationRef.current) {
              cancelActiveRestorationRef.current();
              cancelActiveRestorationRef.current = null;
            }
          } else if (attempts < maxAttempts) {
            attempts++;
            timeoutId = setTimeout(scrollToTarget, 32);
          }
        };

        timeoutId = setTimeout(scrollToTarget, 16);

        cancelActiveRestorationRef.current = () => {
          isCancelled = true;
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
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

      const containers = safeQuerySelectorAll<HTMLElement>(containerSelector);
      containers.forEach((el) => {
        try {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        } catch {}
      });
    }
  }, [
    location,
    navigationType,
    safeGetKey,
    preventScrollReset,
    restoreScrollPosition,
    shouldUpdateScroll,
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
