(() => {
  const globalScope =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : typeof self !== 'undefined'
          ? self
          : {};

  const preloadFallback = (loader, _deps) => {
    if (typeof loader === 'function') {
      return loader();
    }
    return Promise.resolve(loader);
  };

  if (typeof globalScope.__VITE_PRELOAD__ !== 'function') {
    globalScope.__VITE_PRELOAD__ = preloadFallback;
  }
  if (typeof globalScope.__vitePreload !== 'function') {
    globalScope.__vitePreload = preloadFallback;
  }
})();
