import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { SeededRng } from "../../src/engine/rng";

test("a resident waits for her native idle boundary, retains the branch across spins, and returns to moving idle", async ({
  page,
}) => {
  const before = initialState();
  const first = resolveSpin(before, 100, new SeededRng(100), "resident-award");
  const second = resolveSpin(
    first.state,
    100,
    new SeededRng(19),
    "resident-next",
  );
  expect(first.payout).toBe(576);
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
  await page.locator("#spin").click();
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  await expect(queen).toHaveAttribute("data-performance", "idle");
  await page.locator("#spin").click();
  await expect(page.locator("#spin-label")).toHaveText("SPIN");
  await expect(queen).toHaveAttribute("data-performance", "idle");
  const sky = () =>
    page.evaluate(
      () =>
        (window as unknown as { frontierMovieTime: number }).frontierMovieTime,
    );
  await expect(queen).toHaveAttribute("data-performance", "reaction", {
    timeout: 16000,
  });
  const boundary = await idle!.evaluate((v) => ({
    time: (v as HTMLVideoElement).currentTime,
    duration: (v as HTMLVideoElement).duration,
  }));
  expect(Math.abs(boundary.time - boundary.duration)).toBeLessThan(0.1);
  const skyBefore = await sky();
  await expect.poll(sky).not.toBe(skyBefore);
  await expect(queen).toHaveAttribute("data-performance", "idle", {
    timeout: 8000,
  });
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
