#!/usr/bin/env node
/**
 * Find the pokerPayScale that makes optimal-strategy RTP hit a target, and
 * report what everyone else actually gets.
 *
 * Dan, 10 Sep 2026: "we should allow the swing and build it into our math,"
 * then: "because of the optimal strategy required, you can safely put the
 * slot at 99.5% payout and it will still make a fortune." That is exactly
 * how full-pay video poker is priced: the number on the machine assumes
 * exact optimal play, and almost nobody plays exactly optimally, so the
 * house edge lives in the gap between the posted number and what a typical
 * player actually sees.
 *
 * The enumeration and the idealized RTP formula live in
 * src/engine/poker-strategy-math.ts, shared with rtp-check.ts. What this
 * script adds is the independent cross-check and the bisection.
 *
 * The tower property of expectation gives a free cross-check almost nobody
 * gets: averaging each holding's own 43-completion average over all 178,365
 * holdings must equal the unconditional average over every 5-card hand,
 * exactly, not approximately. This computes that second quantity directly,
 * via a complete C(47,5) enumeration sharing nothing with the shared module
 * except compareHands/rankHand themselves.
 *
 * What none of this models, and why the bisected answer here is a starting
 * point rather than the final one: it assumes every hand's five-card cycle
 * runs entirely at 'noon'. A witching hour can begin mid-hand and lock the
 * wager to whatever was in play when it started, which can swallow the one
 * spin an informed raise would have landed on. Measured once: this script's
 * closed-form 99.5% target needed pokerPayScale 3.342, but the real engine
 * under the same informed strategy (scripts/simulate-optimal.ts) returned
 * 91.9% at that value — 7.6 points short, from witching alone. Treat this
 * script's output as the fast, cross-validated starting guess for a
 * bisection against simulate-optimal.ts, which runs the real engine and is
 * the authority on the final number.
 *
 *   node scripts/poker-strategy.ts             # report at current pokerPayScale
 *   node scripts/poker-strategy.ts 99.5        # bisect to hit this optimal RTP (idealized)
 */
import { DEAD_MANS_HAND, POKER_PAYS } from "../src/engine/poker";
import { CONFIG } from "../src/engine/config";
import {
  allHoldingValues,
  flatPokerRtp,
  idealizedOptimalRtp,
  meanBaseCompletionValue,
} from "../src/engine/poker-strategy-math";

const target = process.argv[2] ? Number(process.argv[2]) : null;
/** Ways + gold return per unit bet, independent of poker; from `npm run rtp`. */
const wgReturnFraction = Number(process.argv[3] || 0.71276);
const minMaxRatio = CONFIG.bets.at(-1)! / CONFIG.bets[0];

console.log("enumerating C(47,4) holdings and their completion values...");
const { holdings } = allHoldingValues();
console.log(`${holdings.length.toLocaleString()} holdings`);
const meanBaseEV = meanBaseCompletionValue();

console.log("cross-checking against a direct C(47,5) enumeration...");
{
  const pool: number[] = [];
  for (let c = 0; c < 52; c++) if (!DEAD_MANS_HAND.includes(c)) pool.push(c);
  const { compareHands } = await import("../src/engine/poker");
  const { rankHand } = await import("../src/engine/legacy/poker-v12");
  let total = 0,
    count = 0;
  const n = pool.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const hand = [pool[a], pool[b], pool[c], pool[d], pool[e]];
            if (compareHands(hand, DEAD_MANS_HAND) > 0)
              total += POKER_PAYS[rankHand(hand)];
            count++;
          }
  const direct = total / count;
  const expectedCombos = (holdings.length * 43) / 5;
  if (count !== expectedCombos) {
    console.error(`Cross-check combo count mismatch: ${count} vs expected ${expectedCombos}.`);
    process.exit(1);
  }
  if (Math.abs(direct - meanBaseEV) > 1e-9) {
    console.error(
      `Cross-check FAILED: direct C(47,5) average is ${direct}, but the shared module's ` +
        `per-holding average gives ${meanBaseEV}. These must be identical by the tower ` +
        `property. Do not trust anything below.`,
    );
    process.exit(1);
  }
  console.log(`  agree exactly: ${direct} (direct) === ${meanBaseEV} (shared module)\n`);
}
console.log(`mean unscaled completion value: ${meanBaseEV.toFixed(6)}\n`);

if (target === null) {
  const cur = idealizedOptimalRtp(CONFIG.pokerPayScale, wgReturnFraction, minMaxRatio);
  console.log(`at current pokerPayScale = ${CONFIG.pokerPayScale}:`);
  console.log(`  flat/naive RTP     (poker share, base game): ${(flatPokerRtp(CONFIG.pokerPayScale) * 100).toFixed(3)}%`);
  console.log(`  idealized optimal-strategy RTP (base game):  ${cur.rtp.toFixed(3)}%`);
  console.log(`  share of 4-card holdings worth raising on:   ${(cur.raiseShare * 100).toFixed(1)}%`);
  process.exit(0);
}

// idealizedOptimalRtp is monotone increasing in pokerPayScale.
let low = 0.1,
  high = 200;
for (let i = 0; i < 60; i++) {
  const mid = (low + high) / 2;
  if (idealizedOptimalRtp(mid, wgReturnFraction, minMaxRatio).rtp < target) low = mid;
  else high = mid;
}
const scale = (low + high) / 2;
const opt = idealizedOptimalRtp(scale, wgReturnFraction, minMaxRatio);
console.log(`pokerPayScale = ${scale.toFixed(5)}  ->  idealized optimal RTP = ${opt.rtp.toFixed(4)}%  (target ${target}%)`);
console.log(`  raise-worthy share of 4-card holdings: ${(opt.raiseShare * 100).toFixed(2)}%`);
console.log(`  royal flush would pay: ${(POKER_PAYS["Royal flush"] * scale).toFixed(1)}x bet`);
console.log(`\nThis is the starting guess. Confirm and adjust against the real engine:`);
console.log(`  node scripts/simulate-optimal.ts 2000000 42`);
