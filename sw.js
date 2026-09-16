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
  // Static hosts (and the `serve` dev server) redirect "/page.html" to the
  // extensionless "/page", so an installed app can be launched there. Precache
  // both spellings or an offline launch at the clean URL is never intercepted.
  "./workout",
  "./fitness",
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

// Replaying a redirected response for a navigation request makes the browser
// abort with a "redirected response" error, and some static hosts redirect
// "/page.html" to "/page". Copy the body into a fresh response so the redirect
// flag is cleared and the response stays usable for navigations.
function unredirect(response) {
  if (!response.redirected) return Promise.resolve(response);
  return response.blob().then((body) => {
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
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
              response.ok ? unredirect(response).then((clean) => cache.put(url, clean)) : null
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
.then((keys) => Promise.all(keys.filter((key) => key.startsWith("workout-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
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
        if (!response.ok || response.type !== "basic") throw new Error("Response not cacheable");

        const clean = await unredirect(response);
        const copy = clean.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheUrl, copy);
        return clean;
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
