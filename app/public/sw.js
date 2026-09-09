// Clearmission Operations — service worker
//
// Scope: makes the app shell (HTML/JS/CSS/icons) available when offline so
// a page that was already visited can still load without a network
// connection. Deliberately does NOT cache /api/* responses — those are
// live business data (job orders, inventory, prices) where showing a stale
// cached response could be actively wrong (e.g. showing outdated stock
// levels). Offline *writes* (creating a job order while offline) are
// handled at the application layer by src/lib/offlineQueue.ts, which is a
// different, deliberate mechanism from this cache.

const CACHE_NAME = 'clearmission-shell-v1';
const SHELL_URLS = ['/', '/login', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {
      // Best-effort: if a shell URL 404s (e.g. during local dev before a page
      // exists yet), don't fail the whole install over it.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — always go to the network. If the network
  // is down, let the request fail naturally so the app's own offline
  // queue (a deliberate, tested mechanism) handles it, rather than this
  // service worker silently serving stale cached JSON.
  if (url.pathname.startsWith('/api/')) return;

  // Only handle same-origin GETs; POST/PATCH/DELETE always hit the network.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline and not cached — let the browser show its own offline error
      // Cache-first for instant loads when available, but always refresh the
      // cache in the background so the next offline visit has current content.
      return cached || network;
    })
  );
});
