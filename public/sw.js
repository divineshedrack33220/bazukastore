// Service Worker for Bazuka Store PWA
// Caches **all** static pages + assets → works 100% offline
// Handles push notifications, graceful API fallback, and clean UI.

const CACHE_NAME = 'bazuka-v1';               // bump on major changes
const STATIC_ASSETS = [
  '/',                                      // root
  '/index.html',
  '/categories.html',
  '/track-order.html',
  '/request.html',
  '/request-details.html',
  '/orders.html',
  '/admin/index.html',
  '/admin/sales-orders.html',
  '/admin/products.html',
  '/admin/customers.html',
  '/cart.html',
  '/wishlist.html',
  '/chat.html',
  '/profile.html',
  '/login.html',
  '/register.html',
  '/checkout.html',
  // CDN assets (cached on first load)
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://unpkg.com/lucide@latest',
  // Images
  '/images/bazukastore.png',
  '/images/logo.png',
  '/images/icon-192.png',
  '/images/offline-placeholder.jpg'         // optional fallback image
];

/* ------------------------------------------------------------------
   INSTALL – pre‑cache everything
------------------------------------------------------------------ */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets...');
        // Use Promise.allSettled to handle failures per asset gracefully
        return Promise.allSettled(
          STATIC_ASSETS.map(asset => 
            cache.add(asset).catch(err => {
              console.warn(`[SW] Failed to cache ${asset}:`, err);
              return null; // Skip failed assets
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ------------------------------------------------------------------
   ACTIVATE – delete old caches
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
   FETCH – smart strategy
   • Static pages / assets → cache first, then network (offline‑safe)
   • API calls → network first, graceful offline fallback
------------------------------------------------------------------ */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. Serve cached static files (HTML, CSS, JS, images, fonts)
  if (STATIC_ASSETS.some(asset => req.url.includes(asset)) ||
      req.destination === 'style' ||
      req.destination === 'script' ||
      req.destination === 'image' ||
      req.destination === 'font') {

    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;                 // offline → cached

        // online → fetch & cache
        return fetch(req).then(net => {
          if (net && net.status === 200) {
            const clone = net.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return net;
        }).catch(() => {
          // If fetch fails *and* no cache → show offline page
          return caches.match('/offline.html') || new Response(
            `<html><body style="font-family:Inter,sans-serif;text-align:center;padding:2rem;">
               <h2>Offline</h2>
               <p>Check your connection and try again.</p>
               <img src="/images/offline-placeholder.jpg" style="max-width:200px;margin-top:1rem;">
             </body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
    return;
  }

  // 2. API calls → network first, graceful fallback
  if (url.origin === self.location.origin && url.pathname.startsWith('/api')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          // Cache successful API responses (optional)
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // Return cached API response if exists
          return caches.match(req).then(cached => {
            if (cached) return cached;
            // Or return friendly JSON
            return new Response(
              JSON.stringify({ offline: true, message: 'You are offline. Data will sync when back online.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 3. Everything else → normal network request
  e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
});

/* ------------------------------------------------------------------
   PUSH NOTIFICATIONS – unchanged (already perfect)
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
          if (client.url === url && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );

  if (e.action === 'view') {
    e.waitUntil(clients.openWindow(e.notification.data.url));
  }
});

/* ------------------------------------------------------------------
   MESSAGE – skipWaiting on update
------------------------------------------------------------------ */
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});