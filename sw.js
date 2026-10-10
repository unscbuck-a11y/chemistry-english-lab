const CACHE = 'chem-lab-v9-voice-cache-fix-20261010-3';
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icon.svg','./read-aloud-addon.js?v=voice-cache-fix-20261010-3','./tts-worker.js?v=kokoro20261010-worker2'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('chem-lab-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const scriptAsset = url.pathname.endsWith('/read-aloud-addon.js') || url.pathname.endsWith('/tts-worker.js') || url.pathname.endsWith('/index.html');
  if (scriptAsset) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    } catch (_) { return (await cache.match('./index.html')) || Response.error(); }
  }));
});
