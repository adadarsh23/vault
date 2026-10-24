/**
 * Browser-level mocks and polyfills for Vitest & jsdom test execution.
 */

export interface MockMediaQueryList extends MediaQueryList {
  _listeners: Set<(e: MediaQueryListEvent) => void>;
  _legacyListeners: Set<(mql: MediaQueryList) => void>;
}

const activeMediaQueries = new Map<string, Set<MockMediaQueryList>>();

/**
 * Simulates a media query state change (e.g. dark mode toggle or screen resize)
 * and invokes all registered listeners.
 */
export const setMatchMediaMatches = (query: string, matches: boolean): void => {
  const instances = activeMediaQueries.get(query);
  if (!instances) return;

  for (const mql of instances) {
    (mql as { matches: boolean }).matches = matches;
    const event = {
      matches,
      media: query,
    } as MediaQueryListEvent;

    if (typeof mql.onchange === 'function') {
      try {
        mql.onchange(event);
      } catch (err) {
        console.error('Error in matchMedia onchange listener:', err);
      }
    }

    for (const listener of mql._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in matchMedia change event listener:', err);
      }
    }

    for (const legacyListener of mql._legacyListeners) {
      try {
        legacyListener(mql);
      } catch (err) {
        console.error('Error in matchMedia legacy listener:', err);
      }
    }
  }
};

/**
 * Resets all active media query mocks.
 */
export const resetMatchMedia = (): void => {
  activeMediaQueries.clear();
};

let createdObjectUrls = new Set<string>();
let objectUrlCounter = 0;

/**
 * Resets tracked object URLs.
 */
export const resetMockObjectURLs = (): void => {
  createdObjectUrls.clear();
  objectUrlCounter = 0;
};

let clipboardTextBuffer = '';

/**
 * Resets mock clipboard content.
 */
export const resetMockClipboard = (): void => {
  clipboardTextBuffer = '';
};

/**
 * Installs browser polyfills (matchMedia, scroll, URL, clipboard, crypto).
 */
export const installBrowserMocks = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  // --- matchMedia Polyfill with full Event Listener support ---
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MockMediaQueryList => {
      const listeners = new Set<(e: MediaQueryListEvent) => void>();
      const legacyListeners = new Set<(mql: MediaQueryList) => void>();

      const mql: MockMediaQueryList = {
        matches: false,
        media: query,
        onchange: null,
        _listeners: listeners,
        _legacyListeners: legacyListeners,
        addListener: (
          listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null,
        ) => {
          if (typeof listener === 'function') {
            legacyListeners.add(listener as any);
          }
        },
        removeListener: (
          listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null,
        ) => {
          if (listener) {
            legacyListeners.delete(listener as any);
          }
        },
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
          if (type === 'change' && typeof listener === 'function') {
            listeners.add(listener as (e: MediaQueryListEvent) => void);
          }
        },
        removeEventListener: (
          type: string,
          listener: EventListenerOrEventListenerObject | null,
        ) => {
          if (type === 'change' && typeof listener === 'function') {
            listeners.delete(listener as (e: MediaQueryListEvent) => void);
          }
        },
        dispatchEvent: (event: Event): boolean => {
          if (mql.onchange) {
            mql.onchange(event as MediaQueryListEvent);
          }
          for (const listener of listeners) {
            listener(event as MediaQueryListEvent);
          }
          for (const legacyListener of legacyListeners) {
            legacyListener(mql);
          }
          return true;
        },
      };

      if (!activeMediaQueries.has(query)) {
        activeMediaQueries.set(query, new Set());
      }
      activeMediaQueries.get(query)!.add(mql);

      return mql;
    },
  });

  // --- Scrolling Polyfills ---
  const noopScroll = () => undefined;

  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: noopScroll,
  });

  Object.defineProperty(window, 'scroll', {
    configurable: true,
    writable: true,
    value: noopScroll,
  });

  Object.defineProperty(window, 'scrollBy', {
    configurable: true,
    writable: true,
    value: noopScroll,
  });

  if (typeof Element !== 'undefined') {
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
    Object.defineProperty(Element.prototype, 'scroll', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
    Object.defineProperty(Element.prototype, 'scrollBy', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
  }

  if (typeof HTMLElement !== 'undefined') {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
    Object.defineProperty(HTMLElement.prototype, 'scroll', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: noopScroll,
    });
  }

  // --- URL.createObjectURL & URL.revokeObjectURL ---
  if (
    typeof URL.createObjectURL !== 'function' ||
    !URL.createObjectURL.toString().includes('mock')
  ) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (_obj?: unknown): string => {
        objectUrlCounter += 1;
        const url = `blob:http://localhost:3000/mock-blob-${objectUrlCounter}`;
        createdObjectUrls.add(url);
        return url;
      },
    });
  }

  if (
    typeof URL.revokeObjectURL !== 'function' ||
    !URL.revokeObjectURL.toString().includes('mock')
  ) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: (url: string): void => {
        createdObjectUrls.delete(url);
      },
    });
  }

  // --- Clipboard API ---
  if (typeof navigator !== 'undefined') {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: {
          writeText: async (text: string): Promise<void> => {
            clipboardTextBuffer = String(text);
          },
          readText: async (): Promise<string> => {
            return clipboardTextBuffer;
          },
          write: async (): Promise<void> => undefined,
          read: async (): Promise<any[]> => [],
        },
      });
    } catch {
      // Ignore if clipboard property is non-configurable in some environments
    }
  }

  // --- Web Crypto API ---
  if (typeof window.crypto === 'undefined' && typeof globalThis.crypto !== 'undefined') {
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      writable: true,
      value: globalThis.crypto,
    });
  }
};
