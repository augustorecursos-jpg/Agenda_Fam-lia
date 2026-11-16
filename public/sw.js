// Service worker: guarda a "casca" do app para abrir rápido e sem internet.
// Os compromissos (/api) sempre vêm do servidor; sem conexão o app usa a cópia salva no aparelho.
const VERSAO = 'agenda-v3';
const CASCA = [
  '/', '/css/app.css', '/js/app.js', '/js/compras.js', '/manifest.webmanifest',
  '/icons/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
  '/fonts/montserrat-latin-400-normal.woff', '/fonts/montserrat-latin-700-normal.woff', '/fonts/montserrat-latin-800-normal.woff',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Rede primeiro (pega as atualizações), cache se estiver sem internet.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});
