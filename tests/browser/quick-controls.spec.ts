import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`quick mixer and location hints at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/");
    await expect(page.locator("#connection")).toContainText("CONNECTED");
    const jail = page.locator('[data-location="2"]');
    await jail.hover();
    await expect(page.locator("#location-tip")).toContainText(
      "Wilds stay locked",
    );
    await expect(page.locator("#modal")).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#location-tip")).toBeHidden();
    await jail.focus();
    await expect(page.locator("#location-tip")).toBeVisible();
    await page.locator(".quick-mixer summary").focus();
    await page.keyboard.press("Space");
    await page.locator("#quick-music").fill("12");
    await page.locator("#quick-effects").fill("35");
    await expect(page.locator("#quick-music-value")).toHaveText("12%");
    await expect(page.locator("#quick-effects-value")).toHaveText("35%");
    const box = await page.locator(".quick-mixer-panel").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `docs/screenshots/quick-sound-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(page.locator(".quick-mixer")).not.toHaveAttribute("open", "");
    await page.reload();
    await page.locator(".quick-mixer summary").click();
    await expect(page.locator("#quick-music")).toHaveValue("12");
    await expect(page.locator("#quick-effects")).toHaveValue("35");
    await page.locator("h1").click();
    await expect(page.locator(".quick-mixer")).not.toHaveAttribute("open", "");
    await expect(page.locator("#balance")).toHaveText("1,000.00");
  });
}
