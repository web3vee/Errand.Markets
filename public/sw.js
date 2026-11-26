/* Errand.markets service worker: offline fallback + web push. Kept tiny for slow networks. */
const CACHE = 'em-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first for page navigations; show the offline page only when the network is unreachable.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Errand.markets', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Errand.markets', {
    body: data.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: data.tag, data: { url: data.url || '/' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  // Only navigate within our own origin.
  const target = new URL(url, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if ('focus' in w && w.url === target.href) return w.focus();
    return self.clients.openWindow(target.href);
  }));
});
