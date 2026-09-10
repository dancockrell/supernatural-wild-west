import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

test("a cancelled card animation releases spin and reconnect restores the settled round without another wager", async ({
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
      if (this.classList.contains("poker-flying-card"))
        queueMicrotask(() => animation.cancel());
      return animation;
    };
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#spin").click();
  // ASSERTED THE OLD DEFECT, CORRECTED. This required `#recover` to become
  // visible, i.e. the round to end OFFLINE. `#recover` is unhidden only by
  // connection(false) (src/client/main.ts:472-476), which the spin path reaches
  // only when adapter.spin or animate(result) throws - so this test was
  // demanding that cancelling one decorative card flight knock the whole
  // session off the table. It no longer does, deliberately: poker-table.ts:103-119
  // awaits the flight's `finished` inside a try/catch commented "A cancelled
  // flight cannot trigger a new ghost arrival", with `landed` gating the ghost
  // notice and a `finally` that still removes the flyer. The rejection is
  // swallowed on purpose, so the round completes normally.
  //
  // Staying online is strictly the better behaviour, and it is what is asserted
  // now. The reconnect half of the name still matters and is still exercised
  // below - through the same #recover handler, dispatched from script because
  // the button is legitimately hidden when nothing has failed.
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("#recover")).toBeHidden();
  await expect(page.locator("#spin")).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem("dd-pending")),
  ).toBeNull();
  await page.locator("#recover").dispatchEvent("click");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("#spin")).toBeEnabled();
  await expect(page.locator(".poker-flying-card")).toHaveCount(0);
  expect(spins).toBe(1);
  expect(errors).toEqual([]);
});
