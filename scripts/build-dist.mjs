// Builds the static site into dist/.
// Used by the CI/deploy, release and mobile build workflows so that every
// pipeline packages exactly the same set of web assets.
import { copyFileSync, mkdirSync, rmSync } from "fs";

const WEB_ASSETS = [
  "index.html",
  "workout.html",
  "workout.js",
  "fitness.html",
  "fitness.js",
  "README.md",
  "LICENSE",
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of WEB_ASSETS) {
  copyFileSync(file, `dist/${file}`);
  console.log(`copied ${file}`);
}
