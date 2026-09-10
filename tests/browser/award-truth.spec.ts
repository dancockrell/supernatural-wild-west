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

// RETARGETED AT THE LIVE CAST. Three of the five assertions here addressed
// nothing at all. `.duel-result` and `.poker-table[data-showdown]` are never
// applied - `git grep` finds both only in src/client/player-ui.css and in this
// file, and both measure 0 elements at runtime on `/` and `/?parlor=1`, before
// and after a spin, in the same sample where .poker-felt, .player-seat and
// .poker-award each read 1. `.dealer-stage` is the same: 0 elements, never
// written by any source file in any commit, so both
// `.dealer-stage video` assertions were vacuous by construction (an absent
// locator times out, which is exactly how this test failed). The orphaned
// player-ui.css rules for `.dealer-stage` and `.duel-result` are gone; the
// wider `.opponent-*` set is reported. The request sniffer was dead in the
// same way: no source in any commit fetches `/video/gambler-v1/...`, so
// `expect(reactions).toEqual([])` could not fail.
//
// The property in the name is real and unguarded. There is no seated opponent
// in this game and no gambler at all on `/` - the gambler is a parlor-only
// aside (`.narrative-gambler`, 0 on `/`) - so the cast that could wrongly
// celebrate is the two boundary residents, and BoundaryCast.react
// (src/client/boundary-cast.ts:105-113) enqueues nothing at payout 0. That is
// what this now measures, plus the fact that the award panel names the rank
// with no credit amount and the balance does not move. Both residents are
// counted first so a missing cast fails rather than agreeing.
test("a poker tie retains the resident cast idle instead of declaring a victory", async ({
  page,
}) => {
  const before = {
    ...initialState(),
    poker: { cards: [25, 24, 23, 22], bet: 100 },
  };
  const result = resolveSpin(before, 100, new SeededRng(6), "tied-showdown");
  expect(result.poker?.outcome).toBe("tie");
  expect(result.poker?.amount).toBe(0);
  expect(result.payout).toBe(0);
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { state: before, lastResult: null } }),
  );
  await page.route("**/api/spin", (r) => r.fulfill({ json: result }));
  // Record every film swapped into a porch as it happens. Polling
  // data-performance cannot see a branch that begins and ends between two
  // samples; ResidentSequence.present() removes the outgoing film and prepends
  // the incoming one, so a childList observer catches every cut.
  await page.addInitScript(() => {
    const log = window as unknown as { cuts: string[]; boundaries: string[] };
    log.cuts = [];
    log.boundaries = [];
    new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target as Element).closest?.(".ghost-porch")) continue;
        for (const node of record.addedNodes)
          if (node instanceof HTMLVideoElement)
            log.cuts.push(node.dataset.performance ?? "?");
      }
    }).observe(document, { childList: true, subtree: true });
    // `ended` does not bubble, but it still travels the capture phase, and it is
    // the exact moment a branch could be admitted. This is the denominator: no
    // boundary, no opportunity, and the reaction check below would be empty.
    document.addEventListener(
      "ended",
      (event) => {
        const film = event.target as HTMLElement;
        const porch = film.closest?.(".ghost-porch");
        if (porch) log.boundaries.push(porch.classList.contains("left") ? "left" : "right");
      },
      true,
    );
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  const idles = page.locator('.boundary-cast .ghost-porch [data-performance]');
  await expect(idles).toHaveCount(2);
  await page.locator("#spin").click();
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  // The hand completed and paid nothing: the rank is named, no credit figure is
  // attached to it, and #win stays flat.
  await expect(page.locator(".poker-award")).toHaveAttribute("data-amount", "0");
  await expect(page.locator(".poker-award")).toContainText(result.poker!.rank);
  await expect(page.locator(".poker-award strong")).toHaveCount(0);
  await expect(page.locator("#win")).toHaveText("0.00");
  // A branch can only be admitted at a native idle boundary
  // (CharacterSequence.idleBoundary), and queen-idle.webm runs 5.08s - so simply
  // waiting a second or two and finding no reaction proves nothing: no boundary
  // has happened, and the check could not fail. Measured by sabotage: with
  // BoundaryCast.react enqueueing the queen on every spin, a 1.5s version of
  // this test stayed green. So each idle is seeked to just before its own end
  // and both boundaries are waited for before anything is concluded.
  await idles.evaluateAll((films) =>
    films.forEach((film) => {
      const video = film as HTMLVideoElement;
      if (Number.isFinite(video.duration))
        video.currentTime = Math.max(0, video.duration - 0.12);
    }),
  );
  await expect
    .poll(
      () =>
        page.evaluate(() => [
          ...new Set((window as unknown as { boundaries: string[] }).boundaries),
        ].sort()),
      { timeout: 20000 },
    )
    .toEqual(["left", "right"]);
  const cuts = await page.evaluate(
    () => (window as unknown as { cuts: string[] }).cuts,
  );
  // A boundary was crossed in both porches (the wrap above) and neither took a
  // branch. Note that an idle following an idle produces no DOM cut at this
  // route - present() only swaps elements when the film changes, and `/` has no
  // alternate idles - so an empty log is the correct reading of "she kept
  // looping", and a branch is the only thing that can put an entry in it.
  expect(cuts, `porch cuts: ${JSON.stringify(cuts)}`).not.toContain("reaction");
  await expect(
    page.locator('.boundary-cast .ghost-porch [data-performance="reaction"]'),
  ).toHaveCount(0);
  await expect(idles).toHaveCount(2);
  expect(
    await idles.evaluateAll((v) =>
      v.map((e) => (e as HTMLElement).dataset.performance),
    ),
  ).toEqual(["idle", "idle"]);
  await expect(
    page.locator(".win-ribbon,.win-focus,.symbol.winning"),
  ).toHaveCount(0);
});
