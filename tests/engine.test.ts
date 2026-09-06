import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { evaluateWays, initialState, resolveSpin } from "../src/engine/legacy/engine-v130";
import { CONFIG } from "../src/engine/legacy/config-v130";
import { RecordingRng, ReplayRng, SeededRng } from "../src/engine/rng";
import { REGULAR, type Grid, type SymbolId } from "../src/engine/types";
const empty = (): Grid =>
  Array.from({ length: 5 }, () => Array<SymbolId>(4).fill("dust"));
describe("ways settlement", () => {
  it("pays only consecutive left-to-right runs and multiplies ways", () => {
    const g = empty();
    g[0][0] = g[0][1] = g[1][0] = g[2][0] = "rider";
    const w = evaluateWays(g, 100);
    expect(w).toHaveLength(1);
    expect(w[0].ways).toBe(2);
    expect(w[0].count).toBe(3);
    expect(w[0].amount).toBe(
      Math.floor(
        (100 * CONFIG.paytable.rider[0] * CONFIG.payoutScale * 2) / 10000,
      ),
    );
    g[0] = ["dust", "dust", "dust", "dust"];
    expect(evaluateWays(g, 100)).toEqual([]);
  });
  it("substitutes wilds, excludes scatters, and awards the longest run once", () => {
    const g = empty();
    g[0][0] = "wild";
    for (let r = 1; r < 5; r++) g[r][0] = "queen";
    expect(evaluateWays(g, 100).map((w) => [w.symbol, w.count])).toEqual([
      ["queen", 5],
    ]);
    g[1][0] = "scatter";
    expect(evaluateWays(g, 100)).toEqual([]);
    expect(
      evaluateWays(
        Array.from({ length: 5 }, () => Array(4).fill("wild")),
        100,
      ),
    ).toEqual([]);
  });
  it("agrees with an independent exhaustive path evaluator", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<SymbolId>(...REGULAR, "wild", "dust", "scatter"),
          { minLength: 20, maxLength: 20 },
        ),
        (cells) => {
          const g = Array.from({ length: 5 }, (_, i) =>
            cells.slice(i * 4, i * 4 + 4),
          );
          const result = evaluateWays(g, 100);
          for (const symbol of REGULAR) {
            let count = 0;
            while (
              count < 5 &&
              g[count].some((s) => s === symbol || s === "wild")
            )
              count++;
            if (count < 3 || !g.slice(0, count).flat().includes(symbol)) {
              expect(result.find((w) => w.symbol === symbol)).toBeUndefined();
              continue;
            }
            let paths = 0;
            const visit = (r: number) => {
              if (r === count) {
                paths++;
                return;
              }
              for (const s of g[r])
                if (s === symbol || s === "wild") visit(r + 1);
            };
            visit(0);
            expect(result.find((w) => w.symbol === symbol)?.ways).toBe(paths);
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});
describe("authoritative transitions", () => {
  it("applies each location to its reel, preserves scatters and retains Jail wilds", () => {
    const grid = empty();
    grid[1][0] = "wild";
    grid[2][2] = "wild";
    grid[4][0] = "preacher";
    const values = [
      9999,
      ...grid.flatMap((reel, i) =>
        reel.map((s) => CONFIG.strips[i].indexOf(s)),
      ),
      0,
      0,
      9999,
      9999,
      9999,
      9999,
      0,
      0,
      0,
      0,
      0, // Poker card draw after location modifiers.
    ];
    const rng = {
      nextInt: (max: number) => {
        const value = values.length ? values.shift()! : max < 53 ? 0 : undefined;
        if (value === undefined || value >= max)
          throw new Error("Bad fixture draw");
        return value;
      },
    };
    const s = {
      ...initialState(),
      phase: "witching" as const,
      witchSpins: 3,
      roundBet: 100,
      awakened: [0, 1, 2, 3, 4],
      sticky: [1],
    };
    const result = resolveSpin(s, 100, rng, "modifiers");
    expect(result.grid[0][0]).toBe("scatter");
    expect(result.grid[1]).toEqual(["wild", "wild", "wild", "wild"]);
    expect(result.grid[2][1]).toBe("wild");
    expect(result.grid[2][2]).toBe("wild");
    expect(result.state.sticky).toEqual([1, 2]);
    expect(result.grid[3][0]).toBe("rider");
    expect(result.multiplier).toBe(2);
    expect(values).toHaveLength(0);
  });
  it("expires Witching Hour and clears its persistent modifiers", () => {
    const s = {
      ...initialState(),
      phase: "witching" as const,
      witchSpins: 1,
      roundBet: 100,
      awakened: [0, 2],
      sticky: [1],
    };
    const r = resolveSpin(s, 100, { nextInt: (max) => max - 1 }, "dawn");
    expect(r.state.phase).toBe("noon");
    expect(r.state.awakened).toEqual([]);
    expect(r.state.sticky).toEqual([]);
    expect(() =>
      resolveSpin(s, 500, { nextInt: (max) => max - 1 }, "raise"),
    ).toThrow("locked");
  });
  it("replays every draw exactly and does not mutate input", () => {
    const before = initialState();
    const saved = JSON.stringify(before);
    const rng = new RecordingRng(new SeededRng(9));
    const result = resolveSpin(before, 100, rng, "replay");
    const replay = new ReplayRng(rng.draws);
    expect(resolveSpin(before, 100, replay, "replay")).toEqual(result);
    replay.assertConsumed();
    expect(JSON.stringify(before)).toBe(saved);
  });
  it("starts a bonus, locks its bet, bounds retriggers, and ends at the exposure cap", () => {
    // Zero draws select a regular strip stop and a scatter on every reel.
    const zero = { nextInt: (_max: number) => 0 };
    const first = resolveSpin(initialState(), 100, zero, "a");
    expect(first.state.phase).toBe("bonus");
    expect(first.state.freeSpins).toBe(8);
    const second = resolveSpin(first.state, 500, zero, "b");
    expect(second.debit).toBe(0);
    expect(second.bet).toBe(100);
    expect(second.state.freeSpins).toBe(9);
    let state = second.state;
    for (let i = 0; i < 50 && state.phase === "bonus"; i++)
      state = resolveSpin(state, 100, zero, String(i)).state;
    expect(state.phase).toBe("noon");
    expect(state.bonusAwarded).toBe(32);
    const capped = { ...first.state, roundWin: 100 * CONFIG.maxExposure };
    const end = resolveSpin(capped, 100, zero, "cap");
    expect(end.payout).toBe(0);
    expect(end.state.phase).toBe("noon");
    expect(end.events.some((e) => e.type === "cap")).toBe(true);
  });
  it("preserves ledger and exposure invariants over generated sequences", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = new SeededRng(seed);
        let s = initialState(10000000);
        for (let i = 0; i < 150; i++) {
          const r = resolveSpin(s, 100, rng, String(i));
          expect(r.state.balance).toBe(s.balance - r.debit + r.payout);
          expect(r.payout).toBeGreaterThanOrEqual(0);
          expect(r.state.roundWin).toBeLessThanOrEqual(
            r.state.roundBet * CONFIG.maxExposure,
          );
          expect(new Set(r.state.awakened).size).toBe(r.state.awakened.length);
          expect(r.state.freeSpins).toBeLessThanOrEqual(32);
          s = r.state;
        }
      }),
      { numRuns: 100 },
    );
  });
  it("rejects invalid funds, wager and config", () => {
    const rng = new SeededRng(1);
    expect(() => resolveSpin(initialState(0), 100, rng, "a")).toThrow(
      "Insufficient",
    );
    expect(() => resolveSpin(initialState(), NaN, rng, "a")).toThrow(
      "Invalid bet",
    );
    expect(() =>
      resolveSpin({ ...initialState(), configVersion: "bad" }, 100, rng, "a"),
    ).toThrow("version");
  });
});
