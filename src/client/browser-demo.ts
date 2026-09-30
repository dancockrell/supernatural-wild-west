import { initialState, resolveSpin } from "../engine/engine";
import type { GameState, SpinRequest, SpinResult } from "../engine/types";
import { validDemoSession, validSpinRequest } from "./demo-session";
import { storage, PUBLIC_PENDING_KEY, type DemoStorage } from "./storage";

export const DEMO_SESSION_KEY = "sww-public-demo-v1";

/** Public, fictional-credit demo only. The server adapter remains the production path. */
export class BrowserDemo {
  private state: GameState = initialState();
  private rounds: { request: SpinRequest; result: SpinResult }[] = [];
  constructor(private readonly persistence: DemoStorage = storage) {
    try {
      const saved: unknown = JSON.parse(
        persistence.getItem(DEMO_SESSION_KEY) || "null",
      );
      if (validDemoSession(saved)) {
        this.state = saved.state;
        this.rounds = saved.rounds;
        return;
      }
    } catch {
      /* Unreadable saves must not prevent a fresh fictional-credit session. */
    }
    // A pending request belongs to the discarded ledger and must never be replayed.
    persistence.removeItem(PUBLIC_PENDING_KEY);
    persistence.removeItem(DEMO_SESSION_KEY);
  }
  async reconnect() {
    return structuredClone({
      state: this.state,
      lastResult: this.rounds.at(-1)?.result || null,
    });
  }
  async history() {
    return structuredClone(this.rounds.map((r) => r.result));
  }
  reset() {
    this.state = initialState();
    this.rounds = [];
    this.persistence.removeItem(PUBLIC_PENDING_KEY);
    this.persist();
  }
  private persist() {
    this.persistence.setItem(
      DEMO_SESSION_KEY,
      JSON.stringify({ state: this.state, rounds: this.rounds }),
    );
  }
  async spin(request: SpinRequest) {
    if (!validSpinRequest(request)) throw new Error("Invalid spin request");
    const previous = this.rounds.find(
      (r) => r.request.requestId === request.requestId,
    );
    if (previous) {
      if (
        previous.request.bet !== request.bet ||
        previous.request.expectedSequence !== request.expectedSequence
      )
        throw new Error("Idempotency conflict");
      return structuredClone(previous.result);
    }
    if (request.expectedSequence !== this.state.sequence)
      throw new Error("Sequence conflict; reconnect");
    const result = resolveSpin(
      this.state,
      request.bet,
      {
        nextInt(max) {
          if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000)
            throw new Error("Invalid random range");
          const limit = Math.floor(0x100000000 / max) * max;
          const word = new Uint32Array(1);
          do {
            crypto.getRandomValues(word);
          } while (word[0] >= limit);
          return word[0] % max;
        },
      },
      request.requestId,
    );
    this.state = result.state;
    this.rounds = [
      ...this.rounds,
      { request: structuredClone(request), result },
    ].slice(-50);
    this.persist();
    return structuredClone(result);
  }
}
