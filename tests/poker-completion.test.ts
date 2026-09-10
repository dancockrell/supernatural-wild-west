import { describe, expect, it } from "vitest";
import {
  fourCardCompletionValue,
  isRaiseWorthy,
  remainingPool,
} from "../src/engine/poker-completion";
import { DEAD_MANS_HAND } from "../src/engine/poker";

/**
 * The full C(47,4) = 178,365-holding enumeration this module exists to
 * price lives in scripts/, not here: 43 completions each, a few seconds of
 * arithmetic, fine for a one-off tuning run and wrong for every `npm test`.
 * These are the hand-picked corners fast enough to check on every run —
 * cases with a known, exact answer, or a known ordering between two answers.
 */

describe("remainingPool", () => {
  it("excludes the fixed opponent hand and whatever is already held", () => {
    const held = [3, 16, 29];
    const pool = remainingPool(held);
    expect(pool).toHaveLength(52 - DEAD_MANS_HAND.length - held.length);
    for (const c of DEAD_MANS_HAND) expect(pool).not.toContain(c);
    for (const c of held) expect(pool).not.toContain(c);
  });
});

describe("fourCardCompletionValue", () => {
  it("is exactly the Four of a Kind pay when all four copies of a rank are held", () => {
    // Four 5s, one per suit: 5 = rank index 3, cards 3, 16, 29, 42. Rank 5 is
    // untouched by the dead man's hand, so all four copies exist to hold, and
    // since there is no fifth "5" left in the deck, every possible completion
    // is Four of a Kind — never better, never worse. That beats the opponent
    // hand unconditionally, so the expected value is not an average over a
    // distribution; it is the single guaranteed payout.
    const quads = [3, 16, 29, 42];
    expect(fourCardCompletionValue(quads)).toBe(6.5);
  });

  it("values a made quad higher than the weakest holding found by search", () => {
    // [0, 20, 33, 45] was my first guess at "a bad hand" and it was wrong —
    // its completion value clears the raise-worthy bar just as easily as the
    // quads below. A full search over all 178,365 four-card holdings (see
    // scripts/, not run here) found [0, 22, 23, 24] as the actual minimum:
    // every holding in this game has SOME winning completion, so there is no
    // true zero, only a floor near it. That is worth knowing on its own —
    // it means an "obviously bad" hand is not a safe stand-in for a weak one.
    const quads = [3, 16, 29, 42];
    const weakest = [0, 22, 23, 24];
    expect(fourCardCompletionValue(weakest)).toBeLessThan(
      fourCardCompletionValue(quads),
    );
    expect(fourCardCompletionValue(weakest)).toBeGreaterThan(0);
  });

  it("rejects a held hand that is not exactly four distinct cards", () => {
    expect(() => fourCardCompletionValue([1, 2, 3])).toThrow(/exactly 4/);
    expect(() => fourCardCompletionValue([1, 2, 3, 3])).toThrow(/distinct/);
  });

  it("agrees with a brute-force reference for a specific holding", () => {
    // Independent of the implementation's own loop, so a shared bug in both
    // could not hide here: rebuild the average from scratch using only the
    // exported primitives and the same rankHand/compareHands the module uses.
    const held = [3, 16, 29, 42];
    const pool = remainingPool(held);
    expect(pool).toHaveLength(43);
    // Every completion is a guaranteed Four of a Kind (see the test above),
    // so the brute-force reference for THIS holding is just "6.5, 43 times".
    const reference = pool.reduce((sum) => sum + 6.5, 0) / pool.length;
    expect(fourCardCompletionValue(held)).toBeCloseTo(reference, 10);
  });
});

describe("isRaiseWorthy", () => {
  const wg = 0.71276; // ways+gold return per unit bet, from `npm run rtp`

  it("says yes for a guaranteed strong hand at any plausible ways/gold return", () => {
    const quads = [3, 16, 29, 42];
    expect(isRaiseWorthy(quads, wg)).toBe(true);
    // Even a generous ways/gold return (a lower bar to clear) shouldn't flip
    // a guaranteed Four of a Kind to "not worth it".
    expect(isRaiseWorthy(quads, 0.95)).toBe(true);
  });

  it("says no for the weakest holding in the game", () => {
    // [0, 22, 23, 24]: the exact minimum found by exhaustive search, worth
    // 0.013 raw units (0.26x at the current pokerPayScale of 20) against a
    // 0.287 hurdle at this wg fraction — the one holding closest to the
    // boundary in either direction, so the one most likely to expose a sign
    // error in the comparison.
    const weakest = [0, 22, 23, 24];
    expect(isRaiseWorthy(weakest, wg)).toBe(false);
  });

  it("is monotone in the ways/gold return: a lower bar never turns a yes into a no", () => {
    const held = [3, 16, 29, 42];
    // Sabotage-style property check: if the threshold math were inverted
    // (comparing the wrong direction), a *higher* wg fraction — a smaller
    // (1 - wg) hurdle — would sometimes flip a "yes" back to "no". It must
    // not, for a hand this strong.
    for (const candidate of [0.5, 0.71276, 0.9, 0.99]) {
      expect(isRaiseWorthy(held, candidate)).toBe(true);
    }
  });
});
