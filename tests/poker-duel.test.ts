import { expect, it } from "vitest";
import fc from "fast-check";
import {
  bestHand,
  compareHands,
  DEAD_MANS_HAND,
  settleBoard,
} from "../src/engine/legacy/poker-v130";
import { initialState, resolveSpin, evaluateWays } from "../src/engine/legacy/engine-v130";
import { CONFIG } from "../src/engine/legacy/config-v130";
import { SeededRng, RecordingRng, ReplayRng } from "../src/engine/rng";
import type { Grid } from "../src/engine/types";

function fixture(grid: Grid, faces: number[], bonus = false) {
  const available = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => !DEAD_MANS_HAND.includes(c),
  );
  const draws = [
    ...(bonus ? [9999] : []),
    ...grid.flatMap((reel, r) => reel.map((s) => CONFIG.strips[r].indexOf(s))),
    ...Array(5).fill(9999),
    ...faces.map((card) => {
      const index = available.indexOf(card);
      available.splice(index, 1);
      return index;
    }),
  ];
  return {
    nextInt(max: number) {
      const value = draws.shift();
      if (value === undefined || value < 0 || value >= max)
        throw new Error("Invalid fixture");
      return value;
    },
  };
}
it("fixes the antagonist busted royal and compares full poker strength including kickers", () => {
  expect(DEAD_MANS_HAND).toEqual([12, 11, 10, 9, 13]);
  expect(compareHands([25, 24, 23, 22, 15], DEAD_MANS_HAND)).toBe(1);
  expect(compareHands([25, 24, 23, 22, 0], DEAD_MANS_HAND)).toBe(0);
  expect(compareHands([0, 27, 42, 18, 33], DEAD_MANS_HAND)).toBe(-1);
  expect(compareHands([0, 26, 42, 18, 33], DEAD_MANS_HAND)).toBe(1);
});
it("selects an optimal visible five by comparison with exhaustive five-card combinations", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 51 }), {
        minLength: 5,
        maxLength: 10,
      }),
      (cards) => {
        const best = bestHand(cards);
        expect(best).toHaveLength(5);
        for (let a = 0; a < cards.length - 4; a++)
          for (let b = a + 1; b < cards.length - 3; b++)
            for (let c = b + 1; c < cards.length - 2; c++)
              for (let d = c + 1; d < cards.length - 1; d++)
                for (let e = d + 1; e < cards.length; e++)
                  expect(
                    compareHands(best, [
                      cards[a],
                      cards[b],
                      cards[c],
                      cards[d],
                      cards[e],
                    ]),
                  ).toBeGreaterThanOrEqual(0);
      },
    ),
    { numRuns: 120 },
  );
});
it("deals only visible unique cards from the remaining deck and keeps source positions exact", () => {
  const grid: Grid = Array.from({ length: 5 }, () => Array(4).fill("dust"));
  const { cardFaces, poker } = settleBoard(grid, 100, new SeededRng(32));
  expect(new Set(Object.values(cardFaces)).size).toBe(20);
  expect(Object.values(cardFaces).some((c) => DEAD_MANS_HAND.includes(c))).toBe(
    false,
  );
  expect(poker!.cards).toEqual(poker!.cells!.map((cell) => cardFaces[cell]));
});
it("blocks all symbol awards on a loss and combines them with poker on a win", () => {
  const grid: Grid = Array.from({ length: 5 }, () =>
    Array(4).fill("gunslinger"),
  );
  for (const cell of [12, 13, 16, 17, 18])
    grid[Math.floor(cell / 4)][cell % 4] = "dust";
  expect(evaluateWays(grid, 100).length).toBeGreaterThan(0);
  const loss = resolveSpin(
    initialState(),
    100,
    fixture(grid, [0, 27, 42, 18, 33]),
    "duel-loss",
  );
  expect(loss.poker!.outcome).toBe("loss");
  expect(loss.payout).toBe(0);
  expect(loss.wins).toEqual([]);
  const win = resolveSpin(
    initialState(),
    100,
    fixture(grid, [0, 26, 42, 18, 33]),
    "duel-win",
  );
  expect(win.poker!.outcome).toBe("win");
  expect(win.wins.length).toBeGreaterThan(0);
  expect(win.payout).toBe(
    win.poker!.amount + win.wins.reduce((s, w) => s + w.amount, 0),
  );
  expect(win.state.poker?.cards).toEqual([]);
});
it("uses the same showdown on free spins, caps combined exposure and replays exactly", () => {
  const grid: Grid = Array.from({ length: 5 }, () =>
    Array(4).fill("gunslinger"),
  );
  for (const cell of [12, 13, 16, 17, 18])
    grid[Math.floor(cell / 4)][cell % 4] = "dust";
  const state = {
    ...initialState(),
    phase: "bonus" as const,
    freeSpins: 2,
    bonusAwarded: 8,
    bonusBet: 100,
    roundBet: 100,
    roundWin: 999990,
  };
  const rng = new RecordingRng(fixture(grid, [0, 26, 42, 18, 33], true));
  const result = resolveSpin(state, 100, rng, "cap-duel");
  expect(result.payout).toBe(10);
  expect(result.debit).toBe(0);
  expect(result.state.roundWin).toBe(1000000);
  const replay = new ReplayRng(rng.draws);
  expect(resolveSpin(state, 100, replay, "cap-duel")).toEqual(result);
  replay.assertConsumed();
});
