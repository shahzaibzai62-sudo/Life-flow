const CACHE_NAME = 'lifeflow-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico'
];

// Install Event - Pre-cache the main shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching Core Shell Assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up any old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-First, with cache fallback
self.addEventListener('fetch', (event) => {
  // Only handle HTTP/HTTPS, skip other schemes (such as chrome-extension)
  if (!event.request.url.startsWith('http')) return;

  // Only handle GET requests for caching to avoid TypeError on POST/PUT
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Crucial Sandbox Preview Bypass: In AI Studio / preview environments, do not cache, intercept or handle fetches.
  // This prevents cookie, oauth, session, and stale page/blank access errors, and makes the worker self-unregister immediately
  const host = self.location.hostname;
  if (host.includes('ais-dev') || host.includes('ais-pre') || host.includes('localhost') || host.includes('127.0.0.1')) {
    self.registration.unregister().then(() => {
      console.log('[Service Worker] Auto-unregistering in sandbox/preview to prevent auth/stale page loops.');
    });
    // Do NOT intercept the request with event.respondWith.
    // This allows the browser to handle the request normally over the network with full credentials/cookies.
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If response is valid, clone and cache it dynamically
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network is unavailable
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If offline and request is for a document/page, return the cached index.html
          const acceptHeader = event.request.headers.get('accept');
          if (acceptHeader && acceptHeader.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

