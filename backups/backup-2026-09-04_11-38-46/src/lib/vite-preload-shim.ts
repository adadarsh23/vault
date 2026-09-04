/**
 * Vite Preload Global Shim
 * Ensures `__VITE_PRELOAD__` and `__vitePreload` are always safely defined in global scope
 * for dynamic imports and module preloading without triggering Content Security Policy (CSP)
 * violations from inline scripts.
 */

const globalScope: any =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : {};

const preloadFallback = (loader: unknown, _deps?: unknown) => {
  if (typeof loader === 'function') {
    return (loader as () => Promise<unknown>)();
  }
  return Promise.resolve(loader);
};

if (typeof globalScope.__VITE_PRELOAD__ !== 'function') {
  globalScope.__VITE_PRELOAD__ = preloadFallback;
}

if (typeof globalScope.__vitePreload !== 'function') {
  globalScope.__vitePreload = preloadFallback;
}

export {};
