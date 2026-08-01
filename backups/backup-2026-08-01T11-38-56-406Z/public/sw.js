const CACHE_NAME = 'vault-runtime-v2';
const STATIC_PATH_PATTERN = /^\/(?:assets\/|favicon|site\.webmanifest|web-app-manifest-|apple-touch-icon|dashboard\.svg|key\.svg|plus\.svg|robots\.txt)/;
const BYPASS_PATH_PATTERN = /^\/(?:api|uploads|socket\.io|health|ready)(?:\/|$)/;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => (key === CACHE_NAME ? undefined : caches.delete(key))))
      ),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || request.headers.has('range')) {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (
    !isSameOrigin ||
    BYPASS_PATH_PATTERN.test(url.pathname) ||
    url.pathname === '/sw.js' ||
    url.pathname === '/sw-register.js'
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (!STATIC_PATH_PATTERN.test(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache).catch(() => undefined);
          });
        }

        return networkResponse;
      });
    })
  );
});
