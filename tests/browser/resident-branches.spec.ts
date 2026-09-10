import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

test("a resident waits for her native idle boundary, retains the branch across spins, and returns to moving idle", async ({
  page,
}) => {
  const before = initialState();
  // STALE FIXTURE, CORRECTED. This used seed 100 and asserted payout 576, which
  // was a resident-worthy win when the test was written (c760855 enqueued the
  // queen at payout >= bet * 5). 5bfda18 raised that to `excellent`, payout >=
  // bet * 10 - see BoundaryCast.react in src/client/boundary-cast.ts:107-111 -
  // and the engine has since drifted that seed to 585, 5.85x. So the spin this
  // test fed the client had stopped being one she reacts to at all, and every
  // assertion past the payout line was unreachable. Seed 243 pays 4683 on a 100
  // bet, 46.8x, which is over both that threshold and the bet * 20 that shows a
  // BIG WIN spectacle - and the spectacle matters to this test: BoundaryCast's
  // allowBranch is `spectacle.hidden !== false`, so it holds her branch shut
  // until the card clears, which is what puts her reaction on the far side of
  // both spins where the name of this test says it belongs. The guard below is
  // the property the product actually branches on rather than a magic number,
  // so engine retuning cannot quietly disarm it again.
  const first = resolveSpin(before, 100, new SeededRng(243), "resident-award");
  const second = resolveSpin(
    first.state,
    100,
    new SeededRng(19),
    "resident-next",
  );
  expect(first.payout).toBeGreaterThanOrEqual(first.bet * 10);
  let count = 0;
  await page.addInitScript(() => {
    const upload = WebGLRenderingContext.prototype.texImage2D;
    WebGLRenderingContext.prototype.texImage2D = function (
      this: WebGLRenderingContext,
      ...args: unknown[]
    ) {
      const source = args[5];
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.id === "frontier" &&
        source instanceof HTMLVideoElement
      ) {
        (window as unknown as { frontierMovieTime: number }).frontierMovieTime =
          source.currentTime;
      }
      return Reflect.apply(upload, this, args);
    };
    // Record every cut in the left resident's slot as it happens. Polling
    // data-performance cannot see this: her reaction is 4.042s long and starts
    // at whichever native boundary comes first, so between the spin and the
    // next assertion the whole branch can begin AND finish, leaving the
    // attribute reading "idle" both before and after with nothing in between.
    // That is the product behaving correctly and the test unable to see it.
    // ResidentSequence.present() removes the played-out film and prepends the
    // next one, so a childList observer catches the exact handoff, and the
    // removed element still carries the currentTime/duration that prove she
    // waited for her own boundary instead of cutting mid-film.
    (window as unknown as { queenCuts: unknown[] }).queenCuts = [];
    new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target as Element).closest?.(".ghost-porch.left")) continue;
        const film = (nodes: NodeList) =>
          [...nodes].filter(
            (node): node is HTMLVideoElement =>
              node instanceof HTMLVideoElement,
          );
        for (const video of film(record.removedNodes))
          (window as unknown as { queenCuts: unknown[] }).queenCuts.push({
            kind: "removed",
            src: video.src,
            performance: video.dataset.performance,
            currentTime: video.currentTime,
            duration: video.duration,
            ended: video.ended,
          });
        for (const video of film(record.addedNodes))
          (window as unknown as { queenCuts: unknown[] }).queenCuts.push({
            kind: "added",
            src: video.src,
            performance: video.dataset.performance,
          });
      }
    }).observe(document, { childList: true, subtree: true });

  });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { state: before, lastResult: null } }),
  );
  await page.route("**/api/spin", (r) =>
    r.fulfill({ json: count++ ? second : first }),
  );
  await page.goto("/");
  const queen = page.locator(".ghost-porch.left video");
  await expect
    .poll(() => queen.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await queen.evaluate((v) => {
    (v as HTMLVideoElement).currentTime = 0.1;
  });
  const idle = await queen.elementHandle();
  await expect(queen).toHaveAttribute("data-performance", "idle");
  expect(await queen.evaluate((v) => (v as HTMLVideoElement).loop)).toBe(false);
  // The mark goes into the same log as the cuts, so "she still had the branch
  // after the second spin" is a comparison of positions in one record rather
  // than of two separately sampled moments. The generous label timeout is the
  // BIG WIN card: it holds the round open for about 5.7s.
  const spin = async (mark: string) => {
    await page.locator("#spin").click();
    await expect(page.locator("#spin-label")).toHaveText("SPIN", {
      timeout: 25000,
    });
    await page.evaluate(
      (kind) =>
        (window as unknown as { queenCuts: unknown[] }).queenCuts.push({ kind }),
      mark,
    );
  };
  await spin("spin-1");
  await expect(queen).toHaveAttribute("data-performance", "idle");
  await spin("spin-2");
  await expect(queen).toHaveAttribute("data-performance", "idle");
  const sky = () =>
    page.evaluate(
      () =>
        (window as unknown as { frontierMovieTime: number }).frontierMovieTime,
    );
  type Cut = {
    kind: "added" | "removed" | "spin-1" | "spin-2";
    src: string;
    performance?: string;
    currentTime?: number;
    duration?: number;
  };
  const cuts = () =>
    page.evaluate(
      () => (window as unknown as { queenCuts: Cut[] }).queenCuts,
    ) as Promise<Cut[]>;
  await expect
    .poll(async () => (await cuts()).some((cut) => cut.kind === "added" && cut.performance === "reaction"), {
      timeout: 16000,
    })
    .toBe(true);
  const log = await cuts();
  const reaction = log.findIndex(
    (cut) => cut.kind === "added" && cut.performance === "reaction",
  );
  // She may replay her idle several times before the branch is admitted; the
  // film she was in when the reaction took over is the last one retired.
  const boundary = log
    .slice(0, reaction)
    .filter((cut) => cut.kind === "removed")
    .at(-1);
  expect(boundary, `no film retired before the reaction: ${JSON.stringify(log)}`).toBeDefined();
  expect(boundary!.performance).toBe("idle");
  expect(Math.abs(boundary!.currentTime! - boundary!.duration!)).toBeLessThan(
    0.1,
  );
  expect(await idle!.evaluate((v) => (v as HTMLVideoElement).src)).toContain(
    "queen-idle.webm",
  );
  await expect
    .poll(
      async () =>
        (await cuts()).find(
          (cut) => cut.kind === "removed" && cut.performance === "reaction",
        ),
      { timeout: 12000 },
    )
    .toBeDefined();
  const complete = await cuts();
  const retired = complete.findIndex(
    (cut) => cut.kind === "removed" && cut.performance === "reaction",
  );
  const played = complete[retired];
  // Both spins landed while she still owed this branch - the second one either
  // before she took it or, as measured, in the middle of it - and neither
  // cancelled or truncated it. CharacterSequence.advanceTurn() runs on every
  // spin and drops only actions marked expireOnTurn, which a resident reaction
  // is not, and it cannot reset a movie that has already started. The
  // full-length retirement on the next line is what proves it was not cut short.
  expect(
    complete.findIndex((cut) => cut.kind === "spin-2"),
    `spin marks and cuts: ${JSON.stringify(complete)}`,
  ).toBeLessThan(retired);
  expect(Math.abs(played.currentTime! - played.duration!)).toBeLessThan(0.1);
  const skyBefore = await sky();
  await expect.poll(sky).not.toBe(skyBefore);
  await expect
    .poll(async () => (await cuts()).slice(reaction).some((cut) => cut.kind === "added" && cut.performance === "idle"), {
      timeout: 8000,
    })
    .toBe(true);
  await expect
    .poll(() =>
      queen.evaluate(
        (v) =>
          !(v as HTMLVideoElement).paused &&
          (v as HTMLVideoElement).currentTime > 0.1,
      ),
    )
    .toBe(true);
});
