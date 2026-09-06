import type { GameState, Grid, RandomSource, SpinResult } from "../types";

export const POKER_PAYS: Record<string, number> = {
  "Royal flush": 5000,
  "Straight flush": 1500,
  "Four of a kind": 500,
  "Full house": 100,
  Flush: 60,
  Straight: 40,
  "Three of a kind": 20,
  "Two pair": 10,
  Pair: 4,
  "High card": 0,
};
export function rankHand(cards: number[]): string {
  if (
    cards.length !== 5 ||
    new Set(cards).size !== 5 ||
    cards.some((c) => !Number.isInteger(c) || c < 0 || c >= 52)
  )
    throw new Error("Expected five distinct cards");
  const ranks = cards.map((c) => (c % 13) + 2).sort((a, b) => a - b);
  const flush = cards.every(
    (c) => Math.floor(c / 13) === Math.floor(cards[0] / 13),
  );
  const straight =
    new Set(ranks).size === 5 &&
    (ranks[4] - ranks[0] === 4 || ranks.join(",") === "2,3,4,5,14");
  const groups = [...new Set(ranks)]
    .map((r) => ranks.filter((v) => v === r).length)
    .sort((a, b) => b - a);
  if (straight && flush)
    return ranks[0] === 10 ? "Royal flush" : "Straight flush";
  if (groups[0] === 4) return "Four of a kind";
  if (groups[0] === 3 && groups[1] === 2) return "Full house";
  if (flush) return "Flush";
  if (straight) return "Straight";
  if (groups[0] === 3) return "Three of a kind";
  if (groups[0] === 2 && groups[1] === 2) return "Two pair";
  return groups[0] === 2 ? "Pair" : "High card";
}
export function collectCard(
  state: GameState,
  grid: Grid,
  bet: number,
  rng: RandomSource,
): SpinResult["poker"] {
  const hand = state.poker || { cards: [], bet: 0 };
  if (
    hand.cards.length > 4 ||
    new Set(hand.cards).size !== hand.cards.length ||
    hand.cards.some((c) => !Number.isInteger(c) || c < 0 || c >= 52)
  )
    throw new Error("Invalid stored poker hand");
  const cells = grid.flatMap((reel, r) =>
    reel.flatMap((s, row) => (s === "dust" ? [r * 4 + row] : [])),
  );
  if (!cells.length) return undefined;
  const deck = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => !hand.cards.includes(c),
  );
  const cards = [...hand.cards, deck[rng.nextInt(deck.length)]];
  const complete = cards.length === 5;
  const rank = complete ? rankHand(cards) : "";
  const amount = complete ? POKER_PAYS[rank] * bet : 0;
  state.poker = complete ? { cards: [], bet: 0 } : { cards, bet };
  return {
    cards,
    cell: cells[hand.cards.length % cells.length],
    complete,
    rank,
    amount,
  };
}
