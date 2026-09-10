import { test, expect } from "@playwright/test";
import { preview } from "./preview";

// RETARGETED AT THE LIVE MECHANISM. This test blocked /video/rider-gallop-v5.webm
// and waited for `.spectral-rider` to gain the `riding` class. That class is
// added in SpectralEffects.haunt() (src/client/effects.ts:240), and haunt() is
// only called from src/client/main.ts:326, behind `!nativePerformance`. Ride of
// the Damned has had a native performance since ad4adc5 - cinematics.ts:116-122
// gives it /video/rare-features-v4/ride.webm (8.084s, measured) - so
// `.feature-ghost` is always present for this kind and haunt() can no longer
// run at all. Measured: the `.spectral-rider` video sits at currentTime 0 with
// readyState 4, forever, while the authored film plays. The canvas rider is
// dead code, not a broken feature (reported separately; effects.ts is not
// this agent's file to change).
//
// The property the test is named for is still real and still worth holding: the
// crossing must not start on a wall clock while the film is cold. That is what
// followNativeFilm() in src/client/cinematics.ts:204-246 does - it pauses the
// caption animation and drives opacity, fog and caption from the film's own
// currentTime - so this now measures that instead.
test("Ride waits for a cold video before starting its crossing", async ({
  page,
}) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/video/rare-features-v4/ride.webm", async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "ride");
  const film = page.locator(".feature-ghost");
  await expect(film).toHaveClass(/rare-mounted-performance/);
  await page.waitForTimeout(3600);
  await expect(page.locator("#spectacle")).toBeVisible();
  const cold = await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>(".feature-ghost")!;
    return {
      time: video.currentTime,
      opacity: video.style.opacity,
      caption: document
        .querySelector(".spectacle-card")!
        .getAnimations()
        .map((a) => ({ time: Number(a.currentTime), state: a.playState })),
    };
  });
  // Nothing has advanced: not the film, not its reveal, not the caption clock.
  expect(cold.time).toBe(0);
  expect(Number(cold.opacity)).toBe(0);
  expect(cold.caption).toHaveLength(1);
  expect(cold.caption[0].state).toBe("paused");
  expect(cold.caption[0].time).toBe(0);
  release();
  const video = page.locator(".feature-ghost");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15000,
    })
    .toBeGreaterThan(0.5);
  // The crossing only reveals itself once the film is actually running.
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => Number(v.style.opacity)))
    .toBeGreaterThan(0.9);
  await expect
    .poll(() =>
      page
        .locator(".spectacle-card")
        .evaluate((e) => Number(e.getAnimations()[0]?.currentTime ?? 0)),
    )
    .toBeGreaterThan(400);
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#balance")).toHaveText("1,000.00");
});
