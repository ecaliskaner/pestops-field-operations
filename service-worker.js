// Bump on every asset-manifest change so old caches are evicted.
// v5: Repellent rebrand (was Ladybug) + real Leaflet field map (live technician tracking).
// v6: stop intercepting cross-origin requests — see the fetch handler. The bump
// is load-bearing here rather than cosmetic: a browser that already installed
// v5 keeps running its fetch handler until the cache name changes.
const CACHE_NAME = 'repellent-operations-v6';

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

  const url = new URL(event.request.url);

  // Anything this origin does not serve is none of this worker's business, and
  // intercepting it is what broke the field map for every customer. A service
  // worker runs under the CSP of its own script response, and ours sends
  // connect-src 'self' + Supabase — so the fetch() below was refused for every
  // map tile before it reached the network, and the catch then answered the
  // tile <img> with index.html. An <img> handed a page of HTML fires onerror
  // with no HTTP status and no network entry to diagnose from, which reads
  // exactly like an unreachable tile host: two providers were blamed and
  // swapped before the worker was. The browser fetches cross-origin itself
  // under img-src, which already allows https:.
  if (url.origin !== self.location.origin) return;

  // Never cache state: it is mutable session data, not an asset.
  if (url.pathname.endsWith('/state.js') || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone).catch(() => {}));
      return response;
    }).catch(() => caches.match(event.request).then(cached => {
      if (cached) return cached;
      // The HTML shell answers a navigation and corrupts everything else. A
      // script or an image given a page of HTML fails to parse rather than
      // failing to load, turning a plain offline error into a silent one.
      return event.request.mode === 'navigate'
        ? caches.match('./index.html')
        : Response.error();
    }))
  );
});
