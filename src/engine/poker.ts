import { CONFIG } from "./config";
import type { Grid, RandomSource, SpinResult } from "./types";
export { rankHand } from "./legacy/poker-v12";
import { rankHand } from "./legacy/poker-v12";
export const POKER_PAYS: Record<string, number> = {
  "Royal flush": 100,
  "Straight flush": 32.5,
  "Four of a kind": 6.5,
  "Full house": 2,
  Flush: 1,
  Straight: 0.65,
  "Three of a kind": 0.4,
  "Two pair": 0.2,
  Pair: 0.07,
  "High card": 0.07,
};
export const DEAD_MANS_HAND = [12, 11, 10, 9, 13];
const rank = (c: number) => (c % 13) + 2;
export function handStrength(cards: number[]): number[] {
  const category = [
    "High card",
    "Pair",
    "Two pair",
    "Three of a kind",
    "Straight",
    "Flush",
    "Full house",
    "Four of a kind",
    "Straight flush",
    "Royal flush",
  ].indexOf(rankHand(cards));
  const ranks = cards.map(rank).sort((a, b) => b - a);
  if ([4, 8, 9].includes(category))
    return [category, ranks.join(",") === "14,5,4,3,2" ? 5 : ranks[0]];
  const groups = [...new Set(ranks)]
    .map((r) => ({ rank: r, count: ranks.filter((v) => v === r).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  return [category, ...groups.map((g) => g.rank)];
}
export function compareHands(left: number[], right: number[]): number {
  const a = handStrength(left),
    b = handStrength(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] || 0) !== (b[i] || 0))
      return Math.sign((a[i] || 0) - (b[i] || 0));
  return 0;
}
export function bestHand(cards: number[]): number[] {
  if (
    new Set(cards).size !== cards.length ||
    cards.some((c) => !Number.isInteger(c) || c < 0 || c >= 52)
  )
    throw new Error("Invalid visible deck");
  if (cards.length < 5) return [];
  const sorted = [...cards].sort((a, b) => rank(b) - rank(a) || a - b);
  const groups = Array.from({ length: 13 }, (_, i) =>
    sorted.filter((c) => rank(c) === 14 - i),
  ).filter((g) => g.length);
  const straight = (pool: number[]) => {
    for (let high = 14; high >= 5; high--) {
      const run = Array.from({ length: 5 }, (_, i) =>
        pool.find((c) => rank(c) === (high - i === 1 ? 14 : high - i)),
      );
      if (run.every((c) => c !== undefined)) return run as number[];
    }
    return [];
  };
  const flushes = Array.from({ length: 4 }, (_, s) =>
    sorted.filter((c) => Math.floor(c / 13) === s),
  ).filter((p) => p.length >= 5);
  const sf = flushes
    .map(straight)
    .filter((p) => p.length)
    .sort((a, b) => rank(b[0]) - rank(a[0]));
  if (sf.length) return sf[0];
  const four = groups.find((g) => g.length === 4);
  if (four) return [...four, sorted.find((c) => !four.includes(c))!];
  const triple = groups.find((g) => g.length >= 3);
  const pair = groups.find((g) => g.length >= 2 && g !== triple);
  if (triple && pair) return [...triple.slice(0, 3), ...pair.slice(0, 2)];
  if (flushes.length)
    return flushes
      .sort((a, b) => {
        for (let i = 0; i < 5; i++) {
          if (rank(a[i]) !== rank(b[i])) return rank(b[i]) - rank(a[i]);
        }
        return 0;
      })[0]
      .slice(0, 5);
  const run = straight(sorted);
  if (run.length) return run;
  if (triple)
    return [
      ...triple.slice(0, 3),
      ...sorted.filter((c) => !triple.includes(c)).slice(0, 2),
    ];
  const pairs = groups.filter((g) => g.length >= 2);
  if (pairs.length >= 2) {
    const chosen = [...pairs[0].slice(0, 2), ...pairs[1].slice(0, 2)];
    return [...chosen, sorted.find((c) => !chosen.includes(c))!];
  }
  if (pairs.length)
    return [
      ...pairs[0].slice(0, 2),
      ...sorted.filter((c) => !pairs[0].includes(c)).slice(0, 3),
    ];
  return sorted.slice(0, 5);
}
export function settleBoard(
  grid: Grid,
  bet: number,
  rng: RandomSource,
  state?: import("./types").GameState,
): { poker: SpinResult["poker"]; cardFaces: Record<number, number> } {
  const cells = grid.flatMap((reel, r) =>
    reel.flatMap((s, row) => (s === "dust" ? [r * grid[r].length + row] : [])),
  );
  const deck = Array.from({ length: 52 }, (_, i) => i).filter(
      (c) => !DEAD_MANS_HAND.includes(c) && !state?.poker?.cards.includes(c),
    ),
    cardFaces: Record<number, number> = {};
  for (const cell of cells) {
    const pick = rng.nextInt(deck.length);
    cardFaces[cell] = deck[pick];
    deck.splice(pick, 1);
  }
  if (state) {
    const previous = state.poker?.cards || [];
    if (
      previous.length > 4 ||
      new Set(previous).size !== previous.length ||
      previous.some(
        (c) =>
          !Number.isInteger(c) || c < 0 || c > 51 || DEAD_MANS_HAND.includes(c),
      )
    )
      throw new Error("Invalid held hand");
    if (!cells.length) return { poker: undefined, cardFaces };
    const cell = cells[previous.length % cells.length];
    const cards = [...previous, cardFaces[cell]];
    const complete = cards.length === 5;
    const rank = complete ? rankHand(cards) : "";
    const comparison = complete ? compareHands(cards, DEAD_MANS_HAND) : 0;
    state.poker = complete ? { cards: [], bet: 0 } : { cards, bet };
    return {
      cardFaces,
      poker: {
        cards,
        cell,
        complete,
        rank,
        amount:
          comparison > 0
            ? Math.floor(
                (bet *
                  Math.round(POKER_PAYS[rank] * CONFIG.pokerPayScale * 10000)) /
                  10000,
              )
            : 0,
        ...(complete
          ? {
              outcome:
                comparison > 0
                  ? ("win" as const)
                  : comparison < 0
                    ? ("loss" as const)
                    : ("tie" as const),
            }
          : {}),
      },
    };
  }
  const cards = bestHand(Object.values(cardFaces));
  if (cards.length < 5)
    return {
      poker: {
        cards: Object.values(cardFaces),
        cells,
        complete: true,
        rank: "No hand",
        amount: 0,
        outcome: "loss",
      },
      cardFaces,
    };
  const rank = rankHand(cards),
    comparison = compareHands(cards, DEAD_MANS_HAND),
    outcome = comparison > 0 ? "win" : comparison < 0 ? "loss" : "tie",
    amount =
      comparison > 0
        ? Math.floor((bet * Math.round(POKER_PAYS[rank] * 10000)) / 10000)
        : 0;
  return {
    cardFaces,
    poker: {
      cards,
      outcome,
      cells: cards.map((card) =>
        cells.find((cell) => cardFaces[cell] === card)!,
      ),
      complete: true,
      rank,
      amount,
    },
  };
}
