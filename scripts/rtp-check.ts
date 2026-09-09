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
 *   node scripts/rtp-check.mjs           # 1M spins, seed 42
 *   node scripts/rtp-check.mjs 2000000 7
 */
import { CONFIG } from '../src/engine/config';
import { simulate } from '../src/engine/simulation';

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

const total = waysRtp + pokerRtp + goldRtp;
const target = run.targets.rtp;

/* ------------------------------------------------------------- reporting --- */

const pct = (n: number) => `${n.toFixed(3)}%`;
console.log(`config ${run.configVersion}   ${spins.toLocaleString()} spins, seed ${seed}\n`);
console.log(`  ways   (sampled)   ${pct(waysRtp).padStart(9)}`);
console.log(`  poker  (sampled)   ${pct(pokerRtp).padStart(9)}`);
console.log(`  gold   (computed)  ${pct(goldRtp).padStart(9)}`);
console.log(`    gold rush        ${pct(100 * goldRushRtp).padStart(9)}   1 in ${CONFIG.goldRushDenominator.toLocaleString()} at ${CONFIG.goldScreenPay}x`);
console.log(`    gold lines       ${pct(100 * goldLineRtp).padStart(9)}   ${GOLD_LINES} lines, p(cell)=${pGoldCell.toFixed(5)}`);
console.log(`  ${'-'.repeat(30)}`);
console.log(`  total              ${pct(total).padStart(9)}   target ${pct(target)}`);
console.log(`  hit rate           ${pct(run.hitRate).padStart(9)}   target ${pct(run.targets.hitRate)}`);
// null when a run drew no bonus at all, which is itself worth seeing rather
// than crashing on or printing as a zero.
console.log(
  `  bonus              ${run.bonusOneIn === null ? 'never triggered' : `1 in ${run.bonusOneIn.toFixed(1)}`}   target 1 in ${run.targets.bonusOneIn}`,
);

/**
 * The sampled half still carries noise, so this is a band, not a point.
 *
 * Measured rather than guessed. At `payoutScale` 0.34541, four seeds at three
 * million spins each returned 96.260, 95.946, 96.115 and 95.558 - mean 95.970,
 * spread 0.70. Tripling the sample from one million barely narrowed that, so
 * the residual is not ordinary sampling error in the ways total; something in
 * the sampled half is still lumpy and I have not isolated which feature. The
 * poker tail is too small to account for it: a royal flush pays 2000x at about
 * 1 in 650,000, worth roughly 0.07 points either way at this sample size.
 *
 * So 0.7 is the honest band for a single run. Treat one reading outside it as
 * a prompt to run more seeds, not as proof the paytable moved, and judge a
 * tuning change on the mean of several rather than on any one number.
 */
const TOLERANCE = 0.7;
const off = total - target;
console.log(`\n  off target by ${off >= 0 ? '+' : ''}${off.toFixed(3)} points (tolerance ${TOLERANCE})`);

if (run.paidSpins < 500_000) {
  console.error('\nFewer than 500,000 paid spins: the sampled half is too noisy to conclude anything.');
  process.exit(2);
}
if (Math.abs(off) > TOLERANCE) {
  const scale = (target - pokerRtp - goldRtp) / (waysRtp / CONFIG.payoutScale);
  console.error(`\nFAIL: RTP is off target.`);
  console.error(`      payoutScale ${CONFIG.payoutScale} -> ${scale.toFixed(5)} would land it.`);
  process.exit(1);
}
console.log('\nOK: within tolerance.');
