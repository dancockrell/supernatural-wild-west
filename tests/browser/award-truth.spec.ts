import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

test("a partial return identifies matches without animated win celebration", async ({
  page,
}) => {
  const before = initialState();
  const result = resolveSpin(before, 100, new SeededRng(19), "partial-return");
  expect(result.payout).toBe(53);
  expect(result.wins.flatMap((w) => w.cells)).toEqual([0, 5, 10, 15]);
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { state: before, lastResult: null } }),
  );
  await page.route("**/api/spin", (r) => r.fulfill({ json: result }));
  await page.goto("/");
  await page.locator("#spin").click();
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  await expect(page.locator("#win")).toHaveText("0.53");
  await expect(page.locator(".symbol.matched")).toHaveCount(4);
  await expect(
    page.locator(".symbol.winning,.win-focus,.win-ribbon"),
  ).toHaveCount(0);
  const animations = await page
    .locator(".symbol.matched")
    .evaluateAll((cells) =>
      cells.flatMap((cell) =>
        cell
          .getAnimations({ subtree: true })
          .map((a) => (a as CSSAnimation).animationName || ""),
      ),
    );
  expect(animations).not.toContain("winning-breathe");
  expect(animations).not.toContain("relic-award");
});

test("a poker tie retains the dealer idle instead of declaring his victory", async ({
  page,
}) => {
  const before = {
    ...initialState(),
    poker: { cards: [25, 24, 23, 22], bet: 100 },
  };
  const result = resolveSpin(before, 100, new SeededRng(6), "tied-showdown");
  expect(result.poker?.outcome).toBe("tie");
  expect(result.payout).toBe(0);
  const reactions: string[] = [];
  page.on("request", (request) => {
    if (/gambler-v1\/(win|loss)\.webm/.test(request.url()))
      reactions.push(request.url());
  });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { state: before, lastResult: null } }),
  );
  await page.route("**/api/spin", (r) => r.fulfill({ json: result }));
  await page.goto("/");
  await page.locator("#spin").click();
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  await expect(page.locator(".duel-result")).toHaveText("TIE");
  await expect(page.locator(".poker-table")).toHaveAttribute(
    "data-showdown",
    "tie",
  );
  await expect(page.locator(".dealer-stage video")).toHaveAttribute(
    "data-performance",
    "idle",
  );
  await page.waitForTimeout(1200);
  expect(reactions).toEqual([]);
  await expect(page.locator(".dealer-stage video")).toHaveAttribute(
    "data-performance",
    "idle",
  );
});
