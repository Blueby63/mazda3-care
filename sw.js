// Service worker: caches every app file so the app works fully offline.
// To ship an update: change VERSION. Phones pick it up the next time the app opens online.
const VERSION = 'v1.0.1';
const CACHE = `mazda3care-${VERSION}`;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/schedule.js', 'js/state.js', 'js/ui.js', 'js/util.js',
  'js/views/home.js', 'js/views/schedule.js', 'js/views/log.js', 'js/views/guide.js', 'js/views/more.js',
  'data/car.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache so a new version gets fresh files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mazda3care-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // online-only extras (NHTSA, Google) go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') return (await cache.match('index.html')) || fetch(req);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch (err) { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  })());
});
