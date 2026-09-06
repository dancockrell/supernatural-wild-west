import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test("Ride waits for a cold video before starting its crossing", async ({
  page,
}) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/video/rider-gallop-v5.webm", async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "ride");
  await page.waitForTimeout(3600);
  await expect(page.locator("#spectacle")).toBeVisible();
  await expect(page.locator(".spectral-rider")).not.toHaveClass(/riding/);
  release();
  await expect(page.locator(".spectral-rider")).toHaveClass(/riding/);
  const video = page.locator(".spectral-rider video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.5);
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("#balance")).toHaveText("1,000.00");
});
