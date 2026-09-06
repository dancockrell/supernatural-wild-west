import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test.use({ video: "on" });
for (const width of [1440, 390]) {
  test(`complete feature performance review at ${width}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/");
    await expect(page.locator("#connection")).toContainText("CONNECTED");
    for (const kind of [
      "witch",
      "awaken-0",
      "awaken-1",
      "awaken-2",
      "awaken-3",
      "awaken-4",
      "fortune",
      "noon",
      "ride",
    ]) {
      if (kind === "fortune") {
        await page.evaluate(() => {
          const node = document.querySelector<HTMLElement>("#spectacle-copy")!;
          node.dataset.observedAmounts = "";
          new MutationObserver(() => {
            node.dataset.observedAmounts += `|${node.textContent}`;
          }).observe(node, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        });
      }
      await preview(page, kind);
      await page.waitForTimeout(kind === "noon" ? 650 : 1200);
      const caption = await page.locator(".spectacle-card").boundingBox();
      const controls = await page.locator(".controls").boundingBox();
      expect(caption!.y + caption!.height).toBeLessThanOrEqual(controls!.y);
      await page.screenshot({
        path: `docs/screenshots/review-${kind}-${width}.png`,
      });
      if (kind === "fortune") {
        await page.waitForTimeout(900);
        const observed = (await page
          .locator("#spectacle-copy")
          .getAttribute("data-observed-amounts"))!
          .split("|")
          .filter(Boolean);
        expect(new Set(observed).size).toBeGreaterThan(2);
        const gallery = await (
          await page.request.get("/api/feature-gallery")
        ).json();
        const expected =
          (gallery.examples.fortune.payout / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) + " CR";
        await expect(page.locator("#spectacle-copy")).toHaveText(expected);
      }
      await expect(page.locator("#spectacle")).toBeHidden({ timeout: 7000 });
      await expect(page.locator("#balance")).toHaveText("1,000.00");
      await expect(page.locator("#spin")).toBeEnabled();
      await expect(page.locator("#modal")).not.toBeVisible();
    }
  });
}
