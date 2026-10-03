// Service worker: rende l'app installabile e utilizzabile anche con rete lenta,
// e mostra le notifiche push ("ti penso", pause, chiamate).
const CACHE = 'coppia-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/app.js', 'js/store.js', 'js/tz.js',
  'js/config.js', 'vendor/firebase.js', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Prima la rete (così gli aggiornamenti arrivano subito), poi la cache se offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});

self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch { payload = { data: { body: e.data && e.data.text() } }; }
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Coppia';
  const kind = d.kind || 'info';
  e.waitUntil(self.registration.showNotification(title, {
    body: n.body || d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge.png',
    tag: kind === 'ping' ? 'ping-' + Date.now() : kind,
    vibrate: kind === 'ping' ? [120, 80, 120, 80, 300] : [200],
    data: { url: './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
