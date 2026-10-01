const APP_VERSION = '1.4.5';

const CACHE_NAME = `oshi-screenshot-printer-${APP_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './icon-512.png',
  './icon-192.png',
  './favicon.png',
  './style.css',
  './script.js'
];


/* =========================
   インストール
========================= */

self.addEventListener('install', event => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())

  );

});


/* =========================
   有効化
========================= */

self.addEventListener('activate', event => {

  event.waitUntil(

    caches.keys()
      .then(keys => {

        return Promise.all(

          keys
            .filter(
              key =>
                key.startsWith('oshi-screenshot-printer-') &&
                key !== CACHE_NAME
            )
            .map(
              key =>
                caches.delete(key)
            )

        );

      })
      .then(() => self.clients.claim())

  );

});


/* =========================
   通信
========================= */

self.addEventListener('fetch', event => {

  const request = event.request;

  if(request.method !== 'GET'){

    return;

  }


  /*
    HTMLは必ずネットワーク優先。

    新しいindex.htmlがあれば
    それをそのまま返す。
  */

  if(
    request.mode === 'navigate' ||
    request.destination === 'document'
  ){

    event.respondWith(

      fetch(request, {
        cache: 'no-store'
      })

      .then(response => {

        const copy =
          response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {

            cache.put(
              './index.html',
              copy
            );

          });

        return response;

      })

      .catch(() => {

        return caches.match(
          './index.html'
        );

      })

    );

    return;

  }


  /*
    CSS / JS / 画像など
  */

  event.respondWith(

    caches.match(request)

      .then(cached => {

        if(cached){

          return cached;

        }


        return fetch(request)

          .then(response => {

            if(
              response &&
              response.ok
            ){

              const copy =
                response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {

                  cache.put(
                    request,
                    copy
                  );

                });

            }

            return response;

          });

      })

  );

});