import { resolveSpin as resolveLegacy } from "./engine-v1";
import { collectCard } from "./poker-v12";
import { CONFIG } from "./config-v120";
import {
  REGULAR,
  LOCATIONS,
  type GameState,
  type Grid,
  type RandomSource,
  type SpinResult,
  type Win,
  type GameEvent,
} from "../types";
export function initialState(balance = CONFIG.initialBalance): GameState {
  return {
    schemaVersion: 1,
    configVersion: CONFIG.version,
    sequence: 0,
    balance,
    phase: "noon",
    witchSpins: 0,
    awakened: [],
    sticky: [],
    freeSpins: 0,
    bonusAwarded: 0,
    bonusBet: 0,
    bonusWin: 0,
    roundWin: 0,
    roundBet: 0,
    poker: { cards: [], bet: 0 },
  };
}
export function evaluateWays(grid: Grid, bet: number): Win[] {
  if (grid.length !== 5 || grid.some((r) => r.length !== 4))
    throw new Error("Expected 5 × 4 grid");
  const wins: Win[] = [];
  for (const symbol of REGULAR) {
    let ways = 1;
    let count = 0;
    const cells: number[] = [];
    let natural = false;
    for (let r = 0; r < 5; r++) {
      const matches = grid[r].flatMap((s, row) =>
        s === symbol || s === "wild" ? [r * 4 + row] : [],
      );
      if (!matches.length) break;
      natural ||= grid[r].includes(symbol);
      count++;
      ways *= matches.length;
      cells.push(...matches);
    }
    // All-wild combinations pay as each regular symbol only when a natural exists in the run.
    if (count >= 3 && natural)
      wins.push({
        symbol,
        count,
        ways,
        cells,
        amount: Math.floor(
          (bet *
            CONFIG.paytable[symbol][count - 3] *
            CONFIG.payoutScale *
            ways) /
            10000,
        ),
      });
  }
  return wins;
}
function assertState(s: GameState) {
  if (s.configVersion !== CONFIG.version || s.schemaVersion !== 1)
    throw new Error("Config version mismatch");
  if (
    !Number.isSafeInteger(s.balance) ||
    s.balance < 0 ||
    !Number.isSafeInteger(s.sequence) ||
    s.sequence < 0
  )
    throw new Error("Invalid ledger state");
  if (
    s.phase === "bonus" &&
    (s.freeSpins < 1 || !CONFIG.bets.includes(s.bonusBet))
  )
    throw new Error("Invalid bonus state");
}
export function resolveSpin(
  before: GameState,
  requestedBet: number,
  rng: RandomSource,
  id: string,
): SpinResult {
  if (before.configVersion === "dd-1.1.0")
    return resolveLegacy(before, requestedBet, rng, id);
  assertState(before);
  const s: GameState = {
    ...before,
    awakened: [...before.awakened],
    sticky: [...before.sticky],
  };
  const phase = s.phase;
  const bonus = phase === "bonus";
  if (!CONFIG.bets.includes(requestedBet)) throw new Error("Invalid bet");
  if (phase === "witching" && requestedBet !== before.roundBet)
    throw new Error("Wager is locked until dawn");
  if (!bonus && before.poker?.cards.length && requestedBet !== before.poker.bet)
    throw new Error("Wager is locked until the poker hand completes");
  const bet = bonus ? s.bonusBet : requestedBet;
  const debit = bonus ? 0 : bet;
  if (s.balance < debit) throw new Error("Insufficient credits");
  if (!bonus) {
    s.roundWin = 0;
    s.roundBet = bet;
  }
  const events: GameEvent[] = [];
  const chance = (n: number) => rng.nextInt(10000) < n;
  const awaken = () => {
    const candidates = [0, 1, 2, 3, 4].filter((n) => !s.awakened.includes(n));
    if (!candidates.length) return;
    const location = candidates[rng.nextInt(candidates.length)];
    s.awakened.push(location);
    events.push({
      type: "awaken",
      location,
      message: `${LOCATIONS[location]} awakened`,
    });
  };
  if (
    phase !== "noon" &&
    chance(bonus ? CONFIG.bonusAwakenChance : CONFIG.awakenChance)
  )
    awaken();
  const stops = CONFIG.strips.map((strip) =>
    Array.from({ length: 4 }, () => rng.nextInt(strip.length)),
  );
  const rawGrid: Grid = stops.map((reel, i) =>
    reel.map((n) => CONFIG.strips[i][n]),
  );
  for (const reel of rawGrid)
    if (chance(CONFIG.scatterPerReel)) reel[rng.nextInt(4)] = "scatter";
  const scatters = rawGrid.flat().filter((s) => s === "scatter").length;
  const grid = rawGrid.map((r) => [...r]);
  let multiplier = 1;
  const transform = (location: number, cells: number[], message: string) =>
    events.push({ type: "transform", location, cells, message });
  if (phase !== "noon")
    for (const loc of [...s.awakened].sort()) {
      if (loc === 0 && chance(2200)) {
        const row = rng.nextInt(4);
        if (grid[0][row] !== "scatter") {
          grid[0][row] = "wild";
          transform(0, [row], "Graveyard · a buried brand returns");
        }
      }
      if (loc === 1 && grid[1].includes("wild") && chance(3500)) {
        const cells: number[] = [];
        grid[1] = grid[1].map((v, row) => {
          if (v === "scatter") return v;
          cells.push(4 + row);
          return "wild";
        });
        transform(1, cells, "Saloon · Hellfire spreads through reel 2");
      }
      if (loc === 2) {
        for (const row of s.sticky)
          if (grid[2][row] !== "scatter") grid[2][row] = "wild";
        s.sticky = [
          ...new Set([
            ...s.sticky,
            ...grid[2].flatMap((v, row) => (v === "wild" ? [row] : [])),
          ]),
        ];
        if (s.sticky.length)
          transform(
            2,
            s.sticky.map((row) => 8 + row),
            "Jail · brands remain behind bars",
          );
      }
      if (loc === 3) {
        const row = rng.nextInt(4);
        if (
          ["ace", "king", "horseshoe", "bottle", "dust"].includes(grid[3][row])
        ) {
          grid[3][row] = "rider";
          transform(3, [12 + row], "Mine · dust reveals the Devil Rider");
        }
      }
      if (loc === 4 && grid[4].includes("preacher")) {
        multiplier = 2;
        events.push({
          type: "multiplier",
          location: 4,
          value: 2,
          message: "Church · the Preacher doubles all ways wins",
        });
      }
    }
  const wins = evaluateWays(grid, bet).map((w) => ({
    ...w,
    amount: w.amount * multiplier,
  }));
  const poker = !bonus ? collectCard(s, grid, bet, rng) : undefined;
  if (poker) {
    events.push({
      type: "poker-deal",
      cells: [poker.cell!],
      value: poker.cards.length,
      message: "Card dealt",
    });
    if (poker.amount)
      events.push({
        type: "poker-win",
        value: poker.amount,
        message: poker.rank,
      });
  }
  const uncapped =
    wins.reduce((sum, w) => sum + w.amount, 0) + (poker?.amount || 0);
  const remaining = Math.max(0, s.roundBet * CONFIG.maxExposure - s.roundWin);
  const payout = Math.min(uncapped, remaining);
  if (poker) {
    poker.amount = Math.min(
      poker.amount,
      Math.max(0, remaining - wins.reduce((sum, w) => sum + w.amount, 0)),
    );
    const award = events.find((e) => e.type === "poker-win");
    if (award) award.value = poker.amount;
  }
  s.roundWin += payout;
  s.balance += payout - debit;
  s.sequence++;
  if (bonus) {
    s.freeSpins--;
    s.bonusWin += payout;
    if (scatters >= 2 && s.bonusAwarded < CONFIG.maxFreeSpins) {
      const count = Math.min(
        CONFIG.retriggerSpins,
        CONFIG.maxFreeSpins - s.bonusAwarded,
      );
      s.freeSpins += count;
      s.bonusAwarded += count;
      awaken();
      events.push({
        type: "retrigger",
        value: count,
        message: `Blood Moon · ${count} more free spins`,
      });
    }
  } else if (scatters >= 3) {
    s.phase = "bonus";
    s.freeSpins = CONFIG.freeSpins;
    s.bonusAwarded = CONFIG.freeSpins;
    s.bonusBet = bet;
    s.bonusWin = 0;
    awaken();
    events.push({
      type: "bonus-start",
      value: CONFIG.freeSpins,
      message: "Ride of the Damned · 8 free spins",
    });
  } else if (scatters >= 2) {
    s.phase = "witching";
    s.witchSpins = CONFIG.witchDuration;
    awaken();
    events.push({
      type: "witching",
      value: CONFIG.witchDuration,
      message: "Witching Hour · the frontier awakens",
    });
  } else if (phase === "witching") {
    s.witchSpins--;
    if (!s.witchSpins) {
      s.phase = "noon";
      s.awakened = [];
      s.sticky = [];
    }
  }
  if (payout === remaining) {
    events.push({
      type: "cap",
      value: CONFIG.maxExposure,
      message: "Maximum round award reached",
    });
    s.freeSpins = 0;
  }
  if (s.phase === "bonus" && s.freeSpins === 0) {
    events.push({
      type: "bonus-end",
      value: s.bonusWin,
      message: "The riders return to dust",
    });
    s.phase = "noon";
    s.awakened = [];
    s.sticky = [];
    s.witchSpins = 0;
  }
  if (!Number.isSafeInteger(s.balance)) throw new Error("Ledger overflow");
  return {
    schemaVersion: 1,
    configVersion: CONFIG.version,
    id,
    sequence: s.sequence,
    bet,
    debit,
    payout,
    phase,
    rawGrid,
    grid,
    stops,
    scatters,
    wins,
    ...(poker ? { poker } : {}),
    multiplier,
    events,
    state: s,
  };
}
