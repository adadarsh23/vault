(() => {
  const globalScope = window;

  if (typeof globalScope.__VITE_PRELOAD__ !== 'function') {
    globalScope.__VITE_PRELOAD__ = (loader, _deps) => {
      if (typeof loader === 'function') {
        return loader();
      }
      return Promise.resolve(loader);
    };
  }
})();
