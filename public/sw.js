// Service worker for the NREN Offline Assessment app.
//
// This is what actually makes "return to the queue, then open the next
// form, with zero signal" work: without it, the browser has to re-fetch
// index.html/queue.html/app.js/etc. from the network every time the
// technician navigates, and that fails offline even though all the *data*
// (the cached queue, the localStorage draft) is already sitting on the
// device. Caching the app shell here means navigation between queue.html
// and index.html keeps working with no connection at all - only the
// initial queue fetch (/api/queue) and the final submit
// (/api/submit-assessment) ever need one.
//
// Bump CACHE_VERSION whenever one of the shell files below changes, so
// returning technicians pick up the new version instead of a stale cache.
const CACHE_VERSION = 'nren-offline-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'queue.html',
  'app.js',
  'queue.js',
  'style.css',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept API calls - they need to either really reach Salesforce
  // (via this app's own server) or really fail so the page's own
  // navigator.onLine / try-catch handling can fall back to local data.
  if (request.url.includes('/api/')) {
    return;
  }

  // Only handle same-origin GETs (the app shell). Cache-first, so the app
  // opens instantly and works offline; fall back to network for anything
  // not pre-cached (and quietly cache it for next time).
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
