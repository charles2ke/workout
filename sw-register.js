// Registers the service worker so the site keeps working offline once visited.
// Kept in its own file because it is browser-only glue: there is nothing here
// that can run, or be tested, under jsdom.
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is a progressive enhancement; the app works without it.
    });
  });
}
