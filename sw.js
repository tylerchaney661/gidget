// Gidget Service Worker — v15 (network-first HTML + cache-first assets)
const CACHE_STATIC = 'gidget-static-v15';
const CACHE_HTML   = 'gidget-html-v15';

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
    for(const client of clients){ client.postMessage({ type:'SW_ACTIVATED', version:'v15' }); }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html');

  if (isHTML) {
    event.respondWith((async ()=>{
      try{
        const fresh = await fetch(req, { cache:'no-store' });
        const ch = await caches.open(CACHE_HTML);
        ch.put(req, fresh.clone());
        return fresh;
      }catch{
        const ch = await caches.open(CACHE_HTML);
        return (await ch.match(req)) || (await caches.match('./index.html')) || new Response('Offline', {status:503});
      }
    })());
  } else {
    event.respondWith((async ()=>{
      const cached = await caches.match(req); if (cached) return cached;
      try{
        const fresh = await fetch(req);
        const cs = await caches.open(CACHE_STATIC);
        cs.put(req, fresh.clone());
        return fresh;
      }catch{
        return (await caches.match('./index.html')) || new Response('Offline', {status:503});
      }
    })());
  }
});