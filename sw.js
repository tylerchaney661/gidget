// Gidget Service Worker — v17 (development passthrough + safe caching)
const CACHE_STATIC = 'gidget-static-v17';
const CACHE_HTML   = 'gidget-html-v17';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_STATIC).then((c)=>c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>![CACHE_STATIC, CACHE_HTML].includes(k)).map(k=>caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const client of clients) client.postMessage({ type:'SW_ACTIVATED', version:'v17' });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // If caller passes ?nosw=1, completely bypass SW for this request
  if (url.searchParams.get('nosw') === '1') {
    event.respondWith(fetch(req));
    return;
  }

  // For navigations (HTML), always try the network first with no-store to avoid stale index.html/JS
  if (event.request.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(async (fresh) => {
          // keep a copy for offline
          const ch = await caches.open(CACHE_HTML);
          ch.put(req, fresh.clone());
          return fresh;
        })
        .catch(async () => {
          // offline fallback to cached HTML or app shell
          const ch = await caches.open(CACHE_HTML);
          return (await ch.match(req)) || (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // For other GET requests, go network-first, cache on success, fallback to cache if offline
  event.respondWith(
    fetch(req)
      .then(async (fresh) => {
        const cs = await caches.open(CACHE_STATIC);
        cs.put(req, fresh.clone());
        return fresh;
      })
      .catch(async () => (await caches.match(req)) || new Response('Offline', { status: 503 }))
  );
});