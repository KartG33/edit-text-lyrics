const CACHE_NAME = 'edit-pwa-v1';
const APP_STATIC = ['/manifest.webmanifest', '/icons/edit-icon-192.png', '/icons/edit-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexResponse = await fetch('/');
    const indexMarkup = await indexResponse.clone().text();
    const assetUrls = [...indexMarkup.matchAll(/(?:src|href)="((?:\/assets\/|\/_next\/)[^\"]+)"/g)].map((match) => match[1]);

    await cache.put('/', indexResponse);
    await cache.addAll([...APP_STATIC, ...new Set(assetUrls)]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && event.request.url.startsWith(self.location.origin)) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
