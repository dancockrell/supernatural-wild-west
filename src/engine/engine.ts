import { resolveSpin as resolvePoker130 } from "./legacy/engine-v130";
import { evaluateGold } from "./gold";
import { resolveSpin as resolvePoker121 } from "./legacy/engine-v121";
import { resolveSpin as resolvePoker120 } from "./legacy/engine-v120";
import { resolveSpin as resolveLegacy } from "./legacy/engine-v1";
import { settleBoard } from "./poker";
import { CONFIG } from "./config";
import {
  REGULAR,
  LOCATIONS,
  type GameState,
  type Grid,
  type RandomSource,
  type SpinResult,
  type Win,
  type GameEvent,
} from "./types";
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
  if (
    grid.length !== CONFIG.reels ||
    grid.some((r) => r.length !== CONFIG.rows)
  )
    throw new Error(`Expected ${CONFIG.reels} × ${CONFIG.rows} grid`);
  const wins: Win[] = [];
  for (const symbol of REGULAR) {
    let ways = 1;
    let count = 0;
    const cells: number[] = [];
    let natural = false;
    for (let r = 0; r < 5; r++) {
      const matches = grid[r].flatMap((s, row) =>
        s === symbol || s === "wild" ? [r * CONFIG.rows + row] : [],
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
const isBet = (n: unknown) => CONFIG.bets.includes(n as number);
const isCredits = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
/** A bounded, whole feature counter: 0 ≤ n ≤ max. */
const isCounter = (n: unknown, max: number) =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;
/** A set of distinct row/location indices inside [0, max). */
const isIndexSet = (v: unknown, max: number) =>
  Array.isArray(v) &&
  v.length <= max &&
  new Set(v).size === v.length &&
  v.every((n) => Number.isInteger(n) && n >= 0 && n < max);
/**
 * Every field a spin reads, checked before it is read.
 *
 * This is a trust boundary, not a formality: `src/client/browser-demo.ts`
 * restores a whole GameState out of localStorage on nothing but a
 * configVersion string match, so a state written by an older build — or by
 * hand — reaches this function directly. Each condition below was verified
 * to hold over 300,000 states of real seeded play before being enforced, so
 * nothing the engine itself produces can be rejected here.
 *
 * The phase clauses are the load-bearing ones. A phase has to be both
 * enterable and leavable, and two restored shapes were neither:
 * `witching` with `witchSpins <= 0` never expired (the counter ran negative
 * without bound), and `witching` with a `roundBet` that is not on the
 * table's list refused every legal wager forever, so the session could
 * never spin again. Both now fail immediately, naming the state, instead of
 * deadlocking a player who cannot see why.
 *
 * The held poker hand is deliberately NOT re-checked here: settleBoard
 * already validates it and throws "Invalid held hand", and two checks
 * answering one question drift apart.
 */
function assertState(s: GameState) {
  if (s.configVersion !== CONFIG.version || s.schemaVersion !== 1)
    throw new Error("Config version mismatch");
  if (
    !isCredits(s.balance) ||
    !isCredits(s.sequence) ||
    !isCredits(s.roundWin) ||
    !isCredits(s.bonusWin) ||
    !(s.roundBet === 0 || isBet(s.roundBet)) ||
    !(s.bonusBet === 0 || isBet(s.bonusBet))
  )
    throw new Error("Invalid ledger state");
  if (!["noon", "witching", "bonus"].includes(s.phase))
    throw new Error(`Unknown phase '${s.phase}'`);
  if (
    !isCounter(s.witchSpins, CONFIG.witchDuration) ||
    !isCounter(s.freeSpins, CONFIG.maxFreeSpins) ||
    !isCounter(s.bonusAwarded, CONFIG.maxFreeSpins)
  )
    throw new Error("Invalid feature counters");
  if (
    !isIndexSet(s.awakened, LOCATIONS.length) ||
    !isIndexSet(s.sticky, CONFIG.rows)
  )
    throw new Error("Invalid frontier state");
  if (s.phase === "witching" && (s.witchSpins < 1 || !isBet(s.roundBet)))
    throw new Error("Invalid witching state");
  if (s.phase === "bonus" && (s.freeSpins < 1 || !isBet(s.bonusBet)))
    throw new Error("Invalid bonus state");
  if (s.phase !== "bonus" && s.freeSpins > 0)
    throw new Error("Free spins outside a bonus");
}
export function resolveSpin(
  before: GameState,
  requestedBet: number,
  rng: RandomSource,
  id: string,
): SpinResult {
  if (before.configVersion === "dd-1.1.0")
    return resolveLegacy(before, requestedBet, rng, id);
  if (before.configVersion === "dd-1.2.0")
    return resolvePoker120(before, requestedBet, rng, id);
  if (before.configVersion === "dd-1.2.1")
    return resolvePoker121(before, requestedBet, rng, id);
  if (before.configVersion === "dd-1.3.0")
    return resolvePoker130(before, requestedBet, rng, id);
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
  const bet = bonus ? s.bonusBet : requestedBet;
  // Deliberately unlocked (Dan, 10 Sep 2026): the poker hand is dealt one
  // card per spin and the payout uses the COMPLETING spin's bet, not the
  // opening one, so a player watching the hand build can raise once the
  // fifth card's odds are known. That is priced into `pokerPayScale`
  // (src/engine/poker-completion.ts, src/engine/optimal-strategy.ts) rather
  // than blocked here, the way real full-pay video poker prices optimal
  // strategy into its posted return instead of preventing it.
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
    Array.from({ length: CONFIG.rows }, () => rng.nextInt(strip.length)),
  );
  const rawGrid: Grid = stops.map((reel, i) =>
    reel.map((n) => CONFIG.strips[i][n]),
  );
  for (const reel of rawGrid)
    if (chance(CONFIG.scatterPerReel))
      reel[rng.nextInt(CONFIG.rows)] = "scatter";
  const goldRush = rng.nextInt(CONFIG.goldRushDenominator) === 0;
  if (goldRush) for (const reel of rawGrid) reel.fill("gold");
  const scatters = rawGrid.flat().filter((s) => s === "scatter").length;
  const grid = rawGrid.map((r) => [...r]);
  let multiplier = 1;
  const transform = (location: number, cells: number[], message: string) =>
    events.push({ type: "transform", location, cells, message });
  if (phase !== "noon" && !goldRush)
    for (const loc of [...s.awakened].sort()) {
      if (loc === 0 && chance(2200)) {
        const row = rng.nextInt(CONFIG.rows);
        if (grid[0][row] !== "scatter") {
          grid[0][row] = "wild";
          transform(0, [row], "Graveyard · a buried brand returns");
        }
      }
      if (loc === 1 && grid[1].includes("wild") && chance(3500)) {
        const cells: number[] = [];
        grid[1] = grid[1].map((v, row) => {
          if (v === "scatter") return v;
          cells.push(CONFIG.rows + row);
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
            s.sticky.map((row) => 2 * CONFIG.rows + row),
            "Jail · brands remain behind bars",
          );
      }
      if (loc === 3) {
        const row = rng.nextInt(CONFIG.rows);
        if (
          ["ace", "king", "horseshoe", "bottle", "dust"].includes(grid[3][row])
        ) {
          grid[3][row] = "rider";
          transform(
            3,
            [3 * CONFIG.rows + row],
            "Mine · dust reveals the Devil Rider",
          );
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
  const matchedWins = evaluateWays(grid, bet).map((w) => ({
    ...w,
    amount: w.amount * multiplier,
  }));
  const { poker, cardFaces } = settleBoard(grid, bet, rng, s);
  const wins = matchedWins;
  const gold = evaluateGold(grid, bet);
  if (gold.amount)
    events.push({
      type: "gold-strike",
      cells: gold.cells,
      value: gold.amount,
      message: gold.fullScreen ? "Mother Lode" : "Gold strike",
    });
  if (poker) {
    events.push({
      type: "poker-deal",
      cells: poker.cells,
      value: poker.cards.length,
      message: "Poker hand revealed",
    });
    if (poker.amount)
      events.push({
        type: "poker-win",
        value: poker.amount,
        message: poker.rank,
      });
  }
  const uncapped =
    wins.reduce((sum, w) => sum + w.amount, 0) +
    (poker?.amount || 0) +
    gold.amount;
  const remaining = Math.max(0, s.roundBet * CONFIG.maxExposure - s.roundWin);
  // One sequential allocation against the round's remaining exposure, so what
  // the result reports adds up to what it actually credited. Each part used to
  // be clamped independently — ways not at all, gold against the final payout,
  // poker against the leftover — which on a capped round made the components
  // sum to MORE than the payout: at roundWin 999,204 of a 1,000,000 ceiling, a
  // 796-credit ways win and a 500-credit gold line reported 1,296 against a
  // 796-credit payout, and the client reads those figures as credited awards
  // (src/client/effects.ts computes payout - poker.amount for the reel award).
  let budget = remaining;
  const award = (amount: number) => {
    const granted = Math.min(amount, budget);
    budget -= granted;
    return granted;
  };
  for (const win of wins) win.amount = award(win.amount);
  gold.amount = award(gold.amount);
  if (poker) poker.amount = award(poker.amount);
  const payout = remaining - budget;
  const goldEvent = events.find((e) => e.type === "gold-strike");
  if (goldEvent) goldEvent.value = gold.amount;
  if (poker) {
    const pokerEvent = events.find((e) => e.type === "poker-win");
    if (pokerEvent) pokerEvent.value = poker.amount;
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
    // `<= 0`, not `!s.witchSpins`: a restored state holding witchSpins 0 used
    // to decrement forever, never satisfying the falsy test, so the hour never
    // ended and the wager stayed locked. assertState now rejects that shape at
    // the door as well, and this keeps the counter bounded either way.
    if (s.witchSpins <= 0) {
      s.phase = "noon";
      s.awakened = [];
      s.sticky = [];
    }
  }
  // The round is over when the ceiling actually truncated an award, or when it
  // had already been reached before this spin. `payout === remaining` also
  // fired when a win landed EXACTLY on the ceiling with nothing truncated: at
  // roundWin 983,982 of a 1,000,000 ceiling a 16,018-credit win paid in full
  // and still ended the bonus, costing the player the three free spins left,
  // while the same win one credit under the ceiling kept them.
  if (uncapped > remaining || remaining === 0) {
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
    cardFaces,
    rawGrid,
    grid,
    stops,
    scatters,
    wins,
    ...(poker ? { poker } : {}),
    gold,
    multiplier,
    events,
    state: s,
  };
}
