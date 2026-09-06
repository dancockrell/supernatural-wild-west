import { readFileSync } from "node:fs";
import { deepStrictEqual } from "node:assert";
import { ReplayRng } from "../src/engine/rng";
import { resolveSpin } from "../src/engine/engine";
import type { Session } from "../server/service";
const sessions = JSON.parse(
  readFileSync(process.argv[2] || "data/sessions.json", "utf8"),
) as Record<string, Session>;
let count = 0;
for (const session of Object.values(sessions))
  for (const round of session.rounds) {
    const rng = new ReplayRng(round.draws);
    deepStrictEqual(
      resolveSpin(
        round.before,
        round.request.bet,
        rng,
        round.request.requestId,
      ),
      round.result,
    );
    rng.assertConsumed();
    count++;
  }
console.log(
  `Verified ${count} authoritative rounds, including RNG call shapes and complete serialized results.`,
);
