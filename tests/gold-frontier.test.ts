import { expect, it } from "vitest";
import fc from "fast-check";
import { evaluateGold } from "../src/engine/gold";
import { initialState, resolveSpin } from "../src/engine/engine";
import { CONFIG } from "../src/engine/config";
import { RecordingRng, ReplayRng, SeededRng } from "../src/engine/rng";
import type { Grid } from "../src/engine/types";

it("pays all 12 exact gold lines, with no wild substitution or wraparound", () => {
  const patterns = [
    ...Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => c * 5 + r),
    ),
    ...Array.from({ length: 5 }, (_, c) =>
      Array.from({ length: 5 }, (_, r) => c * 5 + r),
    ),
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];
  for (const line of patterns) {
    const g: Grid = Array.from({ length: 5 }, () => Array(5).fill("dust"));
    line.forEach((i) => (g[Math.floor(i / 5)][i % 5] = "gold"));
    expect(evaluateGold(g, 100).amount).toBe(500);
    g[Math.floor(line[0] / 5)][line[0] % 5] = "wild";
    expect(evaluateGold(g, 100).amount).toBe(0);
  }
});
it("full screen replaces line prizes with the 10000x award", () => {
  const g: Grid = Array.from({ length: 5 }, () => Array(5).fill("gold"));
  expect(evaluateGold(g, 100)).toMatchObject({
    fullScreen: true,
    amount: 1000000,
  });
});
it("the rare full gold draw is reachable and obeys the shared bonus cap", () => {
  const before = {
    ...initialState(),
    phase: "bonus" as const,
    freeSpins: 1,
    bonusBet: 100,
    roundBet: 100,
    roundWin: 900000,
  };
  const r = resolveSpin(
    before,
    100,
    { nextInt: (max) => (max === CONFIG.goldRushDenominator ? 0 : max - 1) },
    "gold",
  );
  expect(r.grid.flat().filter((s) => s === "gold")).toHaveLength(25);
  expect(r.payout).toBe(100000);
  expect(r.gold?.amount).toBe(r.payout);
  expect(r.events.some((e) => e.type === "cap")).toBe(true);
});
it("collects one visible card per spin, completing on the fifth", () => {
  // This used to also assert that a differing bet threw mid-hand ("locks its
  // wager until settlement"). Dan reversed that on 10 Sep 2026 — the swing is
  // now deliberate, priced in optimal-strategy.ts — and that correctness
  // property now lives in tests/wager-lock.test.ts, which can assert it
  // properly (a replay-based check that the completing spin's bet, not the
  // opening one, decides the payout) without tangling this seed-controlled
  // progression's shared RNG stream.
  let state = initialState();
  const rng = new SeededRng(42);
  for (let n = 1; n <= 5; n++) {
    const r = resolveSpin(state, 100, rng, String(n));
    expect(r.poker?.cards).toHaveLength(n);
    expect(r.cardFaces?.[r.poker!.cell!]).toBe(r.poker!.cards[n - 1]);
    expect(r.poker?.complete).toBe(n === 5);
    state = r.state;
  }
  expect(state.poker?.cards).toEqual([]);
});
it("independent matching wins pay before the poker hand completes", () => {
  const stops = CONFIG.strips.flatMap((strip) =>
    Array(5).fill(strip.indexOf("gunslinger")),
  );
  const r = resolveSpin(
    initialState(),
    100,
    { nextInt: (max) => (stops.length ? stops.shift()! : max - 1) },
    "ways",
  );
  expect(r.wins.length).toBeGreaterThan(0);
  expect(r.payout).toBeGreaterThan(0);
  expect(r.poker?.complete).not.toBe(true);
});
it("replays square boards, preserves held cards and bounds the ledger", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 100000 }), (seed) => {
      let state = initialState(100000000);
      const rng = new SeededRng(seed);
      for (let n = 0; n < 60; n++) {
        const recording = new RecordingRng(rng);
        const r = resolveSpin(state, 100, recording, String(n));
        expect(r.grid.every((reel) => reel.length === 5)).toBe(true);
        expect(r.state.balance).toBe(state.balance - r.debit + r.payout);
        expect(r.state.roundWin).toBeLessThanOrEqual(1000000);
        expect(
          resolveSpin(state, 100, new ReplayRng(recording.draws), String(n)),
        ).toEqual(r);
        state = r.state;
      }
    }),
    { numRuns: 30 },
  );
});
