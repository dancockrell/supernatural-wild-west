import { fourCardCompletionValue } from "./poker-completion";
import { DEAD_MANS_HAND } from "./poker";

/**
 * The exact, enumerated math behind pricing the poker bet-swing — shared by
 * `scripts/poker-strategy.ts` (the tuning CLI) and `scripts/rtp-check.ts`
 * (which reports a fast reference figure alongside the flat baseline), so
 * neither can drift from the other's arithmetic.
 *
 * This is the idealized, base-game-only model: it assumes every hand's
 * five-spin cycle runs entirely at 'noon'. A witching hour beginning
 * mid-hand can lock the wager to whatever was in play when it started,
 * for reasons unrelated to poker, which can swallow the one spin an
 * informed raise would have landed on. That is a real discount on the
 * achievable edge, measured once at about 7.6 points (99.5% idealized vs
 * 91.9% simulated at the same pokerPayScale) — so treat everything here as
 * an upper bound and fast approximation, not the final answer.
 * `scripts/simulate-optimal.ts` runs the real engine and is the authority.
 */

let cachedHoldings: number[][] | null = null;
let cachedBaseEV: number[] | null = null;

function combos4(pool: number[]): number[][] {
  const out: number[][] = [];
  const n = pool.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) out.push([pool[a], pool[b], pool[c], pool[d]]);
  return out;
}

/** All C(47,4) = 178,365 four-card holdings, and their unscaled completion values, ascending. */
export function allHoldingValues(): { holdings: number[][]; baseEV: number[] } {
  if (cachedHoldings && cachedBaseEV)
    return { holdings: cachedHoldings, baseEV: cachedBaseEV };
  const pool: number[] = [];
  for (let c = 0; c < 52; c++) if (!DEAD_MANS_HAND.includes(c)) pool.push(c);
  const holdings = combos4(pool);
  const baseEV = holdings.map((h) => fourCardCompletionValue(h));
  const order = baseEV.map((_, i) => i).sort((a, b) => baseEV[a] - baseEV[b]);
  const sortedHoldings = order.map((i) => holdings[i]);
  const sortedEV = order.map((i) => baseEV[i]);
  cachedHoldings = sortedHoldings;
  cachedBaseEV = sortedEV;
  return { holdings: sortedHoldings, baseEV: sortedEV };
}

export function meanBaseCompletionValue(): number {
  const { baseEV } = allHoldingValues();
  return baseEV.reduce((s, v) => s + v, 0) / baseEV.length;
}

/**
 * Idealized (base-game-only) optimal-strategy RTP at a given pokerPayScale.
 * See the module doc: real achievable RTP runs a few points below this.
 */
export function idealizedOptimalRtp(
  pokerPayScale: number,
  wgReturnFraction: number,
  minMaxRatio: number,
): { rtp: number; raiseShare: number } {
  const { baseEV } = allHoldingValues();
  const threshold = (1 - wgReturnFraction) / pokerPayScale;
  let lo = 0,
    hi = baseEV.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (baseEV[mid] > threshold) hi = mid;
    else lo = mid + 1;
  }
  const cut = lo;
  const n = baseEV.length;
  const raiseCount = n - cut;
  let sumRaise = 0;
  for (let i = cut; i < n; i++) sumRaise += baseEV[i];
  const mean = meanBaseCompletionValue();
  const sumRest = mean * n - sumRaise;
  const minBet = 1;
  const maxBet = minMaxRatio;
  const wagered = 4 * minBet * n + (raiseCount * maxBet + (n - raiseCount) * minBet);
  const pokerReturned = pokerPayScale * (sumRaise * maxBet + sumRest * minBet);
  const wgReturned = wgReturnFraction * wagered;
  return {
    rtp: ((wgReturned + pokerReturned) / wagered) * 100,
    raiseShare: raiseCount / n,
  };
}

/** Flat/naive RTP contribution from poker alone: no bet-sizing edge captured. */
export function flatPokerRtp(pokerPayScale: number): number {
  return (pokerPayScale * meanBaseCompletionValue()) / 5;
}
