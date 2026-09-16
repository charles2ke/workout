// Builds the static site into dist/.
// Used by the CI/deploy, release and mobile build workflows so that every
// pipeline packages exactly the same set of web assets.
import { copyFileSync, mkdirSync, rmSync } from "fs";

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
  "README.md",
  "LICENSE",
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of WEB_ASSETS) {
  copyFileSync(file, `dist/${file}`);
  console.log(`copied ${file}`);
}
