import { compareHands, DEAD_MANS_HAND, POKER_PAYS } from "./poker";
import { CONFIG } from "./config";
import { rankHand } from "./legacy/poker-v12";

/**
 * The exact math behind "adjust your bet on what the cards show you."
 *
 * The poker hand is dealt one card per spin, four spins of build-up then a
 * fifth that completes it, and each spin's bet is independent — settleBoard
 * pays the COMPLETING spin's bet, not whatever was wagered when the hand
 * opened. So a player who watches the hand build and raises only on the
 * spin that finishes it has real information a flat bettor does not: the
 * exact four held cards, and therefore the exact probability distribution
 * of what the fifth one will do.
 *
 * This is not a bug to be patched, per Dan's direction (10 Sep 2026): "we
 * should allow the swing and build it into our math." It is the same shape
 * as full-pay video poker, where the return figure a machine advertises
 * assumes exact optimal play and most players never play anywhere near it.
 * The gap between the two is where the house edge actually lives.
 *
 * Every function here is pure and this module has no dependency on RNG or
 * game state beyond the four (or fewer) known cards, so it is exactly as
 * testable as any other piece of arithmetic.
 */

/** Legal next cards: not the fixed opponent hand, not already held. */
export function remainingPool(held: readonly number[]): number[] {
  const excluded = new Set([...DEAD_MANS_HAND, ...held]);
  const pool: number[] = [];
  for (let c = 0; c < 52; c++) if (!excluded.has(c)) pool.push(c);
  return pool;
}

/**
 * Average POKER_PAYS units (unscaled by pokerPayScale) over every legal
 * completion of a four-card hand — the number a player could, in principle,
 * compute in their head from the four cards already showing.
 *
 * Deliberately unscaled: `pokerPayScale` is a tuning knob this function does
 * not know about, so the same held-hand table is valid before and after any
 * retune. Multiply by `CONFIG.pokerPayScale` for an actual payout multiple.
 *
 * O(43): fast enough to call once per spin at runtime, which is the whole
 * point — a real player is doing this arithmetic (or an approximation of
 * it) in their head, and the game should not know something they could not.
 */
export function fourCardCompletionValue(held: readonly number[]): number {
  if (held.length !== 4)
    throw new Error(
      `fourCardCompletionValue needs exactly 4 held cards, got ${held.length}`,
    );
  if (new Set(held).size !== 4)
    throw new Error("Held cards must be distinct");
  const pool = remainingPool(held);
  let total = 0;
  for (const next of pool) {
    const hand = [...held, next];
    if (compareHands(hand, DEAD_MANS_HAND) > 0) {
      total += POKER_PAYS[rankHand(hand)];
    }
  }
  return total / pool.length;
}

/**
 * Whether raising on this held hand beats the table's own edge on the rest
 * of the spin. `wgReturnFraction` is the ways+gold return per unit bet,
 * measured independently of poker (see `npm run rtp`) — raising only pays
 * off if the poker upside on THIS specific hand outweighs the extra ways/gold
 * exposure the larger bet also buys, which is lost at the same rate whether
 * or not this happens to be the hand's last card.
 */
export function isRaiseWorthy(
  held: readonly number[],
  wgReturnFraction: number,
): boolean {
  const threshold = 1 - wgReturnFraction;
  return fourCardCompletionValue(held) * CONFIG.pokerPayScale > threshold;
}
