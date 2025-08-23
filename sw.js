// Gidget Service Worker — v22 (network-first HTML, safe caching)
const CACHE_STATIC = 'gidget-static-v22';
const CACHE_HTML   = 'gidget-html-v22';

const ASSETS = [
  './',
  './index.html',
  './style.css?v=22',
  './app.js?v=22',
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
    for (const client of clients) client.postMessage({ type:'SW_ACTIVATED', version:'v22' });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Per-request bypass
  if (url.searchParams.get('nosw') === '1') {
    event.respondWith(fetch(req));
    return;
  }

  // HTML: network-first
  if (event.request.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(async (fresh) => {
          const ch = await caches.open(CACHE_HTML);
          ch.put(req, fresh.clone());
          return fresh;
        })
        .catch(async () => {
          const ch = await caches.open(CACHE_HTML);
          return (await ch.match(req)) || (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Other GET: network-first, fallback to cache
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