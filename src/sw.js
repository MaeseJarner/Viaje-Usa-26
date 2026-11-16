// Service worker: la app funciona sin conexión. Responde siempre desde la caché y actualiza en segundo plano,
// así en carretera abre al instante aunque no haya cobertura; la versión nueva se ve en la siguiente apertura.
const CACHE = 'rt26-__VERSION__';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    const network = fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
        }
        return res;
      })
      .catch(() => null);
    e.waitUntil(network);
    e.respondWith(
      caches.match('./index.html').then((cached) => cached || network.then((r) => r || new Response('Sin conexión', { status: 503 })))
    );
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
