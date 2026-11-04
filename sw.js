/* Lattent offline support. Network first, so a deployed update is always picked up when
   online; every page and file the site serves is kept as it is fetched, and Studio's files are
   stored at install, so Studio opens and analyses data with no connection (for example on an
   instrument computer). Only this site's own files are cached: never API calls, payment or
   sign-in traffic, and never user data. */
const CACHE = 'lattent-v1';
const CORE = [
  'studio/', 'manifest.webmanifest', 'favicon.svg',
  'assets/css/bf.css', 'assets/css/studio.css',
  'assets/js/theme.js', 'assets/js/config.js', 'assets/js/stats.js', 'assets/js/models.js', 'assets/js/ml-features.js',
  'assets/models/shape-v1.js', 'assets/js/ml.js', 'assets/js/analysis.js', 'assets/js/plot.js', 'assets/js/shell.js',
  'assets/js/cloud.js', 'assets/js/samples.js', 'assets/js/learn.js', 'assets/js/formats.js', 'assets/js/chem.js',
  'assets/js/crystal.js', 'assets/js/discover.js', 'assets/js/studio.js', 'assets/js/learn-worker.js',
  'assets/js/gen-worker.js', 'assets/js/generate.js', 'assets/models/gen-v1.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lattent-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || (req.mode === 'navigate' ? caches.match(new URL('studio/', self.registration.scope).href) : undefined)).then(hit => hit || Response.error())));
});
