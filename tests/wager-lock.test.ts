import { describe, expect, it } from "vitest";
import { initialState, resolveSpin } from "../src/engine/engine";
import { CONFIG } from "../src/engine/config";
import { SeededRng } from "../src/engine/rng";
import type { GameState } from "../src/engine/types";

/**
 * The poker hand builds across spins, so a player watching it accumulate knows
 * something about the next payout that they did not know when the hand started.
 * If they could raise on that knowledge - spin at 20 until four to a royal
 * flush is showing, then complete at 500 - the house edge is gone. Bets here
 * span 20 to 500, so the swing available is 25x.
 *
 * One line in the engine prevents that, and nothing tested it:
 *
 *     if (before.poker?.cards.length && before.poker.bet !== bet)
 *       throw new Error("Wager is locked until the hand resolves");
 *
 * These are the properties that line exists for, rather than assertions about
 * the line itself. Written after Dan pointed out that players can adjust their
 * bet on current information about the cards.
 */

/** Spin until the hand has cards but has not resolved, or give up saying so. */
function untilHandInProgress(bet: number, seed: number, limit = 400) {
  const rng = new SeededRng(seed);
  let state = initialState();
  for (let i = 0; i < limit; i++) {
    const result = resolveSpin(state, bet, rng, `spin-${i}`);
    state = result.state;
    if (state.poker?.cards.length && state.poker.cards.length < 5) {
      return { state, spins: i + 1 };
    }
  }
  return { state: null as GameState | null, spins: limit };
}

describe("the wager cannot move once the cards are showing", () => {
  it("refuses a raise while a hand is part-dealt", () => {
    const low = CONFIG.bets[0];
    const high = CONFIG.bets.at(-1)!;
    expect(high).toBeGreaterThan(low);

    const { state, spins } = untilHandInProgress(low, 7);
    // Denominator: if no seed ever reaches a part-dealt hand this test proves
    // nothing, and must say so rather than passing on an absence.
    expect(state, `no part-dealt hand in ${spins} spins; this test checked nothing`).not.toBeNull();
    expect(state!.poker!.cards.length).toBeGreaterThan(0);

    const rng = new SeededRng(99);
    expect(() => resolveSpin(state!, high, rng, "raise")).toThrow(
      /locked until the hand resolves/,
    );
  });

  it("refuses a reduction just as firmly, so the lock is not one-sided", () => {
    const low = CONFIG.bets[0];
    const mid = CONFIG.bets[2];
    const { state } = untilHandInProgress(mid, 7);
    expect(state).not.toBeNull();
    const rng = new SeededRng(99);
    expect(() => resolveSpin(state!, low, rng, "duck")).toThrow(
      /locked until the hand resolves/,
    );
  });

  it("allows every other bet exactly when no hand is in progress", () => {
    // The lock must not become a general freeze: with no cards showing, the
    // player is free to size their bet however they like.
    let state = initialState();
    expect(state.poker!.cards.length).toBe(0);
    for (const bet of CONFIG.bets) {
      const rng = new SeededRng(bet);
      expect(() => resolveSpin(state, bet, rng, `open-${bet}`)).not.toThrow();
    }
  });

  it("continues the hand at the wager it was opened on", () => {
    const bet = CONFIG.bets[1];
    const { state } = untilHandInProgress(bet, 7);
    expect(state).not.toBeNull();
    const rng = new SeededRng(1234);
    expect(() => resolveSpin(state!, bet, rng, "continue")).not.toThrow();
  });

  it("releases once the hand resolves, so the player is not frozen at one bet", () => {
    // A lock that never lets go is its own bug. Measured over 3000 spins at one
    // bet, cards are showing on about 80% of them and the hand clears about 599
    // times, so a player spends most of the session locked and the release path
    // is the one that gives their bet back.
    const opening = CONFIG.bets[1];
    const rng = new SeededRng(7);
    let state = initialState();
    let released = 0;
    let hadCards = false;
    for (let i = 0; i < 600 && released === 0; i++) {
      state = resolveSpin(state, opening, rng, `run-${i}`).state;
      const showing = (state.poker?.cards.length ?? 0) > 0;
      if (hadCards && !showing) released++;
      hadCards = showing;
    }
    expect(released, "no hand ever resolved, so the release path was never reached").toBe(1);
    // With the table clear, any other bet is allowed again.
    const other = CONFIG.bets.at(-1)!;
    expect(() => resolveSpin(state, other, new SeededRng(5), "after")).not.toThrow();
  });

  it("records the opening wager on the hand, which is what the lock compares", () => {
    const bet = CONFIG.bets[3];
    const { state } = untilHandInProgress(bet, 11);
    expect(state).not.toBeNull();
    // If this ever drifts from the bet actually charged, the lock would be
    // comparing against the wrong number and would let a raise through.
    expect(state!.poker!.bet).toBe(bet);
  });
});
