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
    // AIMED AT A COVERED POINT, CORRECTED. This was `page.locator("h1").click()`,
    // which Playwright resolves to the element's centre. The title is the full
    // width of <main> (measured at 1440: x=316 w=808, so centre x=720) and the
    // open mixer panel is a right-aligned 270px dropdown hanging below its
    // summary (measured x=677.6 to 947.6, y=55 to 222), so the centre of the h1
    // is underneath the panel and every retry logged
    // `div.quick-mixer-panel ... intercepts pointer events` until the 60s
    // timeout. A dropdown covering the page content beneath it is correct
    // behaviour, so the aim moved rather than the product: the property here is
    // that a pointerdown anywhere outside the mixer closes it
    // (quick-controls.ts:80-83), and the title's left end is outside it at both
    // widths. The hit test is asserted first so this can never pass by pressing
    // on nothing - which is the failure the old line actually had.
    const aim = { x: 8, y: 8 };
    expect(
      await page.locator("h1").evaluate((h1, at) => {
        const r = h1.getBoundingClientRect();
        return document.elementFromPoint(r.x + at.x, r.y + at.y)?.closest("h1") === h1;
      }, aim),
    ).toBe(true);
    await page.locator("h1").click({ position: aim });
    await expect(page.locator(".quick-mixer")).not.toHaveAttribute("open", "");
    await expect(page.locator("#balance")).toHaveText("1,000.00");
  });
}
