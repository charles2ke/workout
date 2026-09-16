// Builds the static site into dist/.
// Used by the CI/deploy, release and mobile build workflows so that every
// pipeline packages exactly the same set of web assets.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";

const WEB_ASSETS = [
  "index.html",
  "styles.css",
  "workout.html",
  "workout.css",
  "workout.js",
  "fitness.html",
  "fitness.css",
  "fitness.js",
  "common.js",
  "workout-log.js",
  "fitness-core.js",
  "manifest.webmanifest",
  "sw.js",
  "sw-register.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "README.md",
  "LICENSE",
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of WEB_ASSETS) {
  copyFileSync(file, `dist/${file}`);
  console.log(`copied ${file}`);
}

// Give the service worker cache a name derived from the shipped assets so a
// deploy that changes any of them gets a fresh cache instead of clients
// serving the previous shell forever.
const hash = createHash("sha256");
for (const file of WEB_ASSETS) {
  hash.update(readFileSync(`dist/${file}`));
}
// 10 hex chars (40 bits) is ample to avoid accidental collisions between
// builds while keeping the cache name short and readable.
const cacheVersion = hash.digest("hex").slice(0, 10);
const swPath = "dist/sw.js";
const sw = readFileSync(swPath, "utf8");
if (!sw.includes("__CACHE_VERSION__")) {
  throw new Error("sw.js is missing the __CACHE_VERSION__ placeholder; cache-busting would not be applied.");
}
writeFileSync(swPath, sw.replace("__CACHE_VERSION__", cacheVersion));
console.log(`sw.js cache version: ${cacheVersion}`);
