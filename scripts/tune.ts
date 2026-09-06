import { CONFIG } from "../src/engine/config";
import { simulate } from "../src/engine/simulation";
const pilot = simulate(1000000, 314159);
console.log(JSON.stringify(pilot, null, 2));
console.log(
  "Suggested scale from measured return:",
  (CONFIG.payoutScale * 96) / pilot.rtp,
);
