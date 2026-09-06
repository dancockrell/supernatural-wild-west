import { expect, it } from "vitest";
import { GameService } from "../server/service";
import { createApp } from "../server/app";
import { initialState as legacyState } from "../src/engine/legacy/engine-v1";
import { CONFIG } from "../src/engine/config";
it("upgrades an idle legacy wallet once and preserves pending features and retries", () => {
  const old = legacyState(76543);
  const service = new GameService({
    idle: { state: old, rounds: [] },
    bonus: {
      state: {
        ...old,
        phase: "bonus",
        freeSpins: 8,
        bonusAwarded: 8,
        bonusBet: 100,
        roundBet: 100,
      },
      rounds: [],
    },
  });
  const request = { requestId: "migrate-round", expectedSequence: 0, bet: 100 };
  const result = service.spin("idle", request);
  expect(result.configVersion).toBe(CONFIG.version);
  expect(result.state.balance).toBe(old.balance - 100 + result.payout);
  expect(service.get("idle").rounds[0].before.configVersion).toBe(
    CONFIG.version,
  );
  expect(service.spin("idle", request)).toEqual(result);
  expect(service.get("idle").rounds).toHaveLength(1);
  expect(service.spin("bonus", request).configVersion).toBe("dd-1.1.0");
});
it("settles retries once, rejects stale requests and altered retry parameters", () => {
  const service = new GameService();
  const id = service.create();
  const request = { requestId: "test-request", expectedSequence: 0, bet: 100 };
  const first = service.spin(id, request);
  expect(service.spin(id, request)).toEqual(first);
  expect(service.get(id).state.sequence).toBe(1);
  expect(() => service.spin(id, { ...request, bet: 200 })).toThrow(
    "Idempotency",
  );
  expect(() =>
    service.spin(id, { ...request, requestId: "other-request" }),
  ).toThrow("Sequence");
});
it("does not publish a debit if durable commit fails", () => {
  let fail = false;
  const service = new GameService({}, () => {
    if (fail) throw new Error("Disk failed");
  });
  const id = service.create();
  fail = true;
  expect(() =>
    service.spin(id, {
      requestId: "test-failure",
      expectedSequence: 0,
      bet: 100,
    }),
  ).toThrow("Disk failed");
  expect(service.get(id).state.sequence).toBe(0);
});
it("serves session, authoritative spin, recovery and history over HTTP", async () => {
  const server = createApp(new GameService()).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const session = await fetch(url + "/api/session");
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    const request = {
      requestId: "http-request",
      expectedSequence: 0,
      bet: 100,
    };
    const post = () =>
      fetch(url + "/api/spin", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    const first = await (await post()).json();
    const second = await (await post()).json();
    expect(second).toEqual(first);
    const recovered = await (
      await fetch(url + "/api/session", { headers: { cookie } })
    ).json();
    expect(recovered.state).toEqual(first.state);
    const history = await (
      await fetch(url + "/api/history", { headers: { cookie } })
    ).json();
    expect(history).toHaveLength(1);
    expect(history[0].draws).toBeUndefined();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
