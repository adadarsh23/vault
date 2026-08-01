(() => {
  const globalScope = window;

  if (typeof globalScope.__VITE_PRELOAD__ === "function") {
    return;
  }

  globalScope.__VITE_PRELOAD__ = (loader) => {
    if (typeof loader === "function") {
      return loader();
    }
    return Promise.resolve(loader);
  };
})();
