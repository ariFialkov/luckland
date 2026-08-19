/* Luckland service worker — offline-first app shell.
   Bump CACHE_VERSION whenever files change to push an update. */

const CACHE_VERSION = 'luckland-v13';

const SHELL = [
  '.',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/main.js',
  'src/config.js',
  'src/rng.js',
  'src/state.js',
  'src/world.js',
  'src/sprites.js',
  'src/ui.js',
  'src/games.js',
  'src/concealers.js',
  'src/npcs.js',
  'src/lucklians.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-first with background refresh (stale-while-revalidate). */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
