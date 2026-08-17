// Bump on every asset-manifest change so old caches are evicted.
// v4: Real Leaflet field map (live technician tracking).
const CACHE_NAME = 'ladybug-operations-v4';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './vendor/html5-qrcode.min.js',
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/fonts/inter-400.woff2',
  './vendor/fonts/inter-600.woff2',
  './vendor/fonts/inter-ext-400.woff2',
  './vendor/fonts/inter-ext-600.woff2',
  './src/app.js',
  './src/core/dom.js',
  './src/core/state.js',
  './src/core/auth.js',
  './src/data/seed.js',
  './src/data/catalog.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    // Individual failures must not abort the whole install.
    caches.open(CACHE_NAME).then(cache => Promise.allSettled(
      ASSETS.map(asset => cache.add(asset))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// Network-first with cache fallback.
//
// The previous cache-first strategy served stale modules indefinitely, which
// is indistinguishable from a broken build during development and risks
// demoing outdated code. Network-first keeps the offline story intact (the
// cache still answers when the network is gone) while guaranteeing that a
// reachable server always wins.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Never cache state: it is mutable session data, not an asset.
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('/state.js') || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone).catch(() => {}));
      return response;
    }).catch(() => caches.match(event.request).then(
      cached => cached || caches.match('./index.html')
    ))
  );
});
