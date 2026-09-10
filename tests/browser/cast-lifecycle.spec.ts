import { test, expect, type Page } from "@playwright/test";
import { injectClient } from "./client-module";

/**
 * NON-EXISTENT CAST, REPLACED.
 *
 * Every test in this file used to call a `setup()` that ended
 * `return page.locator(".dealer-stage video")`, and route
 * `**\/video/gambler-v1/{win,loss}.webm`. Neither exists. `.dealer-stage` has
 * never been written by any source file in any commit - `git grep dealer-stage`
 * over the whole history finds it only in src/client/player-ui.css and in test
 * files - and measured at runtime it is 0 elements on both `/` and `/?parlor=1`,
 * before and after a spin, in the same sample where `.poker-felt`,
 * `.player-seat` and `.poker-award` each read 1. No source fetches
 * `/video/gambler-v1/` either: the gambler's films are
 * `/video/parlor-gambler-native-v2/{receive,loss}.webm` and
 * `/video/parlor-gambler-hair-v1/{idle,notice}.webm`, and he is parlor-only
 * (`.narrative-gambler`: 1 on `/?parlor=1`, 0 on `/`, which is where these
 * tests looked). So all three tests were polling attributes on an empty
 * locator behind a route glob that never matched - which is how they failed:
 * two on `Timeout 5000ms exceeded while waiting on the predicate` and one on a
 * `requested` flag that could never be set.
 *
 * The three properties they were named for are real and belong to
 * ResidentSequence (src/client/resident-sequence.ts), the one thing in this
 * codebase that sequences an idle film against a reaction film at native
 * boundaries. Of those three:
 *
 *  - "a delayed previous-hand movie cannot replace idle during the next spin"
 *    is already held, harder, by
 *    tests/browser/resident-branches.spec.ts (the branch waits for a real idle
 *    boundary and survives two spins uncut) and
 *    tests/browser/resident-pending-handoff.spec.ts (a slow incoming decode
 *    keeps the outgoing film, and a superseded handoff cannot resurrect
 *    itself). It is not duplicated here.
 *
 *  - reduced motion returning to idle, and a media error restoring idle, had
 *    no browser coverage at all. tests/character-sequence.test.ts:90 covers
 *    the pure sequence half; nothing covered the adapter half, which is what
 *    actually swaps the element in the porch and pauses it. That is what the
 *    two tests below do.
 *
 * They drive the real class through tests/browser/client-module.ts, the one
 * owner of the read-strip-transpile-inject idiom, in the same shape
 * resident-pending-handoff.spec.ts already uses - rather than staging a
 * ten-second win in the full app, which is what made the reaction unobservable
 * in the first place.
 */

/** Two stand-in films with controllable readiness, and a log of every play/pause. */
const HARNESS = `
  HTMLMediaElement.prototype.load = function () {};
  window.__log = [];
  window.__film = (name) => {
    const v = document.createElement('video');
    let ready = 0, ended = false, paused = true;
    Object.defineProperty(v, 'readyState', { get: () => ready });
    Object.defineProperty(v, 'seeking', { get: () => false });
    Object.defineProperty(v, 'ended', { get: () => ended });
    Object.defineProperty(v, 'paused', { get: () => paused });
    v.play = () => { paused = false; window.__log.push('play:' + name); return Promise.resolve(); };
    v.pause = () => { paused = true; window.__log.push('pause:' + name); };
    v.__ready = (value) => { ready = value; };
    v.__ended = (value) => { ended = value; };
    v.__name = name;
    return v;
  };
  /** Idle presented, reaction admitted at the idle's own boundary, both started. */
  window.__branch = (allowBranch = () => true) => {
    const slot = document.getElementById('slot');
    slot.replaceChildren();
    const idle = window.__film('idle'), reaction = window.__film('reaction');
    slot.append(idle);
    const resident = new window.ResidentSequence(slot, idle, reaction, allowBranch, () => {});
    idle.__ready(4); reaction.__ready(4);
    idle.dispatchEvent(new Event('playing'));
    resident.enqueue(1);
    idle.__ended(true);
    idle.dispatchEvent(new Event('ended'));
    reaction.dispatchEvent(new Event('playing'));
    return { slot, idle, reaction, resident };
  };
  window.__shown = (slot) => {
    const film = slot.querySelector('video');
    return { name: film && film.__name, performance: film && film.dataset.performance, paused: film && film.paused };
  };
`;

async function load(page: Page) {
  await page.setContent('<div id="slot"></div>');
  await injectClient(page, {
    modules: ["character-sequence", "resident-sequence"],
    expose: ["ResidentSequence"],
    append: HARNESS,
  });
}

test("reduced motion restores idle and does not resume an obsolete reaction", async ({
  page,
}) => {
  await load(page);
  const result = await page.evaluate(() => {
    const { slot, reaction, resident } = (window as any).__branch();
    // The branch must actually be on screen, or everything after it is vacuous.
    const branched = (window as any).__shown(slot);

    resident.setReduced(true);
    const reduced = (window as any).__shown(slot);

    // Late callbacks from the film that was cut off must not bring it back.
    reaction.dispatchEvent(new Event("seeked"));
    reaction.dispatchEvent(new Event("loadeddata"));
    reaction.dispatchEvent(new Event("ended"));
    const afterStale = (window as any).__shown(slot);

    resident.setReduced(false);
    const restored = (window as any).__shown(slot);

    // And the reaction it owed before reduced motion is not owed any more.
    const idle = slot.querySelector("video");
    idle.__ended(true);
    idle.dispatchEvent(new Event("playing"));
    idle.dispatchEvent(new Event("ended"));
    const afterBoundary = (window as any).__shown(slot);

    return {
      branched,
      reduced,
      afterStale,
      restored,
      afterBoundary,
      films: slot.querySelectorAll("video").length,
      log: (window as any).__log,
    };
  });
  expect(result.branched).toEqual({
    name: "reaction",
    performance: "reaction",
    paused: false,
  });
  expect(result.reduced).toEqual({
    name: "idle",
    performance: "idle",
    paused: true,
  });
  expect(result.afterStale).toEqual(result.reduced);
  expect(result.restored).toEqual({
    name: "idle",
    performance: "idle",
    paused: false,
  });
  expect(result.afterBoundary.performance).toBe("idle");
  expect(result.films).toBe(1);
  // The reaction was played exactly once - before reduced motion, never after.
  expect(result.log.filter((line: string) => line === "play:reaction")).toEqual([
    "play:reaction",
  ]);
});

test("a media error during a reaction restores the moving idle", async ({
  page,
}) => {
  await load(page);
  const result = await page.evaluate(() => {
    const { slot, reaction } = (window as any).__branch();
    const branched = (window as any).__shown(slot);
    reaction.__ready(0);
    reaction.dispatchEvent(new Event("error"));
    const afterError = (window as any).__shown(slot);
    return {
      branched,
      afterError,
      films: slot.querySelectorAll("video").length,
      log: (window as any).__log,
    };
  });
  expect(result.branched).toEqual({
    name: "reaction",
    performance: "reaction",
    paused: false,
  });
  expect(result.afterError).toEqual({
    name: "idle",
    performance: "idle",
    paused: false,
  });
  expect(result.films).toBe(1);
  expect(result.log.at(-1)).toBe("play:idle");
});
