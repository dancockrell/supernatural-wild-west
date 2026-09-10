#!/usr/bin/env node
/**
 * Return to player, with the rare events computed rather than sampled.
 *
 * Why this exists. `npm run simulate` reports a single number and that number
 * cannot settle the question, because one prize dominates its variance: the
 * Gold Rush pays 10000x at 1 in 1,000,000, so a million-spin run sees it zero
 * times or twice and the answer swings by a point either way. Measured across
 * five runs of the existing simulator, the stable parts barely move and the
 * gold part moves tenfold:
 *
 *     seed 1337  1M   ways 71.184  poker 24.191  gold 0.234   -> 95.610
 *     seed   42  1M   ways 71.053  poker 24.726  gold 0.242   -> 96.022
 *     seed    7  1M   ways 71.592  poker 24.435  gold 0.243   -> 96.270
 *     seed 2026  5M   ways 71.221  poker 24.426  gold 2.648   -> 98.295
 *
 * Tuning the paytable against any one of those means tuning against how many
 * jackpots that seed happened to roll. So: sample the high-frequency parts,
 * where a million spins is plenty, and do the arithmetic for the rest.
 *
 * Since 10 Sep 2026 this reports TWO RTPs, not one. The poker hand is dealt
 * one card per spin and the payout uses the completing spin's bet, so a
 * player who raises once four cards are showing is pricing exact
 * arithmetic — see src/engine/optimal-strategy.ts. "Flat" is what a player
 * who never adjusts their bet actually sees; "optimal-strategy" is the
 * number that's meant to be advertised, the way full-pay video poker posts
 * a return that assumes exact optimal play. Only ways+gold, the part
 * neither number touches, is gated here; the gap between the other two is
 * deliberate, not a target to close.
 *
 *   node scripts/rtp-check.ts           # 1M spins, seed 42
 *   node scripts/rtp-check.ts 2000000 7
 */
import { CONFIG } from '../src/engine/config';
import { simulate } from '../src/engine/simulation';
import { idealizedOptimalRtp } from '../src/engine/poker-strategy-math';

const spins = Number(process.argv[2] || 1_000_000);
const seed = Number(process.argv[3] || 42);

/* ----------------------------------------------------- the computed part --- */

/** Every symbol's share of one reel strip. Cells stop independently. */
const stripLength = CONFIG.strips[0].length;
const goldCells = CONFIG.strips[0].filter((s) => s === 'gold').length;
const pGoldCell = goldCells / stripLength;

/**
 * Gold Rush: the whole screen turns gold on its own roll, not by landing 25
 * gold symbols. One in `goldRushDenominator`, paying `goldScreenPay`.
 */
const pGoldRush = 1 / CONFIG.goldRushDenominator;
const goldRushRtp = pGoldRush * CONFIG.goldScreenPay;

/**
 * Natural gold lines: 5 rows, 5 reels and the 2 diagonals, each needing five
 * gold cells. Independent stops, so it is just p^5 per line.
 *
 * Gold Rush spins are excluded: they fill the board and are already counted
 * above, and their full-screen prize replaces the line prize rather than
 * adding to it.
 */
const GOLD_LINES = 12;
const pGoldLine = pGoldCell ** CONFIG.reels;
const goldLineRtp = (1 - pGoldRush) * GOLD_LINES * pGoldLine * CONFIG.goldLinePay;

const goldRtp = 100 * (goldRushRtp + goldLineRtp);

/* ------------------------------------------------------ the sampled part --- */

const run = simulate(spins, seed);
const waysReturned = run.returned - run.goldReturned - run.pokerReturned;
const waysRtp = (100 * waysReturned) / run.wagered;
const pokerRtp = run.pokerRtp;
const wgRtp = waysRtp + goldRtp;

const flatTotal = waysRtp + pokerRtp + goldRtp;

/* ------------------------------------------------------------- reporting --- */

const pct = (n: number) => `${n.toFixed(3)}%`;
console.log(`config ${run.configVersion}   ${spins.toLocaleString()} spins, seed ${seed}\n`);
console.log(`  ways   (sampled)   ${pct(waysRtp).padStart(9)}`);
console.log(`  poker  (sampled)   ${pct(pokerRtp).padStart(9)}`);
console.log(`  gold   (computed)  ${pct(goldRtp).padStart(9)}`);
console.log(`    gold rush        ${pct(100 * goldRushRtp).padStart(9)}   1 in ${CONFIG.goldRushDenominator.toLocaleString()} at ${CONFIG.goldScreenPay}x`);
console.log(`    gold lines       ${pct(100 * goldLineRtp).padStart(9)}   ${GOLD_LINES} lines, p(cell)=${pGoldCell.toFixed(5)}`);
console.log(`  ${'-'.repeat(30)}`);
console.log(`  ways + gold        ${pct(wgRtp).padStart(9)}   the stable base game, unaffected by poker strategy`);
console.log(`  hit rate           ${pct(run.hitRate).padStart(9)}   target ${pct(run.targets.hitRate)}`);
console.log(
  `  bonus              ${run.bonusOneIn === null ? 'never triggered' : `1 in ${run.bonusOneIn.toFixed(1)}`}   target 1 in ${run.targets.bonusOneIn}`,
);

/**
 * Two RTPs, deliberately, since 10 Sep 2026 (Dan: "we should allow the swing
 * and build it into our math" / "you can safely put the slot at 99.5%
 * payout"). The poker hand is dealt one card per spin and the payout uses
 * the completing spin's bet, so a player who raises once four cards are
 * showing is pricing exact arithmetic, not exploiting an oversight — see
 * src/engine/optimal-strategy.ts. This is not one number any more.
 */
console.log(`\n  flat RTP (never adjusts the bet):      ${pct(flatTotal)}`);
const idealized = idealizedOptimalRtp(
  CONFIG.pokerPayScale,
  wgRtp / 100,
  CONFIG.bets.at(-1)! / CONFIG.bets[0],
);
console.log(`  idealized optimal-strategy RTP:        ${pct(idealized.rtp)}   (base-game-only upper bound — see below)`);
console.log(`  measured optimal-strategy RTP:          ~99.5%   (real engine, six seeds at 1.5M spins: 98.37-100.80, mean 99.55 — see scripts/simulate-optimal.ts)`);
console.log(`\n  The idealized figure is expected to run well above 99.5%, not near it: it`);
console.log(`  assumes every hand's decisive spin happens at 'noon' with the bet fully`);
console.log(`  free, but a witching hour can lock the wager before that spin arrives and`);
console.log(`  swallow the raise. pokerPayScale is calibrated against the real engine`);
console.log(`  (measured, above), which is authoritative; the idealized number here is`);
console.log(`  a live sanity check that the constant hasn't drifted, not a target.`);
console.log(`\n  The flat number is not a target to hit. It is what a player who never`);
console.log(`  raises actually sees, and it is meant to be well below 99.5% — that gap`);
console.log(`  is the whole point of pricing the swing instead of locking it.`);

/**
 * ways+gold is the piece this script still owns a target for: it is
 * unaffected by the poker redesign, and a real regression there (a wrong
 * paytable, a reel-strip typo) should still fail loudly. The band is the
 * same 0.7 measured at three million spins across four seeds for the old
 * all-flat design (96.260, 95.946, 96.115, 95.558 minus their poker share);
 * ways+gold hasn't changed since, so the same tolerance applies.
 */
const WG_TARGET = 71.276;
const TOLERANCE = 0.7;
const off = wgRtp - WG_TARGET;
console.log(`\n  ways+gold off its own target by ${off >= 0 ? '+' : ''}${off.toFixed(3)} points (target ${WG_TARGET}%, tolerance ${TOLERANCE})`);

if (run.paidSpins < 500_000) {
  console.error('\nFewer than 500,000 paid spins: the sampled half is too noisy to conclude anything.');
  process.exit(2);
}
if (Math.abs(off) > TOLERANCE) {
  const scale = (WG_TARGET - goldRtp) / (waysRtp / CONFIG.payoutScale);
  console.error(`\nFAIL: ways+gold drifted from its own target — a regression, not the poker redesign.`);
  console.error(`      payoutScale ${CONFIG.payoutScale} -> ${scale.toFixed(5)} would land it.`);
  process.exit(1);
}
console.log('\nOK: ways+gold within tolerance. (Poker/flat/optimal are reported above, not gated here.)');
