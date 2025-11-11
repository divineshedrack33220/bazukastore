// Service Worker for Bazuka Store PWA
// ONLINE → no cache (network only)
// OFFLINE → serve from cache (if it exists)
// Still supports push notifications & hard-reload cache-clear

const CACHE_NAME = 'bazuka-v1';   // only used for cleanup & runtime cache

/* ------------------------------------------------------------------
   INSTALL – skip pre-caching (we cache on-the-fly)
------------------------------------------------------------------ */
self.addEventListener('install', (e) => {
  console.log('[SW] Install – no pre-cache');
  e.waitUntil(self.skipWaiting());
});

/* ------------------------------------------------------------------
   ACTIVATE – delete any old caches
------------------------------------------------------------------ */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(names => Promise.all(
      names.map(name => {
        if (name !== CACHE_NAME) {
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        }
      })
    )).then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------------
   FETCH – ONLINE = network only, OFFLINE = cache fallback
------------------------------------------------------------------ */
self.addEventListener('fetch', (e) => {
  const req = e.request;

  e.respondWith(
    // 1. Try network first
    fetch(req)
      .then(networkResponse => {
        // ---- ONLINE SUCCESS ----
        // Clone & store for *future* offline use
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return networkResponse;               // return fresh data
      })
      .catch(() => {
        // ---- OFFLINE / NETWORK FAILED ----
        // Look for a cached version
        return caches.match(req).then(cached => {
          if (cached) {
            console.log('[SW] Offline – serving cached:', req.url);
            return cached;
          }

          // No cache → show a graceful fallback
          if (req.destination === 'document') {
            return new Response(
              `<html><body style="font-family:Inter,sans-serif;text-align:center;padding:2rem;">
                 <h2>Offline</h2>
                 <p>Check your connection and try again.</p>
                 <img src="/images/offline-placeholder.jpg" style="max-width:200px;margin-top:1rem;">
               </body></html>`,
              { headers: { 'Content-Type': 'text/html' } }
            );
          }

          // API / JSON fallback
          return new Response(
            JSON.stringify({ offline: true, message: 'You are offline.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
  );
});

/* ------------------------------------------------------------------
   PUSH NOTIFICATIONS – unchanged
------------------------------------------------------------------ */
self.addEventListener('push', (e) => {
  let title = 'Bazuka Store Alert';
  let options = {
    body: 'New flash deal just dropped! Check it out.',
    icon: '/images/bazukastore.png',
    badge: '/images/bazukastore.png',
    vibrate: [100, 50, 100],
    data: { url: '/' },
    tag: 'bazuka-deal'
  };

  if (e.data) {
    const p = e.data.json();
    title = p.title || title;
    options.body = p.body || options.body;
    options.data.url = p.url || options.data.url;
    options.icon = p.icon || options.icon;
  }

  e.waitUntil(self.registration.showNotification(title, options));
});

/* ------------------------------------------------------------------
   NOTIFICATION CLICK – open correct page
------------------------------------------------------------------ */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if (client.url.includes(url) && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

/* ------------------------------------------------------------------
   MESSAGE – skipWaiting + optional hard-reload cache-clear
------------------------------------------------------------------ */
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }

  // Optional: wipe any leftover caches on hard reload
  if (e.data?.action === 'clearCache') {
    e.waitUntil(
      caches.keys().then(names => Promise.all(
        names.map(name => {
          console.log('[SW] Deleting stray cache:', name);
          return caches.delete(name);
        })
      )).then(() => {
        console.log('[SW] All caches cleared.');
        e.ports[0]?.postMessage({ status: 'cleared' });
      })
    );
  }
});
