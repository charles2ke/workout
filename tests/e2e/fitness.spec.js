// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("My Fitness page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fitness.html");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with both data sources disconnected", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("My Fitness");
    await expect(page.locator("#google-status")).toHaveText("Not connected.");
    await expect(page.locator("#garmin-status")).toHaveText("Not connected.");
    await expect(page.locator("#records-empty")).toBeVisible();
    await page.screenshot({ path: "playwright-screenshots/20-fitness-initial.png", fullPage: true });
  });

  test("loading Google Health sample data fills the dashboard", async ({ page }) => {
    await page.locator("#google-sample").click();
    await expect(page.locator("#google-status")).toContainText("Connected");
    await expect(page.locator("#records-body tr")).toHaveCount(7);
    await expect(page.locator("#records-empty")).toBeHidden();
    await page.screenshot({ path: "playwright-screenshots/21-fitness-google-sample.png", fullPage: true });
  });

  test("Garmin sample adds VO2 max and merges with Google rows", async ({ page }) => {
    await page.locator("#google-sample").click();
    await page.locator("#garmin-sample").click();
    await expect(page.locator("#records-body tr")).toHaveCount(14);
    await expect(page.locator("#records-body")).toContainText("Garmin");
    await expect(page.locator("#records-body")).toContainText("Google Health");
    await page.screenshot({ path: "playwright-screenshots/22-fitness-both-sources.png", fullPage: true });
  });

  test("imported Garmin CSV is parsed into records", async ({ page }) => {
    await page.locator("#garmin-file").setInputFiles({
      name: "garmin-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "calendarDate,totalSteps,restingHeartRate,sleepMinutes,activeKilocalories,vo2Max\n" +
          "2026-08-20,11000,52,450,720,47\n2026-08-19,9400,54,420,610,47\n"
      )
    });
    await expect(page.locator("#garmin-status")).toContainText("garmin-export.csv");
    await expect(page.locator("#records-body tr")).toHaveCount(2);
    await page.screenshot({ path: "playwright-screenshots/23-fitness-csv-import.png", fullPage: true });
  });

  test("invalid import shows an error message", async ({ page }) => {
    await page.locator("#google-file").setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{not json")
    });
    await expect(page.locator("#google-status")).toContainText("Import failed");
    await page.screenshot({ path: "playwright-screenshots/24-fitness-import-error.png", fullPage: true });
  });

  test("connection persists across reloads and disconnect clears it", async ({ page }) => {
    await page.locator("#garmin-sample").click();
    await page.reload();
    await expect(page.locator("#garmin-status")).toContainText("Connected");

    await page.locator("#garmin-disconnect").click();
    await expect(page.locator("#garmin-status")).toHaveText("Not connected.");
    await expect(page.locator("#records-empty")).toBeVisible();
    await page.screenshot({ path: "playwright-screenshots/25-fitness-disconnected.png", fullPage: true });
  });

  test("API connect requires a client ID and settings persist", async ({ page }) => {
    await page.locator("#google-connect").click();
    await expect(page.locator("#google-status")).toContainText("client ID");

    await page.locator("article:has(#garmin-client-id) .api-settings summary").click();
    await page.locator("#garmin-client-id").fill("demo-client-id");
    await page.locator("#garmin-client-id").blur();
    await page.locator("#garmin-client-secret").fill("demo-client-secret");
    await page.locator("#garmin-client-secret").blur();
    await page.reload();
    await page.locator("article:has(#garmin-client-id) .api-settings summary").click();
    await expect(page.locator("#garmin-client-id")).toHaveValue("demo-client-id");
    await expect(page.locator("#garmin-client-secret")).toHaveValue("demo-client-secret");
    await page.screenshot({ path: "playwright-screenshots/27-fitness-api-settings.png", fullPage: true });
  });

  test("sync now reports that the API is not connected", async ({ page }) => {
    await page.locator("#google-sync").click();
    await expect(page.locator("#google-status")).toContainText("Sync failed");
    await page.screenshot({ path: "playwright-screenshots/28-fitness-sync-error.png", fullPage: true });
  });

  test("navigation between workout and fitness pages works", async ({ page }) => {
    await page.locator('.page-nav a[href="workout.html"]').click();
    await expect(page.locator("h1")).toContainText("7-Day Longevity");
    await page.locator('.page-nav a[href="fitness.html"]').click();
    await expect(page.locator("h1")).toContainText("My Fitness");
    await page.screenshot({ path: "playwright-screenshots/26-fitness-navigation.png", fullPage: true });
  });
});
