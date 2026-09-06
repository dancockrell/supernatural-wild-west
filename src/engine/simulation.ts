import { DEAD_MANS_HAND, POKER_PAYS } from "./poker";
import { initialState, resolveSpin } from "./engine";
import { CONFIG } from "./config";
import { SeededRng } from "./rng";
export function simulate(paidSpins: number, seed = 42) {
  if (!Number.isInteger(paidSpins) || paidSpins < 1 || paidSpins > 10000000)
    throw new Error("Choose 1–10,000,000 paid spins");
  const rng = new SeededRng(seed);
  let state = initialState(1_000_000_000_000);
  let wagered = 0,
    returned = 0,
    pokerReturned = 0,
    goldReturned = 0,
    completedHands = 0,
    paid = 0,
    spins = 0,
    hits = 0,
    netWins = 0,
    duelWins = 0,
    ties = 0,
    bonuses = 0,
    bonusSpins = 0,
    maxRound = 0,
    roundPayout = 0,
    sumSquares = 0;
  const distribution: Record<string, number> = {
    "0x": 0,
    "<1x": 0,
    "1–5x": 0,
    "5–20x": 0,
    "20–100x": 0,
    "100–1000x": 0,
    "1000x+": 0,
  };
  const features: Record<string, number> = {};
  const closeRound = () => {
    const x = roundPayout / 100;
    maxRound = Math.max(maxRound, x);
    sumSquares += x * x;
    const bucket =
      x === 0
        ? "0x"
        : x < 1
          ? "<1x"
          : x < 5
            ? "1–5x"
            : x < 20
              ? "5–20x"
              : x < 100
                ? "20–100x"
                : x < 1000
                  ? "100–1000x"
                  : "1000x+";
    distribution[bucket]++;
  };
  while (paid < paidSpins || state.phase === "bonus") {
    const wasBonus = state.phase === "bonus";
    if (!wasBonus && paid > 0) {
      closeRound();
      roundPayout = 0;
    }
    const result = resolveSpin(state, 100, rng, String(spins));
    state = result.state;
    if (!wasBonus) {
      paid++;
      wagered += result.debit;
      if (result.payout > 0) hits++;
      if (result.payout > result.bet) netWins++;
    } else bonusSpins++;
    spins++;
    returned += result.payout;
    goldReturned += result.gold?.amount || 0;
    pokerReturned += result.poker?.amount || 0;
    if (result.poker?.cards.length === 5) completedHands++;
    if (result.poker?.outcome === "win") duelWins++;
    if (result.poker?.outcome === "tie") ties++;
    roundPayout += result.payout;
    for (const event of result.events) {
      const key =
        event.type + (event.location !== undefined ? `:${event.location}` : "");
      features[key] = (features[key] || 0) + 1;
      if (event.type === "bonus-start") bonuses++;
    }
  }
  closeRound();
  const mean = returned / wagered;
  const se = Math.sqrt(Math.max(0, sumSquares / paid - mean * mean) / paid);
  return {
    configVersion: CONFIG.version,
    rules: {
      opponent: DEAD_MANS_HAND,
      pokerPays: Object.fromEntries(
        Object.entries(POKER_PAYS).map(([hand, pay]) => [
          hand,
          pay * CONFIG.pokerPayScale,
        ]),
      ),
      goldLinePay: CONFIG.goldLinePay,
      goldScreenPay: CONFIG.goldScreenPay,
      goldRushDenominator: CONFIG.goldRushDenominator,
      waysScale: CONFIG.payoutScale,
    },
    duelWins,
    ties,
    netPositivePaidSpinRate: (netWins / paid) * 100,
    seed,
    paidSpins: paid,
    totalSpins: spins,
    bonusSpins,
    wagered,
    returned,
    goldReturned,
    goldRtp: (goldReturned / wagered) * 100,
    pokerReturned,
    pokerRtp: (pokerReturned / wagered) * 100,
    completedHands,
    unfinishedCards: state.poker?.cards.length || 0,
    rtp: mean * 100,
    hitRate: (hits / paid) * 100,
    bonuses,
    bonusOneIn: bonuses ? paid / bonuses : null,
    maxRoundX: maxRound,
    approximateRtp95: [(mean - 1.96 * se) * 100, (mean + 1.96 * se) * 100],
    distribution,
    features,
    targets: { rtp: 96, hitRate: 38, bonusOneIn: 140, maxExposure: 10000 },
  };
}
