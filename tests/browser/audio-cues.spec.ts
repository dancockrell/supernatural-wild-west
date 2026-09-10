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
  const starts = () =>
    page
      .locator("html")
      .getAttribute("data-foley-starts")
      .then((value) => Number(value || 0));
  // WRONG SUBJECT, RETARGETED. This asked Witching Hour for exactly two foley
  // starts. Its two beats are `breath` cues, and breath/lantern/ghost-deck are
  // deliberately silenced while a feature performance or its event score is
  // running - src/client/audio.ts:631 returns early on exactly those three -
  // so the authored film's own score owns that audio and the beats are
  // suppressed by design. Measured over 9.5s of Witching Hour: 3 buffer-source
  // starts, all score, 0 from beats.
  //
  // The Jail apparition is the right subject for "foley follows playback": its
  // beats are chain cues (cinematics.ts:133-134), which are not ducked. Measured
  // there: 12 starts, of which 9 come from the four chain beats at 3.4s, 4.9s,
  // 5.2s and 5.8s of a 7.084s film.
  await page.evaluate(() => {
    document.documentElement.dataset.foleyStarts = "0";
  });
  await preview(page, "awaken-2");
  await expect(page.locator("#spectacle")).toBeVisible();
  // Sampled inside the page against the film's own clock rather than by
  // polling from here: a poll can overshoot the first beat at 3.4s and read
  // its noise into the "before" number, which would quietly shrink the
  // difference this test is measuring.
  const measured = await page
    .locator(".feature-ghost")
    .evaluate(
      (film: HTMLVideoElement) =>
        new Promise<{ early: number; late: number; duration: number }>(
          (resolve, reject) => {
            const count = () =>
              Number(document.documentElement.dataset.foleyStarts || 0);
            let early: number | undefined;
            const tick = () => {
              if (film.currentTime > 3 && early === undefined) early = count();
              if (film.currentTime > 6.2) {
                film.removeEventListener("timeupdate", tick);
                resolve({
                  early: early ?? count(),
                  late: count(),
                  duration: film.duration,
                });
              }
            };
            film.addEventListener("timeupdate", tick);
            setTimeout(
              () =>
                reject(
                  new Error(
                    `film never reached 6.2s; currentTime=${film.currentTime}, duration=${film.duration}`,
                  ),
                ),
              20000,
            );
          },
        ),
    );
  expect(measured.duration).toBeGreaterThan(6.2);
  // Floor of 6 against a measured 9, and against the 0 a silenced or
  // disconnected beat list would give.
  expect(measured.late - measured.early).toBeGreaterThanOrEqual(6);
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 12000 });
  await page.locator("#audio").click();
  await page.evaluate(() => {
    document.documentElement.dataset.foleyStarts = "0";
  });
  await preview(page, "awaken-2");
  await expect(page.locator("#spectacle")).toBeHidden({ timeout: 12000 });
  expect(await starts()).toBe(0);
});

test("each haunted location schedules a distinct feature sequence", async ({
  page,
}) => {
  // WRONG INSTRUMENT, REPLACED. This counted OscillatorNode frequencies and
  // required the six locations to produce six distinct sets. A feature sequence
  // is not synthesized any more: playEventScore() plays an authored
  // /audio/event-scores-v1/<key>.mp3 per location (src/client/audio.ts:38-51),
  // eight of which are on disk. What the oscillator hook was actually catching,
  // measured, was three `ui` clicks at 340Hz from preview()'s own button presses
  // plus one generic reel cue - [34000,34000,34000] for Witching Hour, the Jail
  // and the Church, [34000x3,7342,22000,29366,44000] for both the Saloon and
  // the Mine. Nothing location-specific at all: 3 distinct sets, not 6, and the
  // two that collided were collisions in the probe rather than in the product.
  //
  // Read the score the location actually schedules instead - same hook the
  // "shared score" test below uses - and hold it to the exact per-place mapping
  // in src/client/main.ts:285-288 rather than to a count of distinct anything.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLAudioElement) {
        const seen = JSON.parse(document.documentElement.dataset.scores || "[]");
        seen.push(this.src);
        document.documentElement.dataset.scores = JSON.stringify(seen);
      }
      return play.call(this);
    };
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  await page.locator("#audio").click();
  const scores = () =>
    page
      .locator("html")
      .getAttribute("data-scores")
      .then((value) => [
        // De-duplicated: one score element can legitimately have play() called
        // more than once (the load and the catch-up path in playEventScore both
        // reach it), and measured it does - the Saloon score reported twice.
        // What matters is which score is running, not how many calls it took.
        ...new Set(
          (JSON.parse(value || "[]") as string[]).filter((src) =>
            src.includes("/audio/event-scores-v1/"),
          ),
        ),
      ]);
  const scheduled: string[] = [];
  for (const [kind, place] of [
    ["witch", "feature-witch"],
    ["awaken-0", "feature-graveyard"],
    ["awaken-1", "feature-saloon"],
    ["awaken-2", "feature-jail"],
    ["awaken-3", "feature-mine"],
    ["awaken-4", "feature-church"],
  ] as const) {
    await page.evaluate(() => {
      document.documentElement.dataset.scores = "[]";
    });
    await preview(page, kind);
    await expect(page.locator("#spectacle")).toBeVisible();
    await expect.poll(scores, { timeout: 10000 }).toHaveLength(1);
    const [played] = await scores();
    expect(played).toMatch(
      new RegExp(`/audio/event-scores-v1/${place}\\.mp3$`),
    );
    scheduled.push(played);
    // STALE BUDGET, RAISED. Witching Hour and the Graveyard apparition are
    // 8.084s authored films now (measured), and the overlay closes 250ms after
    // `ended` (main.ts:301), so 7000ms could not clear the first kind. 12000ms
    // stays under the 15000ms no-progress watchdog, so a film that never ends
    // still reds instead of being waited out.
    await expect(page.locator("#spectacle")).toBeHidden({ timeout: 12000 });
  }
  // Both halves of the name: six schedules, and six *different* ones.
  expect(scheduled).toHaveLength(6);
  expect(new Set(scheduled).size).toBe(6);
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
