import { describe, expect, it } from "vitest";
import { evaluateWays, initialState, resolveSpin } from "../src/engine/engine";
import { CONFIG } from "../src/engine/config";
import { DEAD_MANS_HAND } from "../src/engine/poker";
import { RecordingRng, ReplayRng, SeededRng } from "../src/engine/rng";
import {
  REGULAR,
  type GameState,
  type Grid,
  type SymbolId,
} from "../src/engine/types";

/**
 * Ledger, exposure and state-machine integrity for the live config, driven
 * through `resolveSpin` at volume rather than through fixtures.
 *
 * Two things this file is careful about. Every loop reports what it actually
 * exercised and fails when that count is implausibly small — a run that
 * produced no bonus round, no witching hour and no completed poker hand would
 * otherwise satisfy every invariant below by never reaching them. And the
 * exposure-cap cases are built from an exact stop fixture rather than waited
 * for: the cap needs a round win of 10,000x the bet, which a random run of any
 * practical length never reaches, so sampling would have tested nothing there.
 */

const STRIP = CONFIG.strips[0].length;
const stopOf = (reel: number, symbol: SymbolId) => {
  const at = CONFIG.strips[reel].indexOf(symbol);
  if (at < 0) throw new Error(`${symbol} is not on strip ${reel}`);
  return at;
};

/**
 * An RNG that lands an exact grid: strip stops in reading order, then "no
 * scatter" and "no gold rush" for every chance draw, then a fixed choice from
 * the poker deck. Distinguished by the max each call asks for, so a change in
 * the engine's draw order cannot silently misalign it.
 */
function gridFixture(layout: SymbolId[][], deckPick = 0) {
  const stops: number[] = [];
  for (let reel = 0; reel < CONFIG.reels; reel++)
    for (let row = 0; row < CONFIG.rows; row++)
      stops.push(stopOf(reel, layout[reel][row]));
  let taken = 0;
  return {
    nextInt(max: number) {
      if (max === STRIP && taken < stops.length) return stops[taken++];
      if (max === CONFIG.probabilityDenominator) return 9999; // no scatter, no awakening
      if (max === CONFIG.goldRushDenominator) return 1; // no gold rush
      return deckPick < max ? deckPick : 0; // poker deck draw
    },
  };
}

/** Five-of-a-kind gunslinger run, one gold row, one dust cell, nothing else. */
const CAP_LAYOUT: SymbolId[][] = [
  ["gunslinger", "gold", "dust", "bottle", "bottle"],
  ["gunslinger", "gold", "horseshoe", "horseshoe", "horseshoe"],
  ["gunslinger", "gold", "bottle", "bottle", "bottle"],
  ["gunslinger", "gold", "horseshoe", "horseshoe", "horseshoe"],
  ["gunslinger", "gold", "bottle", "bottle", "bottle"],
];

/** A bonus round already `roundWin` deep, one spin from the CAP_LAYOUT board. */
function capSpin(roundWin: number) {
  const before: GameState = {
    ...initialState(1_000_000_000),
    phase: "bonus",
    freeSpins: 4,
    bonusAwarded: CONFIG.freeSpins,
    bonusBet: 100,
    roundBet: 100,
    roundWin,
    poker: { cards: [0, 1, 2, 3], bet: 100 },
  };
  const result = resolveSpin(before, 100, gridFixture(CAP_LAYOUT), "cap");
  const ways = result.wins.reduce((sum, w) => sum + w.amount, 0);
  return {
    before,
    result,
    ways,
    gold: result.gold?.amount ?? 0,
    poker: result.poker?.amount ?? 0,
    components: ways + (result.gold?.amount ?? 0) + (result.poker?.amount ?? 0),
    capped: result.events.some((e) => e.type === "cap"),
  };
}

const CEILING = 100 * CONFIG.maxExposure;

describe("ways settlement on the live 5 × 5 board", () => {
  it("counts paths and prices them the same way an independent evaluator does", () => {
    // The repo's exhaustive ways check (tests/engine.test.ts) runs against the
    // frozen 5 × 4 v130 engine. This is the same idea against the live one,
    // where a run is five reels of five rows: the reference counts paths by
    // walking the grid rather than multiplying widths, and prices the win from
    // the paytable directly.
    const rng = new SeededRng(90210);
    const pool: SymbolId[] = [...REGULAR, "wild", "dust", "scatter", "gold"];
    let grids = 0;
    let winsSeen = 0;
    const countsSeen = new Set<number>();
    for (let g = 0; g < 3000; g++) {
      const grid: Grid = Array.from({ length: CONFIG.reels }, () =>
        Array.from(
          { length: CONFIG.rows },
          () => pool[rng.nextInt(pool.length)],
        ),
      );
      const bet = CONFIG.bets[rng.nextInt(CONFIG.bets.length)];
      const result = evaluateWays(grid, bet);
      grids++;
      for (const symbol of REGULAR) {
        // Reference: how far the run reaches, whether a real symbol appears in
        // it, and how many distinct cell paths there are.
        let reach = 0;
        while (
          reach < CONFIG.reels &&
          grid[reach].some((s) => s === symbol || s === "wild")
        )
          reach++;
        const natural = grid
          .slice(0, reach)
          .some((reel) => reel.includes(symbol));
        const walk = (reel: number): number =>
          reel === reach
            ? 1
            : grid[reel].reduce(
                (sum, s) =>
                  s === symbol || s === "wild" ? sum + walk(reel + 1) : sum,
                0,
              );
        const found = result.find((w) => w.symbol === symbol);
        if (reach < 3 || !natural) {
          expect(found, `${symbol} should not pay`).toBeUndefined();
          continue;
        }
        const paths = walk(0);
        expect(found, `${symbol} should pay`).toBeDefined();
        expect(found!.count).toBe(reach);
        expect(found!.ways).toBe(paths);
        expect(found!.cells).toHaveLength(
          grid
            .slice(0, reach)
            .reduce(
              (n, reel) =>
                n + reel.filter((s) => s === symbol || s === "wild").length,
              0,
            ),
        );
        expect(found!.amount).toBe(
          Math.floor(
            (bet *
              CONFIG.paytable[symbol][reach - 3] *
              CONFIG.payoutScale *
              paths) /
              10000,
          ),
        );
        winsSeen++;
        countsSeen.add(reach);
      }
    }
    expect(grids).toBe(3000);
    // The sample has to have contained real wins of more than one length, or
    // the loop only proved that nothing pays.
    expect(winsSeen).toBeGreaterThan(200);
    expect([...countsSeen].sort()).toEqual([3, 4, 5]);
  });

  it("refuses a board that is not the configured shape", () => {
    const short: Grid = Array.from({ length: CONFIG.reels }, () =>
      Array<SymbolId>(CONFIG.rows - 1).fill("dust"),
    );
    expect(() => evaluateWays(short, 100)).toThrow(
      new RegExp(`${CONFIG.reels} × ${CONFIG.rows}`),
    );
    expect(() =>
      evaluateWays(
        Array.from({ length: CONFIG.reels - 1 }, () =>
          Array<SymbolId>(CONFIG.rows).fill("dust"),
        ),
        100,
      ),
    ).toThrow(/grid/);
  });
});

describe("ledger integrity over a long seeded run", () => {
  it("holds every credit, counter and phase invariant across 100,000 spins", () => {
    const seeds = [1, 42, 1337, 20260910, 7];
    let spins = 0,
      paid = 0,
      bonusSpins = 0,
      witchingSpins = 0,
      completedHands = 0,
      wagered = 0,
      returned = 0,
      freeSpinsGranted = 0,
      freeSpinsConsumed = 0,
      cardsDealt = 0;
    const phases = new Set<string>();
    const transitions = new Set<string>();
    const problems: string[] = [];
    const note = (why: string) => {
      if (problems.length < 8) problems.push(why);
    };

    for (const seed of seeds) {
      const rng = new SeededRng(seed);
      let state = initialState(1_000_000_000);
      let ledger = state.balance;
      for (let i = 0; i < 20000; i++) {
        const before = state;
        const bonus = before.phase === "bonus";
        // A bet change on every spin the rules allow one, so the sequence
        // includes raises and reductions mid-poker-hand and mid-bonus.
        const requested =
          before.phase === "witching"
            ? before.roundBet
            : CONFIG.bets[rng.nextInt(CONFIG.bets.length)];
        const r = resolveSpin(before, requested, rng, `${seed}-${i}`);
        spins++;
        phases.add(r.phase);
        transitions.add(`${before.phase}->${r.state.phase}`);

        // 1. The ledger, recomputed from the result log alone.
        ledger += r.payout - r.debit;
        if (ledger !== r.state.balance)
          note(
            `balance drift at ${seed}-${i}: log ${ledger} vs engine ${r.state.balance}`,
          );
        if (r.state.balance < 0) note(`negative balance at ${seed}-${i}`);
        if (!Number.isSafeInteger(r.payout) || r.payout < 0)
          note(`bad payout ${r.payout} at ${seed}-${i}`);
        if (r.debit !== (bonus ? 0 : r.bet))
          note(
            `debit ${r.debit} for bet ${r.bet} (bonus=${bonus}) at ${seed}-${i}`,
          );
        if (!bonus && r.bet !== requested)
          note(`paid spin charged ${r.bet}, not the requested ${requested}`);
        if (bonus && r.bet !== before.bonusBet)
          note(`free spin charged ${r.bet}, not the locked ${before.bonusBet}`);

        // 2. A round pays each component once, and they add up to the payout.
        const ways = r.wins.reduce((sum, w) => sum + w.amount, 0);
        const components =
          ways + (r.poker?.amount ?? 0) + (r.gold?.amount ?? 0);
        if (components !== r.payout)
          note(
            `components ${components} != payout ${r.payout} at ${seed}-${i}`,
          );
        if (r.state.roundWin > r.state.roundBet * CONFIG.maxExposure)
          note(
            `round win ${r.state.roundWin} past the ceiling at ${seed}-${i}`,
          );
        if (new Set(r.wins.map((w) => w.symbol)).size !== r.wins.length)
          note(`a symbol paid twice at ${seed}-${i}`);

        // 3. Free spins: granted once, consumed once, bounded.
        for (const e of r.events)
          if (e.type === "bonus-start" || e.type === "retrigger")
            freeSpinsGranted += e.value ?? 0;
        if (bonus) freeSpinsConsumed++;
        if (r.state.freeSpins > CONFIG.maxFreeSpins)
          note(
            `free spins ${r.state.freeSpins} past the bound at ${seed}-${i}`,
          );
        if (r.state.bonusAwarded > CONFIG.maxFreeSpins)
          note(`bonusAwarded ${r.state.bonusAwarded} past the bound`);
        if (r.state.phase !== "bonus" && r.state.freeSpins !== 0)
          note(`free spins outside a bonus at ${seed}-${i}`);

        // 4. Phase counters stay inside their own bounds.
        if (r.state.witchSpins < 0 || r.state.witchSpins > CONFIG.witchDuration)
          note(`witchSpins ${r.state.witchSpins} out of range at ${seed}-${i}`);
        if (r.state.phase === "witching" && r.state.witchSpins < 1)
          note(`witching with no spins left at ${seed}-${i}`);
        if (r.state.phase === "noon" && r.state.awakened.length)
          note(`locations still awake at noon at ${seed}-${i}`);

        // 5. The poker hand: at most four cards held, never the opponent's.
        const held = r.state.poker?.cards ?? [];
        if (held.length > 4 || new Set(held).size !== held.length)
          note(`held hand ${JSON.stringify(held)} at ${seed}-${i}`);
        if (held.some((c) => DEAD_MANS_HAND.includes(c)))
          note(`held an opponent card at ${seed}-${i}`);
        const wasHeld = before.poker?.cards ?? [];
        if (r.poker) {
          cardsDealt++;
          // Exactly one card per spin, appended to what was already showing,
          // and the card is the face turned up on the cell it came from.
          if (r.poker.cards.length !== wasHeld.length + 1)
            note(
              `dealt ${r.poker.cards.length - wasHeld.length} cards at ${seed}-${i}`,
            );
          if (
            wasHeld.some((c, at) => r.poker!.cards[at] !== c) ||
            r.cardFaces?.[r.poker.cell!] !== r.poker.cards.at(-1)
          )
            note(`hand rebuilt rather than extended at ${seed}-${i}`);
          if (r.poker.complete !== (r.poker.cards.length === 5))
            note(`completion flag wrong at ${seed}-${i}`);
          // A completed hand is cleared, so the next spin starts a new one.
          if (r.poker.complete && held.length !== 0)
            note(`completed hand not cleared at ${seed}-${i}`);
          if (r.poker.complete) completedHands++;
          if (r.poker.outcome !== "win" && r.poker.amount !== 0)
            note(`paid ${r.poker.amount} on a non-win at ${seed}-${i}`);
        } else if ((r.state.poker?.cards ?? []).length !== wasHeld.length)
          note(`hand changed on a spin with no deal at ${seed}-${i}`);

        wagered += r.debit;
        returned += r.payout;
        if (bonus) bonusSpins++;
        else paid++;
        if (before.phase === "witching") witchingSpins++;
        state = r.state;
      }
    }

    // Denominators before verdicts: this run has to have contained the
    // features whose invariants it claims to have checked.
    expect(spins).toBe(100000);
    expect(paid).toBeGreaterThan(90000);
    expect(bonusSpins).toBeGreaterThan(2000);
    expect(witchingSpins).toBeGreaterThan(2000);
    expect(completedHands).toBeGreaterThan(5000);
    expect(cardsDealt).toBeGreaterThan(50000);
    expect(wagered).toBeGreaterThan(0);
    expect(returned).toBeGreaterThan(0);
    expect(phases).toEqual(new Set(["noon", "witching", "bonus"]));
    // Every phase is entered from somewhere and left again: no absorbing state.
    for (const edge of [
      "noon->witching",
      "noon->bonus",
      "witching->noon",
      "witching->bonus",
      "bonus->bonus",
      "bonus->noon",
    ])
      expect(transitions, `transition ${edge} never happened`).toContain(edge);
    // Free spins are consumed exactly once each. Granted counts every award;
    // consumed counts every spin charged nothing. They differ only by whatever
    // the exposure cap voided, which this seeded run never reaches.
    expect(freeSpinsGranted).toBe(freeSpinsConsumed);
    expect(problems).toEqual([]);
  }, 60000);

  it("is pure: the state passed in is never touched, and a replay is identical", () => {
    let state = initialState();
    const rng = new SeededRng(31337);
    let checked = 0;
    for (let i = 0; i < 200; i++) {
      const snapshot = JSON.stringify(state);
      const recorder = new RecordingRng(rng);
      const first = resolveSpin(
        state,
        CONFIG.bets[i % CONFIG.bets.length],
        recorder,
        `pure-${i}`,
      );
      expect(JSON.stringify(state)).toBe(snapshot);
      const replay = new ReplayRng(recorder.draws);
      expect(
        resolveSpin(
          state,
          CONFIG.bets[i % CONFIG.bets.length],
          replay,
          `pure-${i}`,
        ),
      ).toEqual(first);
      replay.assertConsumed();
      checked++;
      state = first.state;
      // A witching hour locks the wager, so step off the rotating bet list
      // until it ends rather than tripping the lock.
      while (state.phase !== "noon")
        state = resolveSpin(state, state.roundBet, rng, `settle-${i}`).state;
    }
    expect(checked).toBe(200);
  });
});

describe("the exposure cap", () => {
  it("reports exactly what it paid when it truncates a round", () => {
    const uncapped = capSpin(0);
    // The board is worth all three award kinds at once, which is what makes it
    // able to catch a mis-ordered clamp at all.
    expect(uncapped.ways).toBeGreaterThan(0);
    expect(uncapped.gold).toBeGreaterThan(0);
    expect(uncapped.poker).toBeGreaterThan(0);
    expect(uncapped.result.poker?.rank).toBe("Straight flush");
    expect(uncapped.components).toBe(uncapped.result.payout);
    expect(uncapped.capped).toBe(false);

    const total = uncapped.components;
    // Every interesting slice of room left in the round, including the two the
    // old independent clamps got wrong: room smaller than the ways win alone,
    // and room exactly equal to it.
    for (const roundWin of [
      CEILING - total - 1,
      CEILING - total,
      CEILING - uncapped.ways - uncapped.gold,
      CEILING - uncapped.ways,
      CEILING - Math.floor(uncapped.ways / 2),
      CEILING - 1,
      CEILING,
    ]) {
      const run = capSpin(roundWin);
      const room = CEILING - roundWin;
      expect(run.result.payout, `payout at roundWin ${roundWin}`).toBe(
        Math.min(total, room),
      );
      // The defect this asserts against: ways went unclamped and gold was
      // clamped against the final payout rather than the room left after ways,
      // so at roundWin 999,204 the result reported 1,296 credits of awards on
      // a 796-credit payout.
      expect(run.components, `components at roundWin ${roundWin}`).toBe(
        run.result.payout,
      );
      expect(
        run.result.state.balance - run.before.balance,
        `credited at roundWin ${roundWin}`,
      ).toBe(run.result.payout);
      const goldEvent = run.result.events.find((e) => e.type === "gold-strike");
      if (goldEvent) expect(goldEvent.value).toBe(run.gold);
      const pokerEvent = run.result.events.find((e) => e.type === "poker-win");
      if (pokerEvent) expect(pokerEvent.value).toBe(run.poker);
    }
  });

  it("ends the round only when it actually truncated something", () => {
    const total = capSpin(0).components;
    // A win landing EXACTLY on the ceiling is paid in full, so it is not a cap
    // and must not cost the player the free spins they have left. The old test
    // for this was `payout === remaining`, which is also true of an untruncated
    // win that happens to fit precisely.
    const exact = capSpin(CEILING - total);
    expect(exact.result.payout).toBe(total);
    expect(exact.capped).toBe(false);
    expect(exact.result.state.freeSpins).toBe(3);
    expect(exact.result.state.phase).toBe("bonus");

    // One credit less room: truncated by one, so the cap fires and the bonus
    // ends. The two cases differ by a single credit of room.
    const truncated = capSpin(CEILING - total + 1);
    expect(truncated.result.payout).toBe(total - 1);
    expect(truncated.capped).toBe(true);
    expect(truncated.result.state.freeSpins).toBe(0);
    expect(truncated.result.state.phase).toBe("noon");

    // A round whose room is already gone pays nothing and stays closed.
    const exhausted = capSpin(CEILING);
    expect(exhausted.result.payout).toBe(0);
    expect(exhausted.capped).toBe(true);
    expect(exhausted.components).toBe(0);
  });
});

describe("bets, funds and the phases that fix them", () => {
  it("accepts the table's list and nothing on either side of it", () => {
    const min = CONFIG.bets[0];
    const max = CONFIG.bets.at(-1)!;
    let accepted = 0;
    for (const bet of CONFIG.bets) {
      const r = resolveSpin(
        initialState(),
        bet,
        new SeededRng(bet),
        `at-${bet}`,
      );
      expect(r.bet).toBe(bet);
      expect(r.debit).toBe(bet);
      accepted++;
    }
    expect(accepted).toBe(CONFIG.bets.length);
    const offMenu = [
      min - 1,
      min + 1,
      max - 1,
      max + 1,
      0,
      -min,
      min + 0.5,
      NaN,
      Infinity,
      -Infinity,
      1e20,
      "100" as unknown as number,
      null as unknown as number,
      undefined as unknown as number,
    ];
    for (const bet of offMenu)
      expect(
        () => resolveSpin(initialState(), bet, new SeededRng(1), "off"),
        `bet ${String(bet)} should be refused`,
      ).toThrow(/Invalid bet/);
    expect(offMenu).toHaveLength(14);
  });

  it("refuses a paid spin it cannot fund, and funds a free one at zero balance", () => {
    expect(() =>
      resolveSpin(
        initialState(CONFIG.bets[0] - 1),
        CONFIG.bets[0],
        new SeededRng(2),
        "poor",
      ),
    ).toThrow(/Insufficient credits/);
    // Exactly enough is enough.
    const exact = resolveSpin(
      initialState(CONFIG.bets[0]),
      CONFIG.bets[0],
      new SeededRng(2),
      "exact",
    );
    expect(exact.state.balance).toBeGreaterThanOrEqual(0);
    // A free spin charges nothing, so an empty wallet cannot block a bonus.
    const broke = resolveSpin(
      {
        ...initialState(0),
        phase: "bonus",
        freeSpins: 2,
        bonusAwarded: CONFIG.freeSpins,
        bonusBet: 100,
        roundBet: 100,
      },
      500,
      new SeededRng(3),
      "broke",
    );
    expect(broke.debit).toBe(0);
    expect(broke.bet).toBe(100);
    expect(broke.state.balance).toBeGreaterThanOrEqual(0);
    expect(broke.state.freeSpins).toBe(1);
  });

  it("keeps a bonus on its own bet and a witching hour on the wager it locked", () => {
    const bonus: GameState = {
      ...initialState(),
      phase: "bonus",
      freeSpins: 3,
      bonusAwarded: CONFIG.freeSpins,
      bonusBet: 50,
      roundBet: 50,
    };
    for (const requested of CONFIG.bets) {
      const r = resolveSpin(
        bonus,
        requested,
        new SeededRng(requested),
        `b-${requested}`,
      );
      expect(r.bet).toBe(50);
      expect(r.debit).toBe(0);
    }
    // An off-menu value is still refused, even though the bonus would ignore it.
    expect(() => resolveSpin(bonus, 37, new SeededRng(4), "b-off")).toThrow(
      /Invalid bet/,
    );

    const witching: GameState = {
      ...initialState(),
      phase: "witching",
      witchSpins: 3,
      roundBet: 100,
    };
    expect(resolveSpin(witching, 100, new SeededRng(5), "w-same").bet).toBe(
      100,
    );
    for (const other of CONFIG.bets.filter((b) => b !== 100))
      expect(() =>
        resolveSpin(witching, other, new SeededRng(other), `w-${other}`),
      ).toThrow(/locked/);
  });

  it("ends a witching hour after exactly its duration, and never sooner or later", () => {
    // A draw of max-1 keeps every chance draw off (no scatter, no gold rush,
    // no awakening), so nothing can extend or restart the hour.
    const quiet = { nextInt: (max: number) => max - 1 };
    let state: GameState = {
      ...initialState(1_000_000),
      phase: "witching",
      witchSpins: CONFIG.witchDuration,
      roundBet: 100,
      awakened: [0, 2],
      sticky: [1],
    };
    const seen: number[] = [];
    for (let i = 0; i < CONFIG.witchDuration; i++) {
      const r = resolveSpin(state, 100, quiet, `w-${i}`);
      seen.push(r.state.witchSpins);
      expect(r.state.phase).toBe(
        i === CONFIG.witchDuration - 1 ? "noon" : "witching",
      );
      state = r.state;
    }
    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
    expect(state.awakened).toEqual([]);
    expect(state.sticky).toEqual([]);
    // And once it is over the wager is free again.
    expect(() => resolveSpin(state, 500, quiet, "after")).not.toThrow();
  });
});

describe("a restored session of another shape", () => {
  /**
   * `src/client/browser-demo.ts` restores a whole GameState out of
   * localStorage having checked only the configVersion string, so every shape
   * below can reach the engine for real. None of them may crash with a
   * language-level error, return a NaN or Infinity, or leave the machine
   * unable to progress: each must be refused by name.
   */
  const malformed: [string, Partial<GameState>, RegExp][] = [
    [
      "witching that can never expire",
      { phase: "witching", witchSpins: 0, roundBet: 100 },
      /Invalid witching state/,
    ],
    [
      "witching already past its bound",
      { phase: "witching", witchSpins: -3, roundBet: 100 },
      /Invalid feature counters/,
    ],
    [
      "witching locked to a wager not on the table",
      { phase: "witching", witchSpins: 3, roundBet: 0 },
      /Invalid witching state/,
    ],
    [
      "witching with no locked wager at all",
      {
        phase: "witching",
        witchSpins: 3,
        roundBet: undefined as unknown as number,
      },
      /Invalid ledger state/,
    ],
    [
      "no awakened list",
      { awakened: undefined as unknown as number[] },
      /Invalid frontier state/,
    ],
    [
      "no sticky list",
      { sticky: undefined as unknown as number[] },
      /Invalid frontier state/,
    ],
    [
      "a sticky row off the reel",
      {
        phase: "witching",
        witchSpins: 2,
        roundBet: 100,
        awakened: [2],
        sticky: [99],
      },
      /Invalid frontier state/,
    ],
    [
      "a location that does not exist",
      { phase: "witching", witchSpins: 2, roundBet: 100, awakened: [7, 7, -1] },
      /Invalid frontier state/,
    ],
    [
      "no round win",
      {
        phase: "bonus",
        freeSpins: 2,
        bonusBet: 100,
        roundBet: 100,
        roundWin: undefined as unknown as number,
      },
      /Invalid ledger state/,
    ],
    [
      "no round bet",
      {
        phase: "bonus",
        freeSpins: 2,
        bonusBet: 100,
        roundBet: undefined as unknown as number,
      },
      /Invalid ledger state/,
    ],
    [
      "a bonus with no spins left",
      { phase: "bonus", freeSpins: 0, bonusBet: 100, roundBet: 100 },
      /Invalid bonus state/,
    ],
    [
      "more free spins than the game awards",
      {
        phase: "bonus",
        freeSpins: 999,
        bonusBet: 100,
        roundBet: 100,
        bonusAwarded: 8,
      },
      /Invalid feature counters/,
    ],
    [
      "more awarded than the game awards",
      {
        phase: "bonus",
        freeSpins: 2,
        bonusBet: 100,
        roundBet: 100,
        bonusAwarded: 999,
      },
      /Invalid feature counters/,
    ],
    [
      "free spins outside a bonus",
      { freeSpins: 4 },
      /Free spins outside a bonus/,
    ],
    [
      "a phase this build has never had",
      { phase: "dawn" as unknown as GameState["phase"] },
      /Unknown phase/,
    ],
    ["a fractional balance", { balance: 100.5 }, /Invalid ledger state/],
    ["a negative balance", { balance: -5 }, /Invalid ledger state/],
    ["a NaN round win", { roundWin: NaN }, /Invalid ledger state/],
    ["a NaN sequence", { sequence: NaN }, /Invalid ledger state/],
    [
      "a held hand of five",
      { poker: { cards: [1, 2, 3, 4, 5], bet: 100 } },
      /Invalid held hand/,
    ],
    [
      "a held hand with a repeat",
      { poker: { cards: [3, 3], bet: 100 } },
      /Invalid held hand/,
    ],
    [
      "a held card that is not a card",
      { poker: { cards: [1.5], bet: 100 } },
      /Invalid held hand/,
    ],
    [
      "a held card the opponent is holding",
      { poker: { cards: [DEAD_MANS_HAND[0]], bet: 100 } },
      /Invalid held hand/,
    ],
    [
      "a version this engine does not speak",
      { configVersion: "dd-9.9.9" },
      /Config version mismatch/,
    ],
  ];

  it("refuses each malformed restore by name, with no crash and no NaN", () => {
    for (const [label, patch, message] of malformed) {
      const state = { ...initialState(1_000_000), ...patch } as GameState;
      let thrown: unknown;
      try {
        resolveSpin(state, 100, new SeededRng(9), "restore");
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${label} was accepted`).toBeInstanceOf(Error);
      // A TypeError means the engine read a missing field instead of checking
      // it — a crash, not a refusal.
      expect((thrown as Error).constructor.name, label).toBe("Error");
      expect((thrown as Error).message, label).toMatch(message);
    }
    expect(malformed).toHaveLength(24);
  });

  it("tolerates fields it has never heard of, so an older save still plays", () => {
    const state = {
      ...initialState(1_000_000),
      legacyBonusPick: 3,
      note: "written by some earlier build",
    } as unknown as GameState;
    const r = resolveSpin(state, 100, new SeededRng(8), "extra");
    expect(Number.isSafeInteger(r.state.balance)).toBe(true);
    expect(Number.isSafeInteger(r.payout)).toBe(true);
    expect(r.state.phase).toBe("noon");
  });

  it("accepts a save that omits the poker hand entirely", () => {
    const r = resolveSpin(
      { ...initialState(1_000_000), poker: undefined },
      100,
      new SeededRng(8),
      "no-poker",
    );
    expect(Number.isSafeInteger(r.payout)).toBe(true);
    expect((r.state.poker?.cards ?? []).length).toBeLessThanOrEqual(4);
  });
});
