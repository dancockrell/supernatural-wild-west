import { afterEach, expect, it, vi } from "vitest";
import { BrowserDemo, DEMO_SESSION_KEY } from "../src/client/browser-demo";
import { validDemoSession } from "../src/client/demo-session";
import { createSafeStorage, PUBLIC_PENDING_KEY } from "../src/client/storage";
import { initialState, resolveSpin } from "../src/engine/engine";
import { SeededRng } from "../src/engine/rng";
import type { GameState, SpinRequest, SpinResult } from "../src/engine/types";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
function session(count = 3) {
  let state = initialState();
  const rng = new SeededRng(12);
  const rounds: { request: SpinRequest; result: SpinResult }[] = [];
  for (let i = 0; i < count; i++) {
    const request = {
      requestId: `round-${i}`,
      expectedSequence: state.sequence,
      bet: 100,
    };
    const result = resolveSpin(state, request.bet, rng, request.requestId);
    rounds.push({ request, result });
    state = result.state;
  }
  return { state, rounds: rounds.slice(-50) };
}
afterEach(() => vi.unstubAllGlobals());

it("settles once, restores a saved session, and protects idempotency from caller mutation", async () => {
  const store = memoryStorage();
  const demo = new BrowserDemo(store);
  const request = {
    requestId: "public-demo-test-1",
    expectedSequence: 0,
    bet: 100,
  };
  const result = await demo.spin(request);
  expect(result.state.sequence).toBe(1);
  expect(await demo.spin(request)).toEqual(result);
  expect((await new BrowserDemo(store).reconnect()).lastResult).toEqual(result);
  await expect(demo.spin({ ...request, bet: 200 })).rejects.toThrow(
    "Idempotency conflict",
  );
  request.bet = 200;
  await expect(demo.spin(request)).rejects.toThrow("Idempotency conflict");
  result.state.balance = 0;
  expect((await demo.reconnect()).state.balance).not.toBe(0);
});

it.each([
  ["bad JSON", "{"],
  ["null", "null"],
  [
    "missing state fields",
    JSON.stringify({
      state: { configVersion: initialState().configVersion },
      rounds: [],
    }),
  ],
])("recovers %s without replaying a pending wager", async (_name, value) => {
  const store = memoryStorage();
  store.setItem(DEMO_SESSION_KEY, value);
  store.setItem(
    PUBLIC_PENDING_KEY,
    JSON.stringify({ requestId: "stale", expectedSequence: 0, bet: 100 }),
  );
  const demo = new BrowserDemo(store);
  expect(await demo.reconnect()).toEqual({
    state: initialState(),
    lastResult: null,
  });
  expect(store.getItem(PUBLIC_PENDING_KEY)).toBeNull();
  expect(await demo.history()).toEqual([]);
  expect(
    (await demo.spin({ requestId: "fresh", expectedSequence: 0, bet: 100 }))
      .sequence,
  ).toBe(1);
});

it.each([
  [
    "negative balance",
    (s: ReturnType<typeof session>) => {
      s.state.balance = -1;
    },
  ],
  [
    "invalid phase",
    (s: ReturnType<typeof session>) => {
      s.state.phase = "invalid" as GameState["phase"];
    },
  ],
  [
    "invalid held hand",
    (s: ReturnType<typeof session>) => {
      s.state.poker = { cards: [51, 51], bet: 100 };
    },
  ],
  [
    "empty history at a later sequence",
    (s: ReturnType<typeof session>) => {
      s.rounds = [];
    },
  ],
  [
    "duplicate request ID",
    (s: ReturnType<typeof session>) => {
      s.rounds[1].request.requestId = s.rounds[0].request.requestId;
      s.rounds[1].result.id = s.rounds[0].result.id;
    },
  ],
  [
    "sequence gap",
    (s: ReturnType<typeof session>) => {
      s.rounds[1].request.expectedSequence = 10;
    },
  ],
  [
    "incorrect debit",
    (s: ReturnType<typeof session>) => {
      s.rounds[1].result.debit = 0;
    },
  ],
  [
    "broken ledger continuity",
    (s: ReturnType<typeof session>) => {
      s.rounds[1].result.state.balance += 100;
    },
  ],
  [
    "unknown symbol",
    (s: ReturnType<typeof session>) => {
      s.rounds[0].result.grid[0][0] = "invalid" as never;
    },
  ],
  [
    "missing presentation data",
    (s: ReturnType<typeof session>) => {
      s.rounds[0].result.events = null as never;
    },
  ],
  [
    "mismatched final state",
    (s: ReturnType<typeof session>) => {
      s.state = { ...s.state, balance: s.state.balance + 1 };
    },
  ],
])("rejects %s and resets the whole local ledger", async (_name, corrupt) => {
  const saved = session();
  corrupt(saved);
  const store = memoryStorage();
  store.setItem(DEMO_SESSION_KEY, JSON.stringify(saved));
  const demo = new BrowserDemo(store);
  expect(await demo.reconnect()).toEqual({
    state: initialState(),
    lastResult: null,
  });
});

it("accepts real engine states through features and the 50-round retention boundary", () => {
  let state = initialState();
  const rng = new SeededRng(1024);
  const rounds: { request: SpinRequest; result: SpinResult }[] = [];
  const phases = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const request = {
      requestId: `validation-${i}`,
      expectedSequence: state.sequence,
      bet: 20,
    };
    const result = resolveSpin(state, 20, rng, request.requestId);
    phases.add(result.phase);
    rounds.push({ request, result });
    if (rounds.length > 50) rounds.shift();
    state = result.state;
    expect(
      validDemoSession(JSON.parse(JSON.stringify({ state, rounds }))),
      `round ${i}`,
    ).toBe(true);
  }
  expect(phases).toEqual(new Set(["noon", "witching", "bonus"]));
});

it("restarts a demo with fresh credits, no history, and no stale pending request", async () => {
  const store = memoryStorage();
  store.setItem(DEMO_SESSION_KEY, JSON.stringify(session()));
  store.setItem(PUBLIC_PENDING_KEY, "stale");
  store.setItem("dd-pending", "server request");
  const demo = new BrowserDemo(store);
  demo.reset();
  expect(await new BrowserDemo(store).reconnect()).toEqual({
    state: initialState(),
    lastResult: null,
  });
  expect(await demo.history()).toEqual([]);
  expect(store.getItem(PUBLIC_PENDING_KEY)).toBeNull();
  expect(store.getItem("dd-pending")).toBe("server request");
});

it("plays and reconnects in memory when access to localStorage throws", async () => {
  const denied = createSafeStorage(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  const demo = new BrowserDemo(denied);
  const request = {
    requestId: "denied-storage",
    expectedSequence: 0,
    bet: 100,
  };
  const result = await demo.spin(request);
  expect(await demo.spin(request)).toEqual(result);
  expect((await new BrowserDemo(denied).reconnect()).lastResult).toEqual(
    result,
  );
  demo.reset();
  expect((await demo.reconnect()).state).toEqual(initialState());
});

it("retains the latest local values after a quota error, including removals", () => {
  const persisted = memoryStorage();
  persisted.setItem("pending", "old");
  const store = createSafeStorage(() => ({
    ...persisted,
    setItem() {
      throw new DOMException("Full", "QuotaExceededError");
    },
  }));
  expect(store.getItem("pending")).toBe("old");
  store.setItem("pending", "new");
  expect(store.getItem("pending")).toBe("new");
  store.removeItem("pending");
  expect(store.getItem("pending")).toBeNull();
});
