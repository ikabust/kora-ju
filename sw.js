const APP_VERSION = '1.4.0';
const CACHE_NAME = `oshi-screenshot-printer-v${APP_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  `./index.html?v=${APP_VERSION}`
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            key.startsWith('oshi-screenshot-printer-v') &&
            key !== CACHE_NAME
          )
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // HTMLは常にネットワークを優先して、更新を早く反映する。
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put('./index.html', copy);
            });
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // その他のファイルはキャッシュを利用し、なければネットワークから取得。
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
