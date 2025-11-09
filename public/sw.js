// Service Worker for Bazuka Store PWA
// Caches static assets for offline; detects updates on deploy.

const CACHE_NAME = 'bazuka-v1'; // Bump version on major updates
const urlsToCache = [
  '/', // Main HTML
  '/index.html',
  'https://cdn.tailwindcss.com', // Tailwind (note: CDNs may vary; test caching)
  'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://unpkg.com/lucide@latest',
  '/images/bazukastore.png', // Add your key images
  '/images/bazukastore.png',
  '/images/bazukastore.png'
  // Add more static files as needed (e.g., other HTML pages)
];

// Install: Cache essentials
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching assets...');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of pages ASAP
  );
});

// Fetch: Serve from cache offline; network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache static assets
  if (urlsToCache.some(cachedUrl => event.request.url.includes(cachedUrl))) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((networkResponse) => {
          // Cache new responses
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
  } else if (url.origin === location.origin && url.pathname.startsWith('/api')) {
    // API: Network-first, fallback to offline message
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('Offline - Check your connection for deals!', { status: 503 });
      })
    );
  }
});

// NEW: Handle messages from main thread (e.g., skipWaiting on update tap)
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});