import { test, expect } from "@playwright/test";
import { preview } from "./preview";

test("apparition movement foley follows playback and respects mute", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      document.documentElement.dataset.foleyStarts = String(
        Number(document.documentElement.dataset.foleyStarts || 0) + 1,
      );
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#audio").click();
  await preview(page, "witch");
  await expect(page.locator("#spectacle")).toBeVisible();
  const starts = () =>
    page
      .locator("html")
      .getAttribute("data-foley-starts")
      .then((value) => Number(value || 0));
  const baseline = await starts();
  await expect.poll(() => starts(), { timeout: 5000 }).toBe(baseline + 2);
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 7000 });
  await page.locator("#audio").click();
  const mutedBaseline = await starts();
  await preview(page, "witch");
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 7000 });
  expect(await starts()).toBe(mutedBaseline);
});

test("each haunted location schedules a distinct feature sequence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      const values = JSON.parse(document.documentElement.dataset.notes || "[]");
      values.push(Math.round(this.frequency.value * 100));
      document.documentElement.dataset.notes = JSON.stringify(values);
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#audio").click();
  const signatures = new Set<string>();
  for (const kind of [
    "witch",
    "awaken-0",
    "awaken-1",
    "awaken-2",
    "awaken-3",
    "awaken-4",
  ]) {
    await page.evaluate(() => {
      document.documentElement.dataset.notes = "[]";
    });
    await preview(page, kind);
    await expect(page.locator("#spectacle")).toBeVisible();
    const notes = JSON.parse(
      (await page.locator("html").getAttribute("data-notes"))!,
    );
    expect(notes.length).toBeGreaterThan(1);
    signatures.add(JSON.stringify(notes));
    await expect(page.locator("#spectacle")).toBeHidden({ timeout: 7000 });
  }
  expect(signatures.size).toBe(6);
  await expect(page.locator("#balance")).toHaveText("1,000.00");
});

test("shared score decodes and remains the same across phases", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement)
        document.documentElement.dataset.musicSource = this.src;
      return play.call(this);
    };
  });
  await context.addCookies([
    {
      name: "dd-session",
      value: "audio-bonus-fixture",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/");
  await expect(page.locator("#phase")).toContainText("Ride of the Damned");
  await page.locator("#audio").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-music-source",
    /frontier-theme-matched-v1/,
  );
  const decoded = await page.evaluate(async () => {
    const c = new AudioContext();
    const r = await fetch("/audio/frontier-theme-matched-v1.mp3");
    const b = await c.decodeAudioData(await r.arrayBuffer());
    let peak = 0,
      energy = 0;
    const data = b.getChannelData(0);
    for (let i = 0; i < data.length; i += 16) {
      peak = Math.max(peak, Math.abs(data[i]));
      energy += data[i] ** 2;
    }
    await c.close();
    return {
      duration: b.duration,
      peak,
      rms: Math.sqrt(energy / (data.length / 16)),
    };
  });
  expect(decoded.duration).toBeGreaterThan(170);
  expect(decoded.peak).toBeLessThan(1);
  expect(decoded.rms).toBeGreaterThan(0.005);
  await context.clearCookies();
  await page.reload();
  await expect(page.locator("#phase")).toContainText("High Noon");
  await expect(page.locator("html")).toHaveAttribute(
    "data-music-source",
    /frontier-theme-matched-v1/,
  );
});

test("music transport does not replace its source when a bonus ends", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "src",
    )!;
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      ...descriptor,
      set(value) {
        if (this instanceof HTMLAudioElement)
          document.documentElement.dataset.audioSourceChanges = String(
            Number(document.documentElement.dataset.audioSourceChanges || 0) +
              1,
          );
        descriptor.set!.call(this, value);
      },
    });
  });
  await context.addCookies([
    {
      name: "dd-session",
      value: "audio-bonus-fixture",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/");
  await expect(page.locator("#phase")).toContainText("Ride of the Damned");
  await page.locator("#audio").click();
  const changes = await page
    .locator("html")
    .getAttribute("data-audio-source-changes");
  for (
    let i = 0;
    i < 33 && !(await page.locator("#phase").innerText()).includes("High Noon");
    i++
  ) {
    const before = await page.locator("#round-label").innerText();
    await page.locator("#spin").click();
    await expect(page.locator("#round-label")).not.toHaveText(before);
    await expect(page.locator("#spin-label")).not.toHaveText("QUICK STOP");
  }
  await expect(page.locator("#phase")).toContainText("High Noon");
  expect(
    await page.locator("html").getAttribute("data-audio-source-changes"),
  ).toBe(changes);
});
