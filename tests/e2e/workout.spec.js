// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Workout App", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/workout.html");
    await page.waitForLoadState("networkidle");
  });

  test("initial page loads with header and profile", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("7-Day Longevity");
    await expect(page.locator("#name-input")).toHaveValue("Tito");
    await expect(page.locator("#ethnicity-input")).toHaveValue("Indian");
    await page.screenshot({ path: "playwright-screenshots/01-initial-load.png", fullPage: true });
  });

  test("seven day tabs are rendered", async ({ page }) => {
    const tabs = page.locator(".tab-btn");
    await expect(tabs).toHaveCount(7);
    await page.screenshot({ path: "playwright-screenshots/02-day-tabs.png" });
  });

  test("switching to Wednesday tab shows Wednesday workout", async ({ page }) => {
    await page.locator("#tab-wed").click();
    await expect(page.locator("#panel-wed")).toBeVisible();
    await expect(page.locator("#panel-wed h2")).toContainText("Wednesday");
    await page.screenshot({ path: "playwright-screenshots/03-wednesday-tab.png", fullPage: true });
  });

  test("ethnicity dropdown has Indian selected by default and shows all options", async ({ page }) => {
    const select = page.locator("#ethnicity-input");
    await expect(select).toHaveValue("Indian");
    const options = select.locator("option");
    await expect(options).toHaveCount(12);
    await page.screenshot({ path: "playwright-screenshots/04-ethnicity-dropdown.png" });
  });

  test("changing ethnicity persists selection", async ({ page }) => {
    await page.locator("#ethnicity-input").selectOption("East Asian");
    await expect(page.locator("#ethnicity-input")).toHaveValue("East Asian");
    await page.screenshot({ path: "playwright-screenshots/05-ethnicity-changed.png" });
  });

  test("Reset button restores profile defaults", async ({ page }) => {
    await page.locator("#name-input").fill("Someone");
    await page.locator("#weight-input").fill("100");
    await page.locator("#ethnicity-input").selectOption("East Asian");
    await page.locator("#reset-profile-btn").click();
    await expect(page.locator("#name-input")).toHaveValue("Tito");
    await expect(page.locator("#weight-input")).toHaveValue("77");
    await expect(page.locator("#ethnicity-input")).toHaveValue("Indian");
    await page.screenshot({ path: "playwright-screenshots/06-profile-reset.png" });
  });

  test("hide notes toggle removes notes from exercise cards", async ({ page }) => {
    const toggle = page.locator("#toggle-notes");
    await toggle.uncheck();
    await expect(page.locator(".exercise-notes").first()).not.toBeVisible();
    await page.screenshot({ path: "playwright-screenshots/07-notes-hidden.png", fullPage: true });
  });

  test("skip navigation link is present and focuses main content on activation", async ({ page }) => {
    const skipLink = page.locator(".skip-link");
    await expect(skipLink).toBeAttached();
    // Verify it targets #workout-content
    await expect(skipLink).toHaveAttribute("href", "#workout-content");
    await page.screenshot({ path: "playwright-screenshots/08-skip-link.png" });
  });

  test("start timer counts down and shows completion message", async ({ page }) => {
    await page.locator("#rest-seconds").fill("5");
    await page.locator("#start-timer").click();
    await expect(page.locator("#timer-status")).toContainText("Running");
    await page.screenshot({ path: "playwright-screenshots/09-timer-running.png" });
    // Wait for the 5-second timer to complete (allow up to 8s)
    await expect(page.locator("#timer-status")).toContainText("Rest complete", { timeout: 8000 });
    await page.screenshot({ path: "playwright-screenshots/10-timer-complete.png" });
  });

  test("copy button shows Copied! feedback", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const copyBtn = page.locator(".day-section.active .copy-btn").first();
    await copyBtn.click();
    await expect(copyBtn).toHaveText("Copied!");
    await page.screenshot({ path: "playwright-screenshots/11-copy-feedback.png" });
  });

  test("exercise illustrations animate and can be toggled off", async ({ page }) => {
    const animated = page.locator(".day-section.active .svg-container svg [class^='anim-']").first();
    await expect(animated).toBeAttached();

    const runningName = await animated.evaluate((el) => getComputedStyle(el).animationName);
    expect(runningName).not.toBe("none");
    await page.screenshot({ path: "playwright-screenshots/13-exercise-animation.png", fullPage: true });

    await page.locator("#toggle-animation").uncheck();
    await expect(page.locator("#workout-content")).toHaveClass(/no-animation/);
    const stoppedName = await animated.evaluate((el) => getComputedStyle(el).animationName);
    expect(stoppedName).toBe("none");
    await page.screenshot({ path: "playwright-screenshots/14-animation-off.png", fullPage: true });
  });

  test("logging an exercise updates progress, streak and history", async ({ page }) => {
    const card = page.locator(".day-section.active .exercise-card").first();
    const dayId = await card.getAttribute("data-day-id");

    await card.locator("[data-log-field='done']").check();
    await card.locator("[data-log-field='sets']").fill("3");
    await card.locator("[data-log-field='reps']").fill("8");
    await card.locator("[data-log-field='weight']").fill("20");
    // Blur so the last field fires its change event.
    await page.locator("#history-heading").click();

    await expect(page.locator(`#progress-${dayId}`)).toContainText("Today: 1 of");
    await expect(page.locator("#streak-display")).toContainText("Current streak: 1 day(s)");
    await expect(page.locator(".history-item")).toHaveCount(1);
    await expect(page.locator("#history-empty")).toBeHidden();
    await page.screenshot({ path: "playwright-screenshots/15-exercise-logged.png", fullPage: true });

    const stored = await page.evaluate(() => localStorage.getItem("workoutLog"));
    expect(stored).toContain('"weight":20');
  });

  test("clearing today's log resets the cards and history", async ({ page }) => {
    const card = page.locator(".day-section.active .exercise-card").first();
    await card.locator("[data-log-field='done']").check();
    await expect(page.locator(".history-item")).toHaveCount(1);

    await page.locator("#clear-today-log").click();

    await expect(page.locator(".history-item")).toHaveCount(0);
    await expect(page.locator("#history-empty")).toBeVisible();
    await expect(page.locator("#clear-today-log")).toBeDisabled();
    await expect(page.locator(".day-section.active .exercise-card [data-log-field='done']").first()).not.toBeChecked();
    await page.screenshot({ path: "playwright-screenshots/16-log-cleared.png", fullPage: true });
  });

  test("a previous session is shown as the target to beat", async ({ page }) => {
    await page.evaluate(() => {
      const previous = new Date();
      previous.setDate(previous.getDate() - 1);
      const key = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
      const card = document.querySelector(".day-section.active .exercise-card");
      localStorage.setItem(
        "workoutLog",
        JSON.stringify({
          [key]: {
            dayId: card.dataset.dayId,
            entries: { [card.dataset.exerciseKey]: { done: true, sets: 3, reps: 8, weight: 20 } }
          }
        })
      );
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".day-section.active .log-last").first()).toContainText("Last time");
    await expect(page.locator(".day-section.active .log-last").first()).toContainText("3×8 @ 20 kg");
    await page.screenshot({ path: "playwright-screenshots/17-progression-target.png", fullPage: true });
  });

  test("the page is installable as a PWA", async ({ page }) => {
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");

    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    const body = await manifest.json();
    expect(body.name).toContain("7-Day");

    // Chromium's installability check needs raster candidates at 192 and 512.
    const sizes = body.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const src of ["/icon-192.png", "/icon-512.png"]) {
      const icon = await page.request.get(src);
      expect(icon.ok()).toBeTruthy();
    }
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "icon-192.png");

    const serviceWorker = await page.request.get("/sw.js");
    expect(serviceWorker.ok()).toBeTruthy();
  });

  test("an offline launch at the clean URL is served from the cache", async ({ page, context }) => {
    // The dev server redirects /workout.html to /workout, so an installed app
    // can be launched at the extensionless URL: it must be precached too.
    await page.goto("/workout");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("h1")).toContainText("7-Day Longevity");
      await page.screenshot({ path: "playwright-screenshots/18-offline-clean-url.png", fullPage: true });
    } finally {
      await context.setOffline(false);
    }
  });

  test("an offline launch of My Fitness serves the fitness page", async ({ page, context }) => {
    await page.goto("/fitness");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("h1")).toContainText("My Fitness");
      await page.screenshot({ path: "playwright-screenshots/19-offline-fitness.png", fullPage: true });
    } finally {
      await context.setOffline(false);
    }
  });

  test("background revalidation rejects captive portal shell responses", async ({ page, context }) => {
    await page.goto("/workout");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const cachedScript = await page.evaluate(async () => {
      const cacheName = (await caches.keys()).find((key) => key.startsWith("workout-shell-"));
      const response = await caches.match("/workout.js", { cacheName });
      return response ? response.text() : "";
    });
    expect(cachedScript).toContain("WORKOUT_DATA");

    let intercepted = false;
    await context.route("**/workout.js", (route) => {
      intercepted = true;
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!DOCTYPE html><title>Captive portal</title><p>Sign in to continue</p>"
      });
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(intercepted).toBeTruthy();

    const revalidatedScript = await page.evaluate(async () => {
      const cacheName = (await caches.keys()).find((key) => key.startsWith("workout-shell-"));
      const response = await caches.match("/workout.js", { cacheName });
      return response ? response.text() : "";
    });
    expect(revalidatedScript).toContain("WORKOUT_DATA");
    expect(revalidatedScript).not.toContain("Captive portal");
  });

  test("full page final state screenshot", async ({ page }) => {
    // Navigate to Saturday for a different view
    await page.locator("#tab-sat").click();
    await page.screenshot({ path: "playwright-screenshots/12-saturday-full.png", fullPage: true });
  });
});
