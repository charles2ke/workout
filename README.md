# 7-Day Longevity & Strength Program

[![CI/CD Status](https://github.com/charles2ke/workout/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/charles2ke/workout/actions/workflows/deploy.yml)
[![Mobile Build](https://github.com/charles2ke/workout/actions/workflows/build-mobile.yml/badge.svg?branch=main)](https://github.com/charles2ke/workout/actions/workflows/build-mobile.yml)
[![GitHub Pages](https://img.shields.io/website?label=GitHub%20Pages&url=https%3A%2F%2Fcharles2ke.github.io%2Fworkout%2F)](https://charles2ke.github.io/workout/)

A lightweight, browser-only weekly workout planner. No frameworks, no bundler — just HTML, CSS, and vanilla JavaScript served as a static site via GitHub Pages, and packaged for Android, iOS/iPadOS, watchOS, and Garmin watches on every release.

## Live Site

<!-- PAGES_URL_START -->
[https://charles2ke.github.io/workout/](https://charles2ke.github.io/workout/)
<!-- PAGES_URL_END -->

## Last Deployed

<!-- LAST_DEPLOYED_START -->
2026-08-21 08:04 UTC
<!-- LAST_DEPLOYED_END -->

## Pages

- **Workout Program** (`workout.html`) — the 7-day training plan
- **My Fitness** (`fitness.html`) — health dashboard that pulls in Google Health and Garmin data

## Features

### Workout program

- **7-day program** — structured daily workouts covering upper body push/pull, lower body, active recovery, hypertrophy, posterior chain, full-body conditioning, and rest
- **Exercise cards** — each card shows sets/reps, difficulty, coaching notes, and an inline SVG illustration
- **Rest timer** — configurable countdown timer with an audio notification tone when rest is complete
- **Editable profile** — inline fields for name, age, ethnicity, height, and weight, persisted in `localStorage`
- **Display toggles** — show/hide exercise notes and difficulty labels
- **Copy to clipboard** — one-click copy of exercise details for sharing
- **Keyboard navigation** — full arrow-key support on the day tabs (ARIA tablist pattern)
- **Accessibility** — skip link, ARIA roles, live regions, and focus-visible styles throughout
- **Responsive** — mobile-first layout with a print stylesheet

### My Fitness

- **Google Health source** — import a Google Health Connect / Google Fit export (JSON or CSV) to pull in steps, resting heart rate, sleep, and active calories
- **Garmin source** — import a Garmin Connect export (JSON or CSV), including VO2 max when present
- **Sample data** — one-click sample data per source to preview the dashboard
- **Summary metrics** — days tracked, average steps, average resting heart rate, average sleep, total active calories, and latest VO2 max
- **Daily records table** — merged, newest-first view of the 30 most recent days across both sources
- **Local only** — files are parsed in the browser and connections persist in `localStorage`; no data leaves the device

## Tech Stack

| Layer | Tool |
|---|---|
| UI | Vanilla HTML / CSS / JavaScript (ES2020) |
| Unit tests | [Jest](https://jestjs.io/) + jsdom |
| E2E tests | [Playwright](https://playwright.dev/) (Chromium) |
| Native shells | [Capacitor 7](https://capacitorjs.com/) (Android, iOS/iPadOS), SwiftUI (watchOS), Monkey C (Garmin Connect IQ) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

## Project Structure

```
index.html         redirect to workout.html
workout.html/.js   7-day training program
fitness.html/.js   health dashboard
scripts/           build-dist.mjs, Android/iOS build helpers
tests/e2e/         Playwright specs
garmin/            Connect IQ app (Monkey C)
watchos/           watchOS companion app (SwiftUI + XcodeGen)
.github/workflows/ CI, release and mobile build pipelines
```

## Getting Started

### Prerequisites

- Node.js 20+

### Install dependencies

```bash
npm install
```

### Run locally

```bash
npm run serve
```

Then open `http://localhost:8080` in your browser. The app redirects from `index.html` to `workout.html` automatically.

### Build the static site

```bash
npm run build
```

Copies the web assets into `dist/`. The CI, release and mobile build pipelines all use this
script, so `dist/` is the single source of truth for what gets packaged and shipped.

## Testing

### Unit tests (Jest)

```bash
npm test
```

### Unit tests with coverage

```bash
npm run test:coverage
```

### End-to-end tests (Playwright)

```bash
npx playwright install chromium --with-deps   # first time only
npm run test:e2e
```

Playwright screenshots are saved to `playwright-screenshots/` and uploaded as a CI artifact on every pull request.

## CI / CD

Every push or pull request to `main` runs `.github/workflows/deploy.yml`:

1. **HTML Lint** — runs `htmlhint` against all HTML files
2. **Unit & E2E Tests** — Jest with coverage, then Playwright, uploading the screenshots and HTML report as artifacts
3. **Post Playwright screenshots** — comments on the pull request with a link to the screenshot artifact
4. **Deploy to GitHub Pages** — deploys on push to `main` (after lint + tests pass)
5. **Package Site** — runs `npm run build` and uploads `dist/` as the `workout-site` artifact

Two other workflows complete the pipeline:

- **Auto-create Pull Request** (`auto-pr.yml`) — opens a draft PR for any pushed branch that doesn't already have one
- **Release** (`release.yml`) — on a `v*` tag, re-runs the tests, builds the site zip and publishes a GitHub Release

## Native Apps

Publishing a GitHub Release triggers `build-mobile.yml`, which packages the same `dist/` output for
every supported platform and attaches the artifacts to the release:

| Platform | Output | Notes |
|---|---|---|
| Android / Android Auto | `.apk` + `.aab` | Capacitor shell; an unsigned debug APK is always produced, a signed APK/AAB when the Android signing secrets are set |
| iOS / iPadOS | `.ipa` | Capacitor shell; a simulator build always runs, an IPA is archived when the Apple signing secrets are set |
| watchOS | Simulator build | SwiftUI app in `watchos/`, project generated with XcodeGen |
| Garmin Connect IQ | `.prg` per device | Monkey C app in `garmin/`; the whole job is skipped unless `CIQ_SDK_URL` is configured |

All signing credentials are optional GitHub Actions secrets — the workflow header in
`.github/workflows/build-mobile.yml` documents each one.

## License

[MIT](LICENSE)
