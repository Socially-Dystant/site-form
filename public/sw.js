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
const CACHE_VERSION = 'nren-offline-v2';

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
    // ignoreSearch is the fix: every real request to index.html carries
    // query params (siteId, queueId, technicianId, ...), but the precached
    // shell entry was stored under the bare URL with no query string.
    // Without ignoreSearch, caches.match() does an exact-URL match
    // (query string included) and misses every single real navigation to
    // the form, even though the file is sitting right there in the cache.
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          // Truly offline and this URL was never precached (e.g. a Site's
          // form opened for the first time with no signal at all - not the
          // expected flow, but shouldn't hard-crash). Returning a real
          // Response here - instead of the old code's already-undefined
          // "cached" variable - is what avoids the
          // "Failed to convert value to 'Response'" crash you hit.
          return new Response(
            'You are offline and this page has not been saved for offline use yet. Please reconnect and try again.',
            { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } }
          );
        });
    })
  );
});
