// Service worker for offline use in the gym.
//
// The app shell is precached on install and refreshed network-first with a
// cache fallback for offline use. Anything else (provider API calls) goes
// straight to the network and is never cached — health data and OAuth
// responses must not be stored by the worker.

// Replaced with a content hash of the app shell by scripts/build-dist.mjs at
// build time, so a deploy with changed assets always gets a fresh cache and
// clients pick up the update instead of serving the stale shell forever.
const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `workout-shell-${CACHE_VERSION}`;

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
  "./sw-register.js",
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
    fetch(request)
      .then(async (response) => {
        if (!response.ok || response.redirected || response.type !== "basic") throw new Error("Response not cacheable");

        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheUrl, copy);
        return response;
      })
      .catch(() =>
        caches.match(cacheUrl).then((cached) => {
          if (cached) return cached;
          // Only navigations get a generic HTML fallback. Falling back to
          // workout.html for a missing script/stylesheet/manifest would make
          // the browser try to parse HTML as that asset and fail to render.
          if (request.mode === "navigate") return caches.match("./workout.html");
          return undefined;
        })
      )
  );
});
