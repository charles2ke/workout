// Service worker for offline use in the gym.
//
// The app shell is precached on install and then served cache-first, with a
// background revalidation that refreshes the cache for the next load. A flaky
// gym connection therefore never delays a reload. Anything else (provider API
// calls) goes straight to the network and is never cached — health data and
// OAuth responses must not be stored by the worker.

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
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];
// Static hosts (and the `serve` dev server) redirect "/page.html" to the
// extensionless "/page", so an installed app can be launched there. Precache
// both spellings or an offline launch at the clean URL is never intercepted.
// These are best-effort: hosts that only serve the ".html" spelling would
// otherwise fail every install.
const OPTIONAL_SHELL = ["./workout", "./fitness"];

// Offline navigations fall back to the document for the requested route, so
// "/fitness" never opens the workout page.
const NAVIGATION_FALLBACKS = [
  { match: /(^|\/)fitness(\.html)?$/, document: "./fitness.html" },
  { match: /(^|\/)workout(\.html)?$/, document: "./workout.html" }
];
const DEFAULT_FALLBACK = "./index.html";

const APP_SHELL_URLS = new Set(
  APP_SHELL.concat(OPTIONAL_SHELL).map((path) => {
    const url = new URL(path, self.location.href);
    return `${url.origin}${url.pathname}`;
  })
);
// Every APP_SHELL and OPTIONAL_SHELL URL must match a rule so new cached asset
// types choose their validation intentionally.
const SHELL_RESPONSE_RULES = [
  { match: /^fitness(\.html)?$/, type: "text/html", includes: "My Fitness" },
  { match: /^workout(\.html)?$/, type: "text/html", includes: "7-Day Longevity" },
  { match: /^(index\.html)?$/, type: "text/html", includes: "workout.html" },
  { match: /\.css$/, type: "text/css" },
  { match: /\.js$/, type: "javascript" },
  { match: /\.webmanifest$/, type: "json" },
  { match: /\.svg$/, type: "image/svg+xml" },
  { match: /\.png$/, type: "image/png" }
];

function fallbackDocumentFor(pathname) {
  const route = NAVIGATION_FALLBACKS.find(({ match }) => match.test(pathname));
  return route ? route.document : DEFAULT_FALLBACK;
}

function shellPathFor(url) {
  const scopePath = new URL("./", self.location.href).pathname;
  const { pathname } = new URL(url, self.location.href);
  return pathname.startsWith(scopePath) ? pathname.slice(scopePath.length) : null;
}

function shellResponseRule(url) {
  const shellPath = shellPathFor(url);
  return shellPath === null ? null : SHELL_RESPONSE_RULES.find(({ match }) => match.test(shellPath));
}

async function validateShellResponse(url, response, stage) {
  if (!response.ok || response.type !== "basic") throw new Error(`Failed during ${stage} of ${url}: ${response.status}`);
  const rule = shellResponseRule(url);
  if (!rule) throw new Error(`No shell validation rule during ${stage} of ${url}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes(rule.type)) throw new Error(`Unexpected content type during ${stage} of ${url}: ${contentType}`);
  if (rule.includes && !(await response.clone().text()).includes(rule.includes)) {
    throw new Error(`Unexpected shell content during ${stage} of ${url}`);
  }
}

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

function precache(cache, url) {
  return fetch(url, { cache: "reload" }).then((response) => {
    return validateShellResponse(url, response, "precache").then(() => response);
  }).then((response) => {
    return unredirect(response).then((clean) => cache.put(url, clean));
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // The required shell is cached atomically: if any of it fails the
        // install fails, the worker never activates and the previous complete
        // cache is left untouched. Only the optional clean-URL aliases are
        // allowed to fail.
        Promise.all(APP_SHELL.map((url) => precache(cache, url))).then(() =>
          Promise.allSettled(OPTIONAL_SHELL.map((url) => precache(cache, url)))
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

  // Cache-first: an installed shell renders immediately even on a captive or
  // very slow gym connection. The network copy is fetched in the background and
  // stored for the next load.
  const revalidate = fetch(request)
    .then(async (response) => {
      await validateShellResponse(cacheUrl, response, "revalidate");

      const clean = await unredirect(response);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheUrl, clean.clone());
      return clean;
    })
    .catch(() => undefined);

  event.respondWith(
    caches.match(cacheUrl).then(async (cached) => {
      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }

      const fresh = await revalidate;
      if (fresh) return fresh;
      // Only navigations get an HTML fallback, and it is the document for the
      // requested route. Falling back to a page for a missing
      // script/stylesheet/manifest would make the browser try to parse HTML as
      // that asset and fail to render.
      if (request.mode === "navigate") return caches.match(fallbackDocumentFor(url.pathname));
      return undefined;
    })
  );
});
