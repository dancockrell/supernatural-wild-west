import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test("mobile ghost uses a clean poster when alpha video is unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // STALE ROUTE GLOB, CORRECTED. This was `**/video/*.webm`, and Playwright's
  // `*` does not cross a `/`. Every feature clip now lives in a versioned
  // subdirectory (awaken-3 is /video/feature-performances-v2/mine.webm, set in
  // src/client/cinematics.ts:110-115), so the pattern stopped matching and
  // nothing was ever aborted: the test was asserting a fallback against a
  // perfectly healthy video. `**/*.webm` is what "alpha video is unavailable"
  // actually means here, and it cannot silently stop matching.
  await page.route("**/*.webm", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "awaken-3");
  const video = page.locator(".feature-ghost");
  await expect(video).toHaveClass(/poster-fallback/);
  // STALE POSTER, CORRECTED. The Mine apparition is its own authored film now,
  // not the shared queen-lantern sprite. cinematics.ts derives the poster from
  // the already-resolved src, so the attribute is an absolute URL - anchor on
  // the tail rather than pinning the origin.
  await expect(video).toHaveAttribute(
    "poster",
    /\/video\/feature-performances-v2\/mine\.png$/,
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/screenshots/ghost-mobile-fallback.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 6500 });
  await expect(page.locator("#balance")).toHaveText("1,000.00");
});

test("location ghosts play once and return automatically without spending credits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  const cast = [
    "medium-seance",
    "medium-seance",
    "gunslinger-chains",
    "queen-lantern",
    "preacher-book",
  ];
  for (let location = 0; location < cast.length; location++) {
    await preview(page, `awaken-${location}`);
    const video = page.locator(".feature-ghost");
    await expect(video).toHaveAttribute("data-ghost", cast[location]);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(1.2);
    const alpha = await video.evaluate((v: HTMLVideoElement) => {
      const c = document.createElement("canvas");
      c.width = 80;
      c.height = 60;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(v, 0, 0, 80, 60);
      const pixels = ctx.getImageData(0, 0, 80, 60).data;
      return {
        corner: pixels[3],
        torso: pixels[(36 * 80 + 40) * 4 + 3],
        opaque: Array.from(pixels).filter((a, i) => i % 4 === 3 && a > 200)
          .length,
        duration: v.duration,
        loop: v.loop,
      };
    });
    expect(alpha.corner).toBeLessThan(10);
    expect(alpha.torso).toBeGreaterThan(245);
    expect(alpha.opaque).toBeGreaterThan(100);
    expect(alpha.loop).toBe(false);
    await page.screenshot({ path: `docs/screenshots/ghost-${location}.png` });
    // STALE BUDGET, RAISED. 6500ms predates the authored location films. The
    // Graveyard apparition is /video/rare-features-v4/graveyard.webm at 8.084s
    // (measured), and the overlay closes 250ms after its `ended` (main.ts:301),
    // so 6500ms could only ever have passed against the old short sprites.
    // 12000ms is deliberately still below the 15000ms no-progress watchdog on
    // the same code path, so a performance that never ends still reds here.
    await expect(page.locator("#spectacle")).toBeHidden({ timeout: 12000 });
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);

    await expect(page.locator("#balance")).toHaveText("1,000.00");
  }
});

test("Witching Hour keeps the Medium solid throughout her performance", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.setViewportSize({ width: 535, height: 1000 });
  await preview(page, "witch");
  const video = page.locator(".feature-ghost");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(1);
  // PROBE MEASURED THE WRONG PIXELS, REPLACED. This read alpha at three fixed
  // points on row y=80 of an 800x600 stretched draw and required each to be
  // opaque. Those coordinates were chosen for the old medium-seance sprite.
  // Witching Hour is its own authored film now (feature-performances-v2/
  // witch.webm, 1442x1600, 8.084s - measured), and in that framing row 80 is
  // empty sky above her head: alpha there is 0 at every one of these times, so
  // the probe reported her as fully transparent while she is in fact solid.
  //
  // Fixed coordinates are the wrong instrument for "she stays solid" anyway -
  // they re-break on the next reframe. Count the fully opaque pixels instead,
  // which is the property the test is named for: a translucency or haze
  // regression collapses that count towards zero, wherever she stands.
  // Measured on the current film: 61,598 / 63,156 / 64,333 / 72,654 / 66,142 /
  // 66,609 opaque pixels at the six sampled times, out of 480,000.
  const samples = await video.evaluate(async (v: HTMLVideoElement) => {
    v.pause();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    const samples: {
      time: number;
      opaque: number;
      rows: number;
      clear: number;
    }[] = [];
    for (const time of [0.05, 0.6, 1.5, 3, 4.8, 5.3]) {
      await new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => resolve(), { once: true });
        v.currentTime = time;
      });
      ctx.clearRect(0, 0, 800, 600);
      ctx.drawImage(v, 0, 0, 800, 600);
      const pixels = ctx.getImageData(0, 0, 800, 600).data;
      let opaque = 0;
      let clear = 0;
      const rows = new Set<number>();
      for (let y = 0; y < 600; y++)
        for (let x = 0; x < 800; x++) {
          const alpha = pixels[(y * 800 + x) * 4 + 3];
          if (alpha > 250) {
            opaque++;
            rows.add(y);
          } else if (alpha < 10) clear++;
        }
      samples.push({ time, opaque, rows: rows.size, clear });
    }
    return samples;
  });
  expect(samples).toHaveLength(6);
  for (const sample of samples) {
    // Floor set well under the measured minimum of 61,598 so it never needs
    // touching, and far above the zero a translucent body would produce.
    expect(sample.opaque).toBeGreaterThan(40000);
    // Solid across her whole height, not just one bright band.
    expect(sample.rows).toBeGreaterThan(200);
    // And solid *because she is a cutout*, not because the room got baked in
    // behind her. Without this a fully opaque film - alpha destroyed, black box
    // around her - satisfies everything above; verified by sabotage, swapping
    // the witch film for cast-loop-v1/gold-mine-loop.mp4 passed until this line
    // existed. Measured on the real film: about 352,000 of 480,000 pixels are
    // transparent (127,471 carry any alpha at all).
    expect(sample.clear).toBeGreaterThan(200000);
  }
  expect(await video.evaluate((v) => getComputedStyle(v).opacity)).toBe("1");
  for (const time of [0.6, 2.6, 4.8]) {
    await video.evaluate(async (v: HTMLVideoElement, time) => {
      await new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => resolve(), { once: true });
        v.currentTime = time;
      });
    }, time);
    await page.screenshot({ path: `docs/screenshots/witch-frame-${time}.png` });
  }
  await page.screenshot({ path: "docs/screenshots/witch-solid.png" });
  await expect(
    page.locator(".feature-cinders,.feature-rays,.hellfire-eruption"),
  ).toHaveCount(0);
});

test("High Noon has a warm reveal and returns without dismissal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "noon");
  await expect(page.locator(".dawn-return")).toBeVisible();
  await expect(
    page.locator(".dawn-sun,.dawn-horizon,.feature-rays"),
  ).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/noon-return.png" });
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 3500 });
  await expect(page.locator("#balance")).toHaveText("1,000.00");
});
