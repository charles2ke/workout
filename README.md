# 7-Day Longevity & Strength Program

[![CI/CD Status](https://github.com/charles2ke/workout/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/charles2ke/workout/actions/workflows/deploy.yml)
[![Mobile Build](https://github.com/charles2ke/workout/actions/workflows/build-mobile.yml/badge.svg?branch=main)](https://github.com/charles2ke/workout/actions/workflows/build-mobile.yml)
[![GitHub Pages](https://img.shields.io/website?label=GitHub%20Pages&url=https%3A%2F%2Fcharles2ke.github.io%2Fworkout%2F)](https://charles2ke.github.io/workout/)

A lightweight, browser-only weekly workout planner. No frameworks, no build step — just HTML, CSS, and vanilla JavaScript served as a static site via GitHub Pages.

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
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

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

Every push or pull request to `main` triggers the following GitHub Actions jobs:

1. **HTML Lint** — runs `htmlhint` against all HTML files
2. **Jest Unit Tests** — runs the full test suite with coverage
3. **Playwright E2E Tests** — runs browser tests and uploads screenshots as an artifact; a bot comment on each PR links directly to the artifact
4. **Deploy to GitHub Pages** — deploys on merge to `main` (after lint + unit tests pass)
5. **Update README** — prepares the latest *Live Site* URL and *Last Deployed* timestamp after each successful deployment, uploads the patched README as an artifact, and attempts to open a documentation PR when repository rules allow it

## License

[MIT](LICENSE)
