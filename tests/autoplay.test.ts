import { describe, it, expect } from "vitest";
import { CasinoAutoplay, type AutoOptions } from "../src/client/autoplay";
import type { SpinResult } from "../src/engine/types";
const options: AutoOptions = {
  spins: 3,
  lossLimit: 1000,
  singleWin: 0,
  profitLimit: 0,
  stopOnBonus: true,
};
function setup(payouts: number[] = []) {
  let balance = 10000,
    calls = 0,
    bonus = false;
  const controller = new CasinoAutoplay(
    () => ({ balance, bet: 100, bonus, ready: true }),
    async () => {
      const payout = payouts[calls] || 0;
      calls++;
      balance -= 100;
      balance += payout;
      return {
        phase: "noon",
        payout,
        state: { balance },
        events: [],
      } as unknown as SpinResult;
    },
    async () => {},
    () => {},
  );
  return {
    controller,
    get calls() {
      return calls;
    },
    get balance() {
      return balance;
    },
  };
}
describe("casino autoplay stop contracts", () => {
  it("uses a finite paid-spin count", async () => {
    const s = setup();
    await s.controller.start(options);
    expect(s.calls).toBe(3);
    expect(s.controller.reason).toBe("Autoplay complete");
  });
  it("checks the next stake before overshooting net loss", async () => {
    const s = setup();
    await s.controller.start({ ...options, spins: 100, lossLimit: 250 });
    expect(s.calls).toBe(2);
    expect(s.balance).toBe(9800);
  });
  it("offsets losses with settled wins", async () => {
    const s = setup([250]);
    await s.controller.start({ ...options, spins: 100, lossLimit: 250 });
    expect(s.calls).toBe(5);
    expect(s.balance).toBe(9750);
  });
  it("stops on a single win or target profit", async () => {
    const s = setup([600]);
    await s.controller.start({ ...options, singleWin: 500 });
    expect(s.calls).toBe(1);
    const p = setup([400]);
    await p.controller.start({ ...options, profitLimit: 300 });
    expect(p.calls).toBe(1);
  });
  it("does not submit again after Stop during an outstanding request", async () => {
    let resolve!: (r: SpinResult) => void,
      calls = 0;
    const c = new CasinoAutoplay(
      () => ({ balance: 1000, bet: 100, bonus: false, ready: true }),
      () => {
        calls++;
        return new Promise((r) => (resolve = r));
      },
      async () => {},
      () => {},
    );
    const run = c.start(options);
    c.stop();
    resolve({
      phase: "noon",
      payout: 0,
      state: { balance: 900 },
      events: [],
    } as unknown as SpinResult);
    await run;
    expect(calls).toBe(1);
    expect(c.active).toBe(false);
  });
  it("free spins do not consume the paid count and finish before count expiry", async () => {
    let calls = 0,
      bonus = false;
    const c = new CasinoAutoplay(
      () => ({ balance: 1000, bet: 100, bonus, ready: true }),
      async () => {
        calls++;
        const phase = bonus ? "bonus" : "noon";
        bonus = calls < 3;
        return {
          phase,
          payout: 0,
          state: { balance: 1000 },
          events: calls === 1 ? [{ type: "bonus-start" }] : [],
        } as unknown as SpinResult;
      },
      async () => {},
      () => {},
    );
    await c.start({ ...options, spins: 1, stopOnBonus: false });
    expect(calls).toBe(3);
    expect(c.remaining).toBe(0);
  });
  it("stops on bonus entry by default", async () => {
    let calls = 0;
    const c = new CasinoAutoplay(
      () => ({ balance: 1000, bet: 100, bonus: false, ready: true }),
      async () => {
        calls++;
        return {
          phase: "noon",
          payout: 0,
          state: { balance: 900 },
          events: [{ type: "bonus-start" }],
        } as unknown as SpinResult;
      },
      async () => {},
      () => {},
    );
    await c.start(options);
    expect(calls).toBe(1);
    expect(c.reason).toBe("Free spins awarded");
  });
});

it("zero loss limit permits the finite run but still stops at balance exhaustion", async () => {
  const s = setup();
  await s.controller.start({ ...options, spins: 110, lossLimit: 0 });
  expect(s.calls).toBe(100);
  expect(s.controller.reason).toBe("Insufficient credits");
});
