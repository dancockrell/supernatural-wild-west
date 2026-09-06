import { CONFIG } from "../src/engine/config";
import { randomInt, randomUUID } from "node:crypto";
import { initialState, resolveSpin } from "../src/engine/engine";
import { RecordingRng } from "../src/engine/rng";
import type { GameState, SpinRequest, SpinResult } from "../src/engine/types";
export interface AuditRound {
  before: GameState;
  request: SpinRequest;
  result: SpinResult;
  draws: { max: number; value: number }[];
}
export interface Session {
  state: GameState;
  rounds: AuditRound[];
}
export class GameService {
  constructor(
    public sessions: Record<string, Session> = {},
    private persist: (sessions: Record<string, Session>) => void = () => {},
  ) {}
  create() {
    const id = randomUUID();
    const session = { state: initialState(), rounds: [] };
    const next = { ...this.sessions, [id]: session };
    this.persist(next);
    this.sessions = next;
    return id;
  }
  get(id: string) {
    if (!Object.hasOwn(this.sessions, id)) throw new Error("Session expired");
    return this.sessions[id];
  }
  spin(id: string, request: SpinRequest): SpinResult {
    if (
      !request ||
      typeof request.requestId !== "string" ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(request.requestId) ||
      !Number.isSafeInteger(request.expectedSequence)
    )
      throw new Error("Invalid request");
    const session = this.get(id);
    const previous = session.rounds.find(
      (r) => r.request.requestId === request.requestId,
    );
    if (previous) {
      if (
        previous.request.bet !== request.bet ||
        previous.request.expectedSequence !== request.expectedSequence
      )
        throw new Error("Idempotency conflict");
      return previous.result;
    }
    if (request.expectedSequence !== session.state.sequence)
      throw new Error("Sequence conflict; reconnect");
    const rng = new RecordingRng({ nextInt: (max) => randomInt(max) });
    // Retain historical rules through any already awarded feature. Upgrade only at a fresh paid round.
    const before =
      ["dd-1.1.0", "dd-1.2.0", "dd-1.2.1", "dd-1.3.0"].includes(session.state.configVersion) &&
      !session.state.poker?.cards.length &&
      session.state.phase === "noon"
        ? {
            ...session.state,
            configVersion: CONFIG.version,
            poker: { cards: [], bet: 0 },
          }
        : session.state;
    const result = resolveSpin(before, request.bet, rng, request.requestId);
    const updated: Session = {
      state: result.state,
      rounds: [
        ...session.rounds,
        { before, request, result, draws: rng.draws },
      ],
    };
    const next = { ...this.sessions, [id]: updated };
    // Publish only after the whole ledger transaction has reached durable storage.
    this.persist(next);
    this.sessions = next;
    return result;
  }
}
