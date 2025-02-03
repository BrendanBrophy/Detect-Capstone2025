// Service worker to cache resources and enable offline functionality
const CACHE_NAME = 'my-site-cache-v1';
const urlsToCache = [
  '/',
  '/styles.css',
  '/script.js',
  '/index.html',
  '/gps.html'
];

// Install event: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch event: serve cached content when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if available
        if (response) {
          return response;
        }
        
        // Otherwise, fetch from network
        return fetch(event.request)
          .catch(() => {
            // If both cache and network fail, show offline page
            return caches.match('/offline.html');
          });
      })
  );
});