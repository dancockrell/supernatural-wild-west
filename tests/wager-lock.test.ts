import { describe, expect, it } from "vitest";
import { initialState, resolveSpin } from "../src/engine/engine";
import { CONFIG } from "../src/engine/config";
import { POKER_PAYS } from "../src/engine/poker";
import { RecordingRng, ReplayRng, SeededRng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";

/**
 * The poker hand is dealt one card per spin, and settleBoard pays the
 * COMPLETING spin's bet, not whatever the hand opened on. So a player who
 * watches four cards build up knows the exact pool the fifth is drawn from —
 * the deck minus the fixed opponent hand minus the four showing — and can
 * price that spin's raise as real arithmetic, not a guess.
 *
 * This file used to test the opposite: a line in the engine that threw
 * "Wager is locked until the hand resolves" the moment a bet differed from
 * the hand's opening one. Dan reversed that on 10 Sep 2026: "no, we should
 * allow the swing and build it into our math" — the same shape as full-pay
 * video poker, which prices exact optimal strategy into its posted return
 * instead of preventing a player from playing it. See
 * src/engine/poker-completion.ts and src/engine/optimal-strategy.ts for the
 * pricing; this file tests only that the swing itself works correctly.
 */

/** Spin until the hand has exactly four cards, or give up saying so. */
function untilFourHeld(bet: number, seed: number, limit = 400) {
  const rng = new SeededRng(seed);
  let state = initialState();
  for (let i = 0; i < limit; i++) {
    state = resolveSpin(state, bet, rng, `spin-${i}`).state;
    if (state.poker?.cards.length === 4) return { state, spins: i + 1 };
  }
  return { state: null as GameState | null, spins: limit };
}

describe("the wager is free to move once the cards are showing", () => {
  it("allows a raise while a hand is part-dealt", () => {
    const low = CONFIG.bets[0];
    const high = CONFIG.bets.at(-1)!;
    expect(high).toBeGreaterThan(low);
    const { state, spins } = untilFourHeld(low, 7);
    expect(state, `no part-dealt hand in ${spins} spins; this test checked nothing`).not.toBeNull();
    expect(state!.poker!.cards.length).toBeGreaterThan(0);
    expect(() =>
      resolveSpin(state!, high, new SeededRng(99), "raise"),
    ).not.toThrow();
  });

  it("allows a reduction just as freely, so the swing is not one-sided", () => {
    const mid = CONFIG.bets[2];
    const low = CONFIG.bets[0];
    const { state } = untilFourHeld(mid, 7);
    expect(state).not.toBeNull();
    expect(() =>
      resolveSpin(state!, low, new SeededRng(99), "duck"),
    ).not.toThrow();
  });

  it("still refuses a bet that is not on the table's own list", () => {
    // The swing is a range of legal bets, not "any number." An off-menu
    // value must still fail, on this spin exactly as on any other.
    const { state } = untilFourHeld(CONFIG.bets[1], 7);
    expect(state).not.toBeNull();
    expect(() =>
      resolveSpin(state!, 37, new SeededRng(99), "off-menu"),
    ).toThrow(/Invalid bet/);
  });

  it("pays the completing spin at THAT spin's bet, not the hand's opening one", () => {
    // The correctness property the whole pricing model depends on. If this
    // were wrong — if the payout used the opening bet, or an average, or
    // anything other than the bet actually placed on the winning spin — the
    // exact-arithmetic pricing in optimal-strategy.ts would be pricing the
    // wrong game. Found by search: outer seed 1 reaches four held cards;
    // completing seed 1 finishes that hand as a real win (Pair, 28 credits
    // at the table minimum), still at 'noon' with no bonus/witching event
    // riding along to complicate the comparison.
    const opened = untilFourHeld(CONFIG.bets[0], 1);
    expect(opened.state).not.toBeNull();
    const fourCards = opened.state!;

    const recorder = new RecordingRng(new SeededRng(1));
    const atLow = resolveSpin(fourCards, CONFIG.bets[0], recorder, "complete-low");
    expect(atLow.poker?.complete).toBe(true);
    expect(atLow.poker?.amount).toBeGreaterThan(0);
    expect(atLow.phase).toBe("noon");

    // Replay the identical RNG draws — same grid, same fifth card, same
    // hand — with a different bet. Nothing about which cards land or what
    // rank results can change; only the bet did.
    const replay = new ReplayRng(recorder.draws);
    const high = CONFIG.bets.at(-1)!;
    const atHigh = resolveSpin(fourCards, high, replay, "complete-high");
    replay.assertConsumed();

    expect(atHigh.poker?.rank).toBe(atLow.poker?.rank);
    expect(atHigh.poker?.cards).toEqual(atLow.poker?.cards);

    // The expected amount is derived the same way settleBoard derives it —
    // from the rank and the bet actually placed on this spin — not by
    // rescaling atLow's already-floored result. Reconstructing it from a
    // floored number double-truncates: an early version of this test
    // asserted `Math.floor(atLow.amount * ratio)` and got 150 where the
    // real, freshly-computed answer is 152, because flooring at the low bet
    // (6.092 -> 6) throws away 0.092 units that the high-bet computation
    // never had to round away in the first place.
    const rawMultiple = Math.round(
      POKER_PAYS[atLow.poker!.rank] * CONFIG.pokerPayScale * 10000,
    );
    expect(atLow.poker?.amount).toBe(
      Math.floor((CONFIG.bets[0] * rawMultiple) / 10000),
    );
    expect(atHigh.poker?.amount).toBe(Math.floor((high * rawMultiple) / 10000));
    // And it is a real difference, not a coincidence of rounding.
    expect(atHigh.poker!.amount).toBeGreaterThan(atLow.poker!.amount);
  });

  it("allows every bet exactly when no hand is in progress", () => {
    let state = initialState();
    expect(state.poker!.cards.length).toBe(0);
    for (const bet of CONFIG.bets) {
      expect(() =>
        resolveSpin(state, bet, new SeededRng(bet), `open-${bet}`),
      ).not.toThrow();
    }
  });
});
