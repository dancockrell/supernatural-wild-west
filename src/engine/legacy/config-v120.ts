import { POKER_PAYS } from "./poker-v12";
import { REGULAR, type SymbolId, type Regular } from "../types";
// Integer virtual strips. Each visible cell uses an independent weighted stop.
const weights: [SymbolId, number][] = [
  ["gunslinger", 8],
  ["medium", 9],
  ["queen", 10],
  ["preacher", 11],
  ["rider", 7],
  ["ace", 14],
  ["king", 14],
  ["horseshoe", 14],
  ["bottle", 14],
  ["wild", 1],
  ["dust", 32],
];
const strip = weights.flatMap(([s, n]) => Array<SymbolId>(n).fill(s));
export const CONFIG = {
  version: "dd-1.2.0",
  schemaVersion: 1 as const,
  rows: 4,
  reels: 5,
  bets: [20, 50, 100, 200, 500],
  initialBalance: 100000,
  maxExposure: 10000,
  scatterPerReel: 940,
  probabilityDenominator: 10000,
  witchDuration: 6,
  freeSpins: 8,
  retriggerSpins: 2,
  maxFreeSpins: 32,
  awakenChance: 900,
  bonusAwakenChance: 1800,
  // Basis points of TOTAL wager, per way. Adjust only through versioned tuning.
  paytable: Object.fromEntries(
    REGULAR.map((s, i) => [
      s,
      (i < 5
        ? [180, 650, 9600].map((n) => Math.round(n * (1.7 - i * 0.13)))
        : [90, 300, 4000]
      ).map((n) => Math.round(n * 14.125)),
    ]),
  ) as Record<Regular, number[]>,
  payoutScale: 0.36,
  strips: Array.from({ length: 5 }, (_, i) => [
    ...strip.slice(i * 9),
    ...strip.slice(0, i * 9),
  ]),
};
export function publicConfig() {
  return {
    version: CONFIG.version,
    bets: CONFIG.bets,
    paytable: CONFIG.paytable,
    payoutScale: CONFIG.payoutScale,
    maxExposure: CONFIG.maxExposure,
    pokerPays: POKER_PAYS,
  };
}
