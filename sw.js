// Service worker for offline use in the gym.
//
// The app shell is precached on install and refreshed network-first with a
// cache fallback for offline use. Anything else (provider API calls) goes
// straight to the network and is never cached — health data and OAuth
// responses must not be stored by the worker.

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

// Some static hosts (and `serve`, used by the E2E tests) answer "/page.html"
// with a redirect to "/page". A redirected response cannot be replayed for a
// navigation request — the browser aborts with a "redirected response" error —
// so rebuild it as a plain response before caching or returning it.
function unredirect(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // A single missing file must not break the whole install.
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL.map((url) =>
            fetch(url, { cache: "reload" }).then((response) =>
              response.ok ? cache.put(url, unredirect(response)) : null
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
        if (!response.ok || response.type !== "basic") throw new Error("Response not usable");

        const usable = unredirect(response);
        const copy = usable.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheUrl, copy);
        return usable;
      })
      .catch(() =>
        caches
          .match(cacheUrl)
          .then((cached) => cached || caches.match("./workout.html"))
          .then((cached) => cached || Response.error())
      )
  );
});
