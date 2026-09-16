// Service worker for offline use in the gym.
//
// The app shell is precached on install and served cache-first, because it is
// a static site whose assets change only on deploy. Anything else (provider
// API calls) goes straight to the network and is never cached — health data
// and OAuth responses must not be stored by the worker.

const CACHE_NAME = "workout-shell-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./workout.html",
  "./fitness.html",
  "./styles.css",
  "./workout.css",
  "./fitness.css",
  "./common.js",
  "./workout-log.js",
  "./fitness-core.js",
  "./workout.js",
  "./fitness.js",
  "./manifest.webmanifest",
  "./icon.svg"
];
const APP_SHELL_URLS = new Set(
  APP_SHELL.map((path) => {
    const url = new URL(path, self.location.href);
    return `${url.origin}${url.pathname}`;
  })
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // A single missing file must not break the whole install. Redirected
      // responses are skipped: replaying one for a navigation request makes the
      // browser abort with a "redirected response" error.
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL.map((url) =>
            fetch(url, { cache: "reload" }).then((response) =>
              response.ok && !response.redirected ? cache.put(url, response) : null
            )
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const cacheUrl = `${url.origin}${url.pathname}`;
  if (!APP_SHELL_URLS.has(cacheUrl)) return;

  event.respondWith(
    caches.match(cacheUrl).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheUrl, copy));
          }
          return response;
        })
        .catch(() => caches.match("./workout.html"));
    })
  );
});
