import { test, expect } from "@playwright/test";
test("casino autoplay setup, fixed wager, serial stop and no restart on refresh", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#settings").click();
  await page.locator("#autoplay-settings").click();
  await expect(page.locator("#auto-bonus")).toBeChecked();
  await page.locator("#auto-loss").fill("100");
  await page.locator("#auto-count").selectOption("10");
  await page.screenshot({ path: "docs/screenshots/autoplay-setup.png" });
  await page.locator("#auto-form button[type=submit]").click();
  await expect(page.locator("#autoplay")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#bet-up")).toBeDisabled();
  await page.locator("#autoplay").click();
  await expect(page.locator("#autoplay")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#round-label")).toContainText("00001");
  await page.waitForTimeout(1700);
  await expect(page.locator("#round-label")).toContainText("00001");
  await page.reload();
  await expect(page.locator("#autoplay")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#round-label")).toContainText("00001");
});

test("AUTO opens ready for 100 spins and unlimited loss", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#autoplay").click();
  await expect(page.locator("#auto-count")).toHaveValue("100");
  await expect(page.locator("#auto-loss")).toHaveValue("");
  await expect(page.locator("#auto-loss")).toHaveAttribute(
    "placeholder",
    "Unlimited",
  );
  await expect(page.locator("#round-label")).toContainText("00000");
  await page.locator("#auto-form button[type=submit]").click();
  await expect(page.locator("#autoplay")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#autoplay").click();
  await expect(page.locator("#round-label")).toContainText("00001");
});
