import { initialState, resolveSpin } from "../src/engine/engine";
import { SeededRng } from "../src/engine/rng";
import { CONFIG } from "../src/engine/config";
import type { SpinResult } from "../src/engine/types";
/** Read-only, fixed-seed feature reel. No wallet or production RNG is touched. */
export function buildShowcase() {
  const rng = new SeededRng(73);
  let state = initialState(1000000);
  let tail: SpinResult[] = [];
  for (let i = 0; i < 10000; i++) {
    const result = resolveSpin(state, 100, rng, `showcase-${i}`);
    state = result.state;
    tail.push(result);
    if (tail.length > 3) tail.shift();
    if (result.events.some((e) => e.type === "bonus-start")) {
      let index = i + 1;
      while (state.phase === "bonus") {
        const r = resolveSpin(state, 100, rng, `showcase-${index++}`);
        tail.push(r);
        state = r.state;
      }
      return {
        mode: "read-only-replay" as const,
        configVersion: CONFIG.version,
        seed: 73,
        rounds: tail,
      };
    }
  }
  throw new Error("Showcase seed did not reach a bonus");
}

/** Independent, naturally resolved examples for reviewing presentation; never live wagers. */
export function buildFeatureGallery() {
  const rng = new SeededRng(88031);
  let state = initialState(100000000);
  const examples: Record<string, SpinResult> = {};
  for (let i = 0; i < 50000; i++) {
    const r = resolveSpin(state, 100, rng, `gallery-${i}`);
    state = r.state;
    const has = (type: string) => r.events.some((e) => e.type === type);
    if (has("bonus-start")) examples.ride ||= r;
    else if (has("witching")) examples.witch ||= r;
    else if (has("awaken")) {
      examples.awaken ||= r;
      const location = r.events.find((e) => e.type === "awaken")!.location;
      if (location !== undefined) examples[`awaken-${location}`] ||= r;
    } else if (r.payout >= r.bet * 20) examples.fortune ||= r;
    else if (r.phase !== "noon" && r.state.phase === "noon")
      examples.noon ||= r;
    else if (r.grid.flat().includes("wild")) examples.brand ||= r;
    if (
      [
        "ride",
        "witch",
        "awaken",
        "fortune",
        "noon",
        "brand",
        ...Array.from({ length: 5 }, (_, i) => `awaken-${i}`),
      ].every((k) => examples[k])
    )
      return { mode: "read-only-replay", examples };
  }
  throw new Error("Feature gallery incomplete");
}
