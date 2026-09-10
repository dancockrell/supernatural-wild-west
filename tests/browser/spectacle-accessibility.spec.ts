import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test("the spectacle overlay is keyboard-reachable, inerts the game behind it, and announces its outcome once", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "witch");
  const skip = page.locator("#skip-spectacle");
  await expect(skip).toBeFocused();
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await expect(page.locator("#spectacle-announce")).toHaveText(
    "WITCHING HOUR. 6 SPINS",
  );
  // Tab must not be able to leave the overlay into the inert game behind it.
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await skip.click();
  await expect(page.locator("#spectacle")).toBeHidden();
  await expect(page.locator(".shell")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#settings")).toBeFocused();
});

test("Escape skips the spectacle overlay", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "awaken-0");
  await expect(page.locator("#spectacle")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#spectacle")).toBeHidden();
  await expect(page.locator(".shell")).not.toHaveAttribute("inert", "");
});
