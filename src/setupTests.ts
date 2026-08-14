import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';

MotionGlobalConfig.skipAnimations = true;

const isBrowserTestEnv = typeof window !== 'undefined' && typeof document !== 'undefined';

const installTestPolyfills = () => {
  if (!isBrowserTestEnv) {
    return;
  }

  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    });
  }

  if (typeof window.scrollTo !== 'function') {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }

  if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }

  if (
    typeof window.ResizeObserver === 'undefined' &&
    typeof globalThis.ResizeObserver === 'undefined'
  ) {
    class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });
  }

  if (
    typeof window.IntersectionObserver === 'undefined' &&
    typeof globalThis.IntersectionObserver === 'undefined'
  ) {
    class IntersectionObserverMock {
      readonly root: Element | Document | null = null;
      readonly rootMargin = '';
      readonly thresholds: ReadonlyArray<number> = [];
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    });
  }

  if (typeof URL.createObjectURL !== 'function') {
    let objectUrlCounter = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => {
        objectUrlCounter += 1;
        return `blob:vitest-${objectUrlCounter}`;
      },
    });
  }

  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }

  if (
    typeof navigator !== 'undefined' &&
    (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function')
  ) {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => undefined,
          readText: async () => '',
        },
      });
    } catch {
      // Ignore if clipboard is non-configurable in this environment.
    }
  }

  if (typeof window.crypto === 'undefined' && typeof globalThis.crypto !== 'undefined') {
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      value: globalThis.crypto,
    });
  }
};

installTestPolyfills();

afterEach(() => {
  cleanup();

  if (!isBrowserTestEnv) {
    return;
  }

  window.localStorage.clear();
  window.sessionStorage.clear();
});
