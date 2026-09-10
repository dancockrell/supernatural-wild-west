import { CONFIG } from "./config";
import { isRaiseWorthy } from "./poker-completion";
import type { GameState } from "./types";

/**
 * What a fully informed player bets on the next spin.
 *
 * The only spin where the visible cards say anything about the immediate
 * payout is the one where a hand is four cards deep: the fifth card is
 * drawn from a known pool (52 minus the fixed opponent hand minus the four
 * already showing), so its distribution — and therefore this spin's expected
 * poker payout per unit bet — is exact arithmetic, not a guess. At every
 * other moment (0-3 held cards, or no hand in progress) raising buys nothing
 * but more exposure to the ways/gold house edge, so the rational bet there
 * is the table minimum.
 *
 * `wgReturnFraction` is the ways+gold return per unit bet, independent of
 * poker (see `npm run rtp`) — it sets the bar a raise has to clear.
 *
 * This does not run during `witching` (the engine locks the wager to
 * whatever was in play when the hour began, regardless of what this
 * function would otherwise choose) or `bonus` (the bet is fixed to
 * `bonusBet` from when the round started); callers should not invoke it in
 * those phases, and `chooseBet` throws rather than silently returning a
 * number that would be ignored.
 */
export function chooseBet(
  state: Pick<GameState, "phase" | "poker">,
  wgReturnFraction: number,
): number {
  if (state.phase !== "noon")
    throw new Error(
      `chooseBet only applies at 'noon'; the wager is fixed or locked in every other phase (got '${state.phase}')`,
    );
  const minBet = CONFIG.bets[0];
  const maxBet = CONFIG.bets.at(-1)!;
  const held = state.poker?.cards ?? [];
  if (held.length !== 4) return minBet;
  return isRaiseWorthy(held, wgReturnFraction) ? maxBet : minBet;
}
