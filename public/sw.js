/* BillWill service worker. Deliberately small:
 *  - makes the app installable and gives an offline fallback screen;
 *  - caches only same-origin static files (hashed /assets/*, icons);
 *  - never touches the API, Clerk, analytics or any non-GET request, so
 *    signed-in data and sign-in always come straight from the network.
 * Bump CACHE_VERSION to drop old caches. */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `billwill-static-${CACHE_VERSION}`;
const SHELL_CACHE = `billwill-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("billwill-") && k !== STATIC_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API, Clerk, analytics: network only

  // Page loads: always try the network first so a new deploy is never hidden
  // behind a stale index.html; show the offline page only when it fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Hashed build files never change, so cache-first is safe.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
