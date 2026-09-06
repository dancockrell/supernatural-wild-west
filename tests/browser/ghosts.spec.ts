import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test("mobile ghost uses a clean poster when alpha video is unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/video/*.webm", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await preview(page, "awaken-3");
  const video = page.locator(".feature-ghost");
  await expect(video).toHaveClass(/poster-fallback/);
  await expect(video).toHaveAttribute("poster", "/video/queen-lantern-v10.png");
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
    await expect(page.locator("#spectacle")).toBeHidden({ timeout: 6500 });
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
  const samples = await video.evaluate(async (v: HTMLVideoElement) => {
    v.pause();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    const samples = [];
    for (const time of [0.05, 0.6, 1.5, 3, 4.8, 5.3]) {
      await new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => resolve(), { once: true });
        v.currentTime = time;
      });
      ctx.clearRect(0, 0, 800, 600);
      ctx.drawImage(v, 0, 0, 800, 600);
      samples.push(
        [350, 400, 465].map((x) => ctx.getImageData(x, 80, 1, 1).data[3]),
      );
    }
    return samples;
  });
  for (const sample of samples)
    for (const alpha of sample) expect(alpha).toBeGreaterThan(250);
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
