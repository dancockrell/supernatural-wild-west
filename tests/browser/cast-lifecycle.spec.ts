import { test, expect, type Page } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

async function setup(page: Page) {
  const before = {
    ...initialState(),
    poker: { cards: [0, 1, 2, 3], bet: 100 },
  };
  const make = (
    state: typeof before | ReturnType<typeof initialState>,
    complete: boolean,
  ) => {
    for (let seed = 1; seed < 1000; seed++) {
      const r = resolveSpin(state, 100, new SeededRng(seed), `cast-${seed}`);
      if (
        !!r.poker?.complete === complete &&
        r.payout < 2000 &&
        !r.events.some((e) =>
          ["witching", "bonus-start", "awaken"].includes(e.type),
        )
      )
        return r;
    }
    throw new Error("No ordinary cast fixture");
  };
  const first = make(before, true),
    second = make(first.state, false);
  let calls = 0;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { state: before, lastResult: null } }),
  );
  await page.route("**/api/spin", (r) =>
    r.fulfill({ json: calls++ ? second : first }),
  );
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  return page.locator(".dealer-stage video");
}

test("a delayed previous-hand movie cannot replace idle during the next spin", async ({
  page,
}) => {
  let release!: () => void,
    requested = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/video/gambler-v1/{win,loss}.webm", async (route) => {
    requested = true;
    await held;
    await route.continue();
  });
  const dealer = await setup(page);
  try {
    await page.locator("#spin").click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator("#spin-label")).toHaveText("SPIN");
    await page.locator("#spin").click();
    release();
    await page.waitForTimeout(700);
    await expect(dealer).toHaveAttribute("data-performance", "idle");
    await expect(page.locator("#spin-label")).toHaveText("SPIN");
    await expect(dealer).toHaveAttribute("data-performance", "idle");
  } finally {
    release();
  }
});

test("reduced motion restores idle and does not resume an obsolete reaction", async ({
  page,
}) => {
  const dealer = await setup(page);
  await page.locator("#spin").click();
  await expect
    .poll(() => dealer.getAttribute("data-performance"))
    .not.toBe("idle");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(dealer).toHaveAttribute("data-performance", "idle");
  await expect
    .poll(() => dealer.evaluate((v) => (v as HTMLVideoElement).paused))
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(dealer).toHaveAttribute("data-performance", "idle");
  await expect
    .poll(() => dealer.evaluate((v) => !(v as HTMLVideoElement).paused))
    .toBe(true);
});

test("a playing reaction finishes across the next spin and media errors restore idle", async ({
  page,
}) => {
  const dealer = await setup(page);
  await page.locator("#spin").click();
  await expect
    .poll(() => dealer.getAttribute("data-performance"))
    .not.toBe("idle");
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  const reaction = await dealer.getAttribute("data-performance");
  await page.locator("#spin").click();
  await expect(dealer).toHaveAttribute("data-performance", reaction!);
  await dealer.evaluate((v) => v.dispatchEvent(new Event("error")));
  await expect(dealer).toHaveAttribute("data-performance", "idle");
  await expect
    .poll(() => dealer.evaluate((v) => !(v as HTMLVideoElement).paused))
    .toBe(true);
});
