const CACHE='chem-lab-v5';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.open(CACHE).then(cache=>cache.match(e.request)).then(r=>r||fetch(e.request).then(x=>{if(x.ok){const c=x.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return x;}).catch(()=>caches.open(CACHE).then(cache=>cache.match('./index.html'))))));
