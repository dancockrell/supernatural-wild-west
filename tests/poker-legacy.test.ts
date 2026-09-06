import { expect, it } from "vitest";
import fc from "fast-check";
import { rankHand, collectCard, POKER_PAYS } from "../src/engine/legacy/poker-v12";
import { initialState, resolveSpin } from "../src/engine/legacy/engine-v121";
import { SeededRng, RecordingRng, ReplayRng } from "../src/engine/rng";
import type { Grid } from "../src/engine/types";
const backs: Grid = Array.from({ length: 5 }, () => Array(4).fill("dust"));
it("recognizes every hand, including the ace-low straight and flush", () => {
  const examples: [number[], string][] = [
    [[8, 9, 10, 11, 12], "Royal flush"],
    [[0, 1, 2, 3, 12], "Straight flush"],
    [[0, 13, 26, 39, 1], "Four of a kind"],
    [[0, 13, 26, 1, 14], "Full house"],
    [[0, 2, 5, 7, 10], "Flush"],
    [[0, 14, 28, 42, 12], "Straight"],
    [[0, 13, 26, 2, 4], "Three of a kind"],
    [[0, 13, 1, 14, 4], "Two pair"],
    [[0, 13, 1, 3, 5], "Pair"],
    [[0, 14, 4, 7, 10], "High card"],
  ];
  for (const [cards, rank] of examples) expect(rankHand(cards)).toBe(rank);
  expect(() => rankHand([0, 0, 1, 2, 3])).toThrow();
});
it("draws five unique cards, settles once, resets and never mutates the prior hand", () => {
  fc.assert(
    fc.property(fc.integer(), (seed) => {
      const state = initialState(),
        rng = new SeededRng(seed);
      for (let i = 0; i < 5; i++) {
        const previous = state.poker!,
          snapshot = [...previous.cards];
        const deal = collectCard(state, backs, 100, rng)!;
        expect(previous.cards).toEqual(snapshot);
        expect(new Set(deal.cards).size).toBe(i + 1);
        expect(deal.complete).toBe(i === 4);
        expect(deal.amount).toBe(
          i === 4 ? POKER_PAYS[rankHand(deal.cards)] * 100 : 0,
        );
      }
      expect(state.poker).toEqual({ cards: [], bet: 0 });
    }),
  );
});
it("locks a partial hand stake and records card draws for exact replay", () => {
  let state = initialState(10000000);
  const rng = new RecordingRng(new SeededRng(123));
  const before = structuredClone(state);
  const result = resolveSpin(state, 100, rng, "poker-replay");
  const replay = new ReplayRng(rng.draws);
  expect(resolveSpin(before, 100, replay, "poker-replay")).toEqual(result);
  replay.assertConsumed();
  if (result.poker) expect(result.cardFaces?.[result.poker.cell!]).toBe(result.poker.cards.at(-1));
  expect(Object.keys(result.cardFaces || {})).toHaveLength(result.grid.flat().filter(s => s === "dust").length);
  state = { ...initialState(), poker: { cards: [1], bet: 100 } };
  expect(() => resolveSpin(state, 200, new SeededRng(3), "raise")).toThrow(
    "locked",
  );
});
it("pauses collection in free spins and does not invent a card on a grid without backs", () => {
  const state = { ...initialState(), poker: { cards: [1, 5], bet: 100 } };
  expect(
    collectCard(
      state,
      Array.from({ length: 5 }, () => Array(4).fill("ace")),
      100,
      new SeededRng(9),
    ),
  ).toBeUndefined();
  const bonus = {
    ...state,
    phase: "bonus" as const,
    freeSpins: 2,
    bonusBet: 100,
    bonusAwarded: 8,
    roundBet: 100,
  };
  const result = resolveSpin(bonus, 100, new SeededRng(8), "free-card");
  expect(result.poker).toBeUndefined();
  expect(result.state.poker).toEqual(state.poker);
});
