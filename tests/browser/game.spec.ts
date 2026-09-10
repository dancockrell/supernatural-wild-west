import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test("player hierarchy keeps controls and removes decorative labels", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("h1")).toHaveText("SUPERNATURAL WILD WEST");
  await expect(page).toHaveTitle("Supernatural Wild West");
  // #skip-spectacle was dropped from this "decorative cruft" list on 10 Sep
  // 2026: it now exists on purpose (see spectacle-accessibility.spec.ts) —
  // it was previously absent from the DOM while its CSS sat unused across
  // three stylesheets, a real gap since the full-screen cinematic overlay
  // had no keyboard-reachable way to skip or stop it.
  await expect(
    page.locator("#legend,.lore-aside,.subtitle,.town-caption,.feature-strip"),
  ).toHaveCount(0);
  await expect(page.locator(".symbol > span")).toHaveCount(0);
  await expect(page.locator("#spin")).toBeVisible();
  await expect(page.locator("#paytable")).toBeVisible();
  await expect(page.locator(".symbol[aria-label]")).toHaveCount(25);
  await page.locator('[data-location="2"]').click();
  await expect(page.locator("#location-tip")).toContainText(
    "Wilds stay locked",
  );
  await expect(page.locator("#modal")).not.toBeVisible();
});

for (const width of [1440, 390]) {
  test(`Ride of the Damned plays once and automatically returns at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/");
    await expect(page.locator("#connection")).toContainText("CONNECTED");
    await page.locator("#audio").click();
    await preview(page, "ride");
    // RETARGETED AT THE LIVE MECHANISM. This read `.spectral-rider video` and
    // required the element to translate across the viewport. That was the
    // canvas rider driven by SpectralEffects.haunt() (src/client/effects.ts:240),
    // which main.ts:326 only calls when the scene has no native performance.
    // Ride of the Damned has had one since ad4adc5 (cinematics.ts:116-122 ->
    // /video/rare-features-v4/ride.webm, 8.084s), so haunt() no longer runs and
    // `.spectral-rider`'s video sits at currentTime 0 with readyState 4 forever
    // - measured. The test was polling a video nothing plays.
    //
    // The horse now moves inside its own frame rather than the element moving
    // across the screen, so the element-translation assertion is gone with the
    // mechanism it described; what remains, and what this test is named for, is
    // that the performance runs its frames once and the overlay returns on its
    // own at both widths.
    const video = page.locator(".feature-ghost");
    await expect(video).toHaveClass(/rare-mounted-performance/);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.3);
    const frames = await video.evaluate(
      (v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames,
    );
    await page.waitForTimeout(650);
    expect(
      await video.evaluate(
        (v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames,
      ),
    ).toBeGreaterThan(frames + 5);
    expect(await video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(false);
    await page.screenshot({
      path: `docs/screenshots/rider-impact-${width}.png`,
    });
    // 8.084s film, overlay closes 250ms after `ended` (main.ts:301); still under
    // the 15000ms no-progress watchdog so a stalled performance reds here.
    await expect(page.locator("#spectacle")).toBeHidden({ timeout: 12000 });
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
    await expect(page.locator("#balance")).toHaveText("1,000.00");
    await expect(page.locator("#spin")).toBeEnabled();
    await expect(page.locator("#modal")).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("illustrated face-up poker cards replace dust tiles", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#spin").click();
  await expect(page.locator("#round-label")).toContainText("00001");
  await expect(page.locator(".symbol.dust .playing-card").first()).toBeVisible();
  await expect(page.locator(".dust-vortex")).toHaveCount(0);
  await page
    .locator(".symbol.dust")
    .first()
    .screenshot({ path: "docs/screenshots/face-up-cards.png" });
});
test("desktop spin, quick stop, history, help, keyboard and recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator(".symbol")).toHaveCount(25);
  await expect(page.locator("#balance")).toHaveText("1,000.00");
  await page.screenshot({
    path: "docs/screenshots/desktop-noon.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Increase bet" }).click();
  await expect(page.locator("#bet")).toHaveText("2.00");
  await page.locator("#spin").click();
  await page.locator("#spin").click();
  await expect(page.locator("#round-label")).toContainText("00001");
  await expect(page.locator("#spin-label")).not.toContainText("QUICK");
  const balance = await page.locator("#balance").innerText();
  await page.reload();
  await expect(page.locator("#balance")).toHaveText(balance);
  await expect(page.locator("#round-label")).toContainText("00001");
  await page
    .getByRole("button", { name: "Round history", exact: true })
    .click();
  await expect(page.locator("#modal-body tbody tr")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.locator("#paytable").click();
  await expect(page.locator(".pay-symbol")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await page.locator("#help").click();
  await expect(page.locator("#modal")).toContainText("10,000");
  await page.keyboard.press("Escape");
  await page.locator("#settings").click();
  await page.locator("#music-volume").fill("35");
  await page.locator("#effects-volume").fill("90");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#settings").click();
  await expect(page.locator("#music-volume")).toHaveValue("35");
  await expect(page.locator("#effects-volume")).toHaveValue("90");
  await page.keyboard.press("Escape");
  await page.locator("h1").click();
  await page.keyboard.press("Space");
  await expect(page.locator("#round-label")).toContainText("00002");
  expect(errors).toEqual([]);
});
test("lost response retries one authoritative debit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.route(
    "**/api/spin",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.locator("#spin").click();
  await expect(page.locator("#recover")).toBeVisible();
  await expect(page.locator("#connection")).toContainText("OFFLINE");
  await page.locator("#recover").click();
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await expect(page.locator("#round-label")).toContainText("00001");
  await page.locator("#history").click();
  await expect(page.locator("#modal-body tbody tr")).toHaveCount(1);
});
test("mobile layout, reduced motion, persistent bonus, locked wager and free spin", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.addCookies([
    {
      name: "dd-session",
      value: "bonus-fixture",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/");
  await expect(page.locator("#phase")).toContainText("Ride of the Damned");
  await expect(page.locator("#bet-up")).toBeDisabled();
  await expect(page.locator("body")).toHaveClass(/reduced-motion/);
  await page.screenshot({
    path: "docs/screenshots/mobile-bonus.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const before = Number(
    (await page.locator("#balance").innerText()).replaceAll(",", ""),
  );
  await page.locator("#spin").click();
  await expect(page.locator("#round-label")).toContainText("00002");
  const win = Number(
    (await page.locator("#win").innerText()).replaceAll(",", ""),
  );
  const after = Number(
    (await page.locator("#balance").innerText()).replaceAll(",", ""),
  );
  expect(after).toBeCloseTo(before + win, 2);
  await page.locator("#settings").click();
  await expect(page.locator("#motion-setting")).toBeChecked();
  await page.keyboard.press("Escape");
});
test("Math Lab computes a seeded study without altering the session", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  const balance = await page.locator("#balance").innerText();
  await page.locator("#settings").click();
  await page.locator(".developer-tools summary").click();
  await page.locator("#math-lab").click();
  await page.locator("#sim-spins").selectOption("10000");
  await page.locator("#sim-run").click();
  await expect(page.locator("#sim-result")).toContainText("MEASURED RTP");
  await expect(page.locator("#sim-result")).toContainText("10,000 paid spins");
  await page.screenshot({
    path: "docs/screenshots/math-lab.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#balance")).toHaveText(balance);
});
test("soundtrack still decodes after UI changes", async ({ page }) => {
  await page.goto("/");
  const audio = await page.evaluate(async () => {
    const response = await fetch("/audio/frontier-theme-matched-v1.mp3");
    const context = new AudioContext();
    const data = await context.decodeAudioData(await response.arrayBuffer());
    let energy = 0,
      peak = 0;
    const samples = data.getChannelData(0);
    for (let i = 0; i < samples.length; i += 16) {
      energy += samples[i] ** 2;
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    await context.close();
    return {
      duration: data.duration,
      rms: Math.sqrt(energy / (samples.length / 16)),
      peak,
    };
  });
  expect(audio.duration).toBeGreaterThan(60);
  expect(audio.rms).toBeGreaterThan(0.005);
  expect(audio.peak).toBeLessThanOrEqual(1);
  console.log("Audio validation:", audio);
});
