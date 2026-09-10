import { describe, expect, it } from "vitest";
import { rankHand } from "../src/engine/legacy/poker-v12";
import {
  bestHand,
  compareHands,
  handStrength,
  settleBoard,
  DEAD_MANS_HAND,
} from "../src/engine/poker";
import { SeededRng } from "../src/engine/rng";
import type { Grid, SymbolId } from "../src/engine/types";

/**
 * The evaluator against an independently written reference, over every hand
 * that exists — not a handful of assertions.
 *
 * The reference below shares no code with the implementation and uses a
 * different technique on purpose: a rank bitmask for the straight (the
 * implementation sorts and subtracts) and a Map tally for the shape (the
 * implementation filters and counts). Its own correctness is not taken on
 * faith either: the category census it produces over all C(52,5) hands is
 * compared against the textbook five-card distribution (1,302,540 high card
 * ... 4 royal flushes), which is a fact about poker and not about either
 * piece of code here. A reference that is broken cannot produce those ten
 * numbers by accident.
 *
 * Denominators are asserted throughout. A loop that silently enumerated
 * nothing would otherwise pass every assertion in this file.
 */

const CATEGORIES = [
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
] as const;

/** The published five-card hand census. Neither module under test produces it. */
const TEXTBOOK: Record<string, number> = {
  "High card": 1302540,
  Pair: 1098240,
  "Two pair": 123552,
  "Three of a kind": 54912,
  Straight: 10200,
  Flush: 5108,
  "Full house": 3744,
  "Four of a kind": 624,
  "Straight flush": 36,
  "Royal flush": 4,
};

const WHEEL_MASK = (1 << 14) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);

/** Independent comparable key: [category, ...descending tiebreak ranks]. */
function referenceKey(cards: readonly number[]): number[] {
  let mask = 0;
  let flush = true;
  const suit = Math.floor(cards[0] / 13);
  const tally = new Map<number, number>();
  for (const card of cards) {
    const r = (card % 13) + 2;
    mask |= 1 << r;
    if (Math.floor(card / 13) !== suit) flush = false;
    tally.set(r, (tally.get(r) ?? 0) + 1);
  }
  let straightHigh = 0;
  if (tally.size === 5) {
    if (mask === WHEEL_MASK) straightHigh = 5;
    else
      for (let high = 14; high >= 6; high--) {
        let run = 0;
        for (let k = 0; k < 5; k++) run |= 1 << (high - k);
        if (mask === run) {
          straightHigh = high;
          break;
        }
      }
  }
  const shape = [...tally.values()].sort((a, b) => b - a).join("");
  let category: number;
  if (straightHigh && flush) category = straightHigh === 14 ? 9 : 8;
  else if (shape === "41") category = 7;
  else if (shape === "32") category = 6;
  else if (flush) category = 5;
  else if (straightHigh) category = 4;
  else if (shape === "311") category = 3;
  else if (shape === "221") category = 2;
  else if (shape === "2111") category = 1;
  else category = 0;
  if (category === 4 || category === 8 || category === 9)
    return [category, straightHigh];
  const groups = [...tally.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  return [category, ...groups.map(([r]) => r)];
}

/** Lexicographic sign over the full key length; a short key pads with 0. */
function referenceCompare(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const sameKey = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe("rankHand and handStrength, exhaustively", () => {
  it("agrees with an independent reference on all 2,598,960 five-card hands", () => {
    const census: Record<string, number> = {};
    let hands = 0;
    let categoryMismatch = 0;
    let keyMismatch = 0;
    const examples: string[] = [];
    const hand = [0, 0, 0, 0, 0];
    for (hand[0] = 0; hand[0] < 48; hand[0]++)
      for (hand[1] = hand[0] + 1; hand[1] < 49; hand[1]++)
        for (hand[2] = hand[1] + 1; hand[2] < 50; hand[2]++)
          for (hand[3] = hand[2] + 1; hand[3] < 51; hand[3]++)
            for (hand[4] = hand[3] + 1; hand[4] < 52; hand[4]++) {
              hands++;
              const expected = referenceKey(hand);
              const name = CATEGORIES[expected[0]];
              census[name] = (census[name] ?? 0) + 1;
              if (rankHand(hand) !== name) {
                categoryMismatch++;
                if (examples.length < 5)
                  examples.push(
                    `${JSON.stringify(hand)} impl=${rankHand(hand)} ref=${name}`,
                  );
              }
              if (!sameKey(handStrength(hand), expected)) {
                keyMismatch++;
                if (examples.length < 10)
                  examples.push(
                    `${JSON.stringify(hand)} key impl=${JSON.stringify(handStrength(hand))} ref=${JSON.stringify(expected)}`,
                  );
              }
            }
    // Denominator first: the loop, then the reference, then the verdict.
    expect(hands).toBe(2598960);
    expect(census).toEqual(TEXTBOOK);
    expect(
      categoryMismatch,
      `category mismatches: ${examples.join(" | ")}`,
    ).toBe(0);
    expect(
      keyMismatch,
      `strength-key mismatches: ${examples.join(" | ")}`,
    ).toBe(0);
  }, 60000);

  it("orders the cases most likely to be got wrong", () => {
    const S = (r: number) => r - 2; // spades, rank 2..14 -> card 0..12
    const H = (r: number) => 13 + r - 2;
    const wheel = [S(14), S(2), S(3), S(4), S(5)].map((c, i) =>
      i === 0 ? H(14) : c,
    ); // A♥2♠3♠4♠5♠
    const wheelFlush = [S(14), S(2), S(3), S(4), S(5)];
    const sixHigh = [H(2), S(3), S(4), S(5), S(6)];
    const aceHigh = [H(10), S(11), S(12), S(13), S(14)];
    const royal = [S(10), S(11), S(12), S(13), S(14)];

    expect(rankHand(wheel)).toBe("Straight");
    expect(rankHand(wheelFlush)).toBe("Straight flush");
    expect(rankHand(sixHigh)).toBe("Straight");
    expect(rankHand(aceHigh)).toBe("Straight");
    expect(rankHand(royal)).toBe("Royal flush");

    // The wheel is the LOWEST straight: its ace plays low, so it must lose to
    // a six-high straight and never win on the ace.
    expect(compareHands(wheel, sixHigh)).toBe(-1);
    expect(compareHands(wheel, aceHigh)).toBe(-1);
    expect(handStrength(wheel)[1]).toBe(5);
    expect(handStrength(wheelFlush)[1]).toBe(5);
    // ...and a wheel straight flush still loses to any higher straight flush.
    expect(compareHands(wheelFlush, [S(3), S(4), S(5), S(6), S(7)])).toBe(-1);

    // Kickers, in order, one position at a time.
    const pairOfKings = (kickers: number[]) => [S(13), H(13), ...kickers];
    expect(
      compareHands(
        pairOfKings([S(12), S(9), S(3)]),
        pairOfKings([S(12), S(9), S(2)]),
      ),
    ).toBe(1);
    expect(
      compareHands(
        pairOfKings([S(12), S(9), S(3)]),
        pairOfKings([S(12), S(8), S(7)]),
      ),
    ).toBe(1);
    // ...and a later kicker never outranks an earlier one: an ace in the third
    // kicker slot loses to a nine in the second.
    expect(
      compareHands(
        pairOfKings([S(12), S(9), S(3)]),
        pairOfKings([S(12), S(8), S(14)]),
      ),
    ).toBe(-1);
    // Identical ranks in different suits are an exact tie, not a suit ranking.
    expect(
      compareHands(
        [S(13), H(13), S(12), S(9), S(3)],
        [13 * 2 + 11, 13 * 3 + 11, 13 * 2 + 10, 13 * 2 + 7, 13 * 2 + 1],
      ),
    ).toBe(0);
    // Two pair reads high pair, low pair, then kicker — in that order.
    expect(
      compareHands(
        [S(13), H(13), S(4), H(4), S(9)],
        [S(12), H(12), S(11), H(11), S(14)],
      ),
    ).toBe(1);
    expect(
      compareHands(
        [S(13), H(13), S(4), H(4), S(9)],
        [S(13), H(13), S(3), H(3), S(14)],
      ),
    ).toBe(1);
    // A flush beats a straight; a full house beats both.
    expect(compareHands([S(2), S(4), S(6), S(8), S(10)], sixHigh)).toBe(1);
    expect(
      compareHands(
        [S(5), H(5), 26 + 3, S(9), H(9)],
        [S(2), S(4), S(6), S(8), S(10)],
      ),
    ).toBe(1);
  });

  it("compares hands the same way the reference does, over a large sample", () => {
    // Not exhaustive, and deliberately so: compareHands calls handStrength
    // twice, and 2.6M of those runs 12 seconds on this machine for a function
    // whose own key is already checked exhaustively above. This samples the
    // lexicographic step on top of that, including the duel against the fixed
    // opponent hand that actually decides money.
    const rng = new SeededRng(20260910);
    const seen = new Set<string>();
    let compared = 0;
    let mismatch = 0;
    let beatsOpponent = 0;
    let tiesOpponent = 0;
    const draw = () => {
      const cards: number[] = [];
      while (cards.length < 5) {
        const c = rng.nextInt(52);
        if (!cards.includes(c)) cards.push(c);
      }
      return cards;
    };
    for (let i = 0; i < 60000; i++) {
      const left = draw();
      const right = draw();
      const a = referenceKey(left);
      const b = referenceKey(right);
      seen.add(CATEGORIES[a[0]]);
      if (Math.sign(compareHands(left, right)) !== referenceCompare(a, b))
        mismatch++;
      compared++;
      const duel = Math.sign(compareHands(left, DEAD_MANS_HAND));
      if (duel !== referenceCompare(a, referenceKey(DEAD_MANS_HAND)))
        mismatch++;
      if (duel > 0) beatsOpponent++;
      if (duel === 0) tiesOpponent++;
    }
    expect(compared).toBe(60000);
    expect(mismatch).toBe(0);
    // The sample has to contain the interesting population, or it proved
    // nothing: every ordinary category, plus real wins and real ties against
    // the opponent hand rather than only losses.
    for (const name of [
      "High card",
      "Pair",
      "Two pair",
      "Three of a kind",
      "Straight",
      "Flush",
      "Full house",
    ])
      expect(seen, `category ${name} never sampled`).toContain(name);
    expect(beatsOpponent).toBeGreaterThan(500);
    expect(tiesOpponent).toBeGreaterThan(0);
  }, 30000);
});

describe("bestHand picks the best five of a larger board", () => {
  it("matches a brute-force search over every five-card subset", () => {
    const rng = new SeededRng(4242);
    let boards = 0;
    let mismatch = 0;
    const sizes = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const size = 5 + rng.nextInt(4); // 5..8 cards: C(8,5) = 56 subsets
      const cards: number[] = [];
      while (cards.length < size) {
        const c = rng.nextInt(52);
        if (!cards.includes(c)) cards.push(c);
      }
      sizes.add(size);
      let best: number[] | null = null;
      const pick = (start: number, chosen: number[]) => {
        if (chosen.length === 5) {
          if (
            !best ||
            referenceCompare(referenceKey(chosen), referenceKey(best)) > 0
          )
            best = [...chosen];
          return;
        }
        for (let j = start; j < cards.length; j++)
          pick(j + 1, [...chosen, cards[j]]);
      };
      pick(0, []);
      const got = bestHand(cards);
      boards++;
      if (referenceCompare(referenceKey(got), referenceKey(best!)) !== 0)
        mismatch++;
    }
    expect(boards).toBe(400);
    expect(sizes.size).toBeGreaterThan(1);
    expect(mismatch).toBe(0);
  }, 30000);

  it("rejects a board with duplicates or an impossible card", () => {
    expect(() => bestHand([1, 1, 2, 3, 4])).toThrow(/Invalid visible deck/);
    expect(() => bestHand([1, 2, 3, 4, 52])).toThrow(/Invalid visible deck/);
  });
});

describe("the cards themselves", () => {
  it("deals real cards only: no wild or dust substitution reaches a hand", () => {
    // Worth stating explicitly, because the slot has both a wild and a dust
    // symbol and neither is a poker card: 'dust' marks which CELL turns up a
    // card, and the card is drawn from a real 52-card deck minus the fixed
    // opponent hand. So there is no wild substitution in the poker game to
    // test, and this asserts that absence rather than assuming it.
    const rng = new SeededRng(77);
    let deals = 0;
    for (let i = 0; i < 500; i++) {
      const grid: Grid = Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, row): SymbolId =>
          (r + row) % 3 === 0
            ? "dust"
            : (r + row) % 3 === 1
              ? "wild"
              : "bottle",
        ),
      );
      const held: number[] = [];
      while (held.length < 4) {
        const c = rng.nextInt(52);
        if (!held.includes(c) && !DEAD_MANS_HAND.includes(c)) held.push(c);
      }
      const state = {
        poker: { cards: held, bet: 100 },
      } as unknown as import("../src/engine/types").GameState;
      const { poker, cardFaces } = settleBoard(grid, 100, rng, state);
      deals++;
      const faces = Object.values(cardFaces);
      expect(new Set(faces).size).toBe(faces.length);
      for (const card of faces) {
        expect(Number.isInteger(card)).toBe(true);
        expect(card).toBeGreaterThanOrEqual(0);
        expect(card).toBeLessThan(52);
        expect(DEAD_MANS_HAND).not.toContain(card);
        expect(held).not.toContain(card);
      }
      expect(poker!.cards).toHaveLength(5);
      expect(new Set(poker!.cards).size).toBe(5);
      expect(rankHand(poker!.cards)).toBe(
        CATEGORIES[referenceKey(poker!.cards)[0]],
      );
    }
    expect(deals).toBe(500);
  });
});
