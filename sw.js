// --- Gidget Service Worker (update-friendly) ---
const CACHE_STATIC = 'gidget-static-v6';
const CACHE_HTML   = 'gidget-html-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: precache static assets and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: remove old caches, take control, and notify pages
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_HTML].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', version: 'v5' });
      }
    })()
  );
});

// Fetch:
// - HTML/navigation -> network-first (falls back to cache)
// - everything else (same-origin GET) -> cache-first (falls back to network)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // For cross-origin requests, just let the network handle it
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  if (isHTML) {
    // HTML: network-first for fast updates
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(CACHE_HTML);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_HTML);
          const cached = await cache.match(req) || (await caches.match('./index.html'));
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
  } else {
    // Static assets: cache-first
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_STATIC);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const fallback = await caches.match('./index.html');
          return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
  }
});