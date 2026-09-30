import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

test("a cancelled card animation keeps the session connected and reload restores the settled round without another wager", async ({
  page,
}) => {
  const before = {
    ...initialState(),
    poker: { cards: [0, 1, 2, 3], bet: 100 },
  };
  const result = resolveSpin(
    before,
    100,
    new SeededRng(12),
    "cancelled-presentation",
  );
  expect(result.poker).toBeTruthy();
  let settled = false,
    spins = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        state: settled ? result.state : before,
        lastResult: settled ? result : null,
      },
    }),
  );
  await page.route("**/api/spin", (route) => {
    settled = true;
    spins++;
    return route.fulfill({ json: result });
  });
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains("poker-flying-card")) {
        document.documentElement.dataset.cancelledFlight = "true";
        queueMicrotask(() => animation.cancel());
      }
      return animation;
    };
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#spin").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-cancelled-flight",
    "true",
  );
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  expect(
    await page.evaluate(() => localStorage.getItem("dd-pending")),
  ).toBeNull();
  await page.reload();
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("#round-label")).toContainText("ROUND 00001");
  await expect(page.locator("#spin")).toBeEnabled();
  await expect(page.locator(".poker-flying-card")).toHaveCount(0);
  expect(spins).toBe(1);
  expect(errors).toEqual([]);
});
