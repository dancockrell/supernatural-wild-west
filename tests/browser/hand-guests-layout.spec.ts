import { test, expect } from "@playwright/test";
for (const rank of ["Two pair", "Full house"])
  test(`native ${rank} guests leave player cards and controls clear`, async ({
    page,
  }) => {
    await page.goto("/?parlor=1");
    await expect(page.locator("#spin")).toBeEnabled();
    await page
      .locator(".player-play-space")
      .evaluate(
        (host, rank) =>
          host.dispatchEvent(new CustomEvent("hand-award", { detail: rank })),
        rank,
      );
    await expect(page.locator(".poker-guest.arrived")).toHaveCount(2);
    const cards = await page.locator(".poker-slot").evaluateAll((es) =>
      es.map((e) => {
        const b = e.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      }),
    );
    const controls = (await page.locator(".controls").boundingBox())!;
    const guests = await page.locator(".poker-guest").evaluateAll((es) =>
      es.map((e) => {
        const b = e.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      }),
    );
    for (const g of guests) {
      expect(g.bottom).toBeLessThanOrEqual(controls.y + 1);
      for (const c of cards)
        expect(
          g.right <= c.left ||
            g.left >= c.right ||
            g.top >= c.bottom ||
            g.bottom <= c.top,
        ).toBe(true);
    }
    await page.waitForTimeout(900);
    await page.screenshot({
      path: `docs/hand-guests-${rank.replace(" ", "-")}.png`,
    });
    await page.locator(".player-play-space").dispatchEvent("hand-reset");
    await expect(page.locator(".poker-guest")).toHaveCount(0);
  });
