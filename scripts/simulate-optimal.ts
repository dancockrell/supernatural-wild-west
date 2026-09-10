#!/usr/bin/env node
/**
 * Measure the game the way an informed player actually plays it: table
 * minimum every spin except the one where four cards are showing and the
 * fifth is worth chasing, where the bet goes to the table maximum.
 *
 * This runs the real engine — `resolveSpin`, unmodified — so every phase
 * interaction (bonus, witching, retriggers, the exposure cap) plays out
 * exactly as it does for any other player. The only difference from
 * `scripts/simulate.ts` is which bet gets passed in on each call.
 *
 * Two locks the harness has to respect, both already in the engine and
 * neither related to the poker swing:
 *
 *   - `witching`: the wager is fixed to whatever was in play when the hour
 *     began, and a different value throws. So the harness carries forward
 *     the last bet chosen at `noon` for the length of the witching hour.
 *   - `bonus`: the engine ignores whatever is passed and charges `bonusBet`,
 *     the bet locked in when the free spins started. Any legal value works;
 *     the harness uses the table minimum for simplicity.
 *
 * The gold jackpot is subtracted from the sampled total and replaced with
 * its exact expected value, for the same reason `rtp-check.ts` does that:
 * it pays 10000x at 1 in 1,000,000, so a few-million-spin run sees it zero
 * or a handful of times and that alone can move the headline number by a
 * point. Informed betting does not change the jackpot's odds (it fires
 * independently of any bet decision), only how much a given firing pays
 * out — and since the harness bets the table minimum on all but a small,
 * computable share of spins, that effect is already tiny and is left in the
 * sampled total rather than modelled separately.
 *
 *   node scripts/simulate-optimal.ts 1000000 42
 */
import { initialState, resolveSpin } from "../src/engine/engine";
import { CONFIG } from "../src/engine/config";
import { SeededRng } from "../src/engine/rng";
import { chooseBet } from "../src/engine/optimal-strategy";

const paidSpins = Number(process.argv[2] || 1_000_000);
const seed = Number(process.argv[3] || 42);
/** Ways + gold return per unit bet, independent of poker; from `npm run rtp`. */
const wgReturnFraction = Number(process.argv[4] || 0.71276);

const GOLD_RUSH_RTP = CONFIG.goldScreenPay / CONFIG.goldRushDenominator;
const pGoldCell =
  CONFIG.strips[0].filter((s) => s === "gold").length / CONFIG.strips[0].length;
const GOLD_LINE_RTP =
  (1 - 1 / CONFIG.goldRushDenominator) * 12 * pGoldCell ** CONFIG.reels * CONFIG.goldLinePay;
const GOLD_RTP = GOLD_RUSH_RTP + GOLD_LINE_RTP;

const rng = new SeededRng(seed);
let state = initialState(1_000_000_000_000);
let wagered = 0;
let returnedMinusGold = 0;
let goldReturned = 0;
let paid = 0;
let raises = 0;
let bet = CONFIG.bets[0];

while (paid < paidSpins || state.phase === "bonus") {
  const wasBonus = state.phase === "bonus";
  if (state.phase === "noon") {
    bet = chooseBet(state, wgReturnFraction);
    if (bet === CONFIG.bets.at(-1)) raises++;
  } else if (state.phase === "bonus") {
    bet = CONFIG.bets[0]; // ignored by the engine; bonusBet governs.
  }
  // witching: keep whatever `bet` already holds — the last noon choice.
  const result = resolveSpin(state, bet, rng, String(paid + 1));
  state = result.state;
  if (!wasBonus) {
    paid++;
    wagered += result.debit;
  }
  returnedMinusGold += result.payout - (result.gold?.amount || 0);
  goldReturned += result.gold?.amount || 0;
}

const goldExact = wagered * GOLD_RTP;
const rtp = ((returnedMinusGold + goldExact) / wagered) * 100;
const rtpAsSampled = ((returnedMinusGold + goldReturned) / wagered) * 100;

console.log(`optimal-strategy play, ${paidSpins.toLocaleString()} paid spins, seed ${seed}`);
console.log(`  raised to max on ${raises.toLocaleString()} of ${paid.toLocaleString()} base-game spins (${((100 * raises) / paid).toFixed(2)}%)`);
console.log(`  RTP, gold as sampled:   ${rtpAsSampled.toFixed(3)}%`);
console.log(`  RTP, gold as computed:  ${rtp.toFixed(3)}%   <- report this one`);
console.log(`  pokerPayScale ${CONFIG.pokerPayScale}   payoutScale ${CONFIG.payoutScale}`);
