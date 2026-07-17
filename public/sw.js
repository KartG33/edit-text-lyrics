const CACHE_PREFIX = 'edit-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const OPTIONAL_ASSETS = ['/manifest.webmanifest', '/icons/edit-icon-192.png', '/icons/edit-icon-512.png'];

const cacheAsset = async (cache, url, optional = false) => {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`Failed to cache ${url}: ${response.status}`);
    await cache.put(url, response);
  } catch (error) {
    if (!optional) throw error;
    console.warn(`Optional offline asset was not cached: ${url}`, error);
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexResponse = await fetch('/');
    if (!indexResponse.ok) throw new Error(`Failed to cache application shell: ${indexResponse.status}`);
    const indexMarkup = await indexResponse.clone().text();
    const assetUrls = [...indexMarkup.matchAll(/(?:src|href)="((?:\/assets\/|\/_next\/)[^\"]+)"/g)].map((match) => match[1]);

    await cache.put('/', indexResponse);
    await Promise.all([...new Set(assetUrls)].map((url) => cacheAsset(cache, url)));
    await Promise.all(OPTIONAL_ASSETS.map((url) => cacheAsset(cache, url, true)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const outdatedCaches = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
    await Promise.all(outdatedCaches.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then(async (response) => {
      if (response.ok && event.request.url.startsWith(self.location.origin)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    })),
  );
});
