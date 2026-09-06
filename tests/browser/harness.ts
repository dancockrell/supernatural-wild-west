// Test-only fixture server. No forced outcomes or seed endpoint exist in the demo server.
import express from "express";
import { resolve } from "node:path";
import { createApp } from "../../server/app";
import { GameService } from "../../server/service";
import { initialState, resolveSpin } from "../../src/engine/engine";
const before = initialState();
const bonus = resolveSpin(before, 100, { nextInt: (max) => max === 1000000 ? 1 : 0 }, "bonus-fixture");
const service = new GameService({
  "bonus-fixture": {
    state: bonus.state,
    rounds: [
      {
        before,
        request: { requestId: "bonus-fixture", expectedSequence: 0, bet: 100 },
        result: bonus,
        draws: [],
      },
    ],
  },
});
service.sessions["audio-bonus-fixture"] = structuredClone(
  service.sessions["bonus-fixture"],
);
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:8788";
const app = createApp(service);
app.use(express.static(resolve("dist")));
app.listen(8788, "127.0.0.1");
