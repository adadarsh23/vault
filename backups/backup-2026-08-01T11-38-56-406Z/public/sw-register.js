if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Registration is owned by the React app so old HTML cannot double-register.
  });
}
