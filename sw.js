/* Bump this on every deploy so installed clients re-run install() and
   drop the stale cached app JS (Cache-First SW never revalidates assets). */
const CACHE_NAME = 'duty-app-v12';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './modules/utils.js',
  './modules/roster.js',
  './modules/storage.js',
  './modules/rosters.js',
  './modules/alerts.js',
  './modules/swaps.js',
  './modules/rendering.js',
  './modules/modals.js',
  './modules/print.js',
  './modules/roster-data.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS).catch((err) => console.warn('SW cache addAll partial failure:', err)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;

  /* Roster store reads must always hit the network (Cache-First would serve a stale
     GitHub listing / raw roster JSON forever, so new months would never appear). */
  const host = (request.url && /^https?:\/\//.test(request.url) ? new URL(request.url).hostname : '');
  if (host === 'api.github.com' || host === 'raw.githubusercontent.com') {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = event.notification.data && event.notification.data.url ? event.notification.data.url : './index.html';
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});