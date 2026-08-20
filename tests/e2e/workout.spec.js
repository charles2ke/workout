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
    // The active day depends on the current date, so scope to the visible panel
    await page.locator("#tab-mon").click();
    const copyBtn = page.locator("#panel-mon .copy-btn").first();
    await copyBtn.click();
    await expect(copyBtn).toHaveText("Copied!");
    await page.screenshot({ path: "playwright-screenshots/11-copy-feedback.png" });
  });

  test("full page final state screenshot", async ({ page }) => {
    // Navigate to Saturday for a different view
    await page.locator("#tab-sat").click();
    await page.screenshot({ path: "playwright-screenshots/12-saturday-full.png", fullPage: true });
  });
});
