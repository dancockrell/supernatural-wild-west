import { describe, expect, it } from "vitest";
import { CharacterSequence } from "../src/client/character-sequence";

const action = (id: string, priority = 1) => ({
  id,
  clip: `${id}.webm`,
  priority,
  cues: ["receive", "foley"],
});
function ready(sequence: CharacterSequence) {
  sequence.markStarted(sequence.current.token);
  return sequence.current.token;
}

describe("independent character movie sequence", () => {
  it("waits for an idle boundary, performs once, then returns to a moving idle before another branch", () => {
    const sequence = new CharacterSequence("wait.webm");
    const idle = ready(sequence);
    sequence.enqueue(action("receive"));
    sequence.enqueue(action("reaction"));
    expect(sequence.current.clip).toBe("wait.webm");
    const shot = sequence.idleBoundary(idle)!;
    expect(shot).toMatchObject({ clip: "receive.webm", loop: false });
    expect(sequence.idleBoundary(shot.token)).toBeNull();
    sequence.markStarted(shot.token);
    const wait = sequence.complete(shot.token)!;
    expect(wait).toMatchObject({
      clip: "wait.webm",
      loop: true,
      paused: false,
    });
    expect(sequence.current.actionId).toBeUndefined();
    expect(sequence.idleBoundary(wait.token)).toBeNull();
    sequence.markStarted(wait.token);
    expect(sequence.idleBoundary(wait.token)?.actionId).toBe("reaction");
  });
  it("preserves meaningful reactions through many faster spins so long idles cannot starve them", () => {
    const sequence = new CharacterSequence("wait");
    const token = ready(sequence);
    sequence.enqueue(action("awaken"));
    for (let i = 0; i < 10; i++) sequence.advanceTurn();
    expect(sequence.idleBoundary(token)?.actionId).toBe("awaken");
  });
  it("orders priority then FIFO, bounds pending work, and coalesces repetitive cosmetic events", () => {
    const sequence = new CharacterSequence("wait", 3);
    sequence.enqueue(action("low", 0));
    sequence.enqueue(action("first", 5));
    sequence.enqueue(action("second", 5));
    expect(sequence.enqueue(action("lower", -1))).toBe(false);
    sequence.enqueue({ ...action("jackpot", 10), coalesceKey: "award" });
    expect(sequence.pending).toEqual(["jackpot", "first", "second"]);
    sequence.enqueue({ ...action("new-jackpot", 10), coalesceKey: "award" });
    expect(sequence.pending).toEqual(["new-jackpot", "first", "second"]);
  });
  it("accepts an authored cue once only after playback starts and rejects stale callbacks after reset", () => {
    const sequence = new CharacterSequence("wait");
    const idle = ready(sequence);
    sequence.enqueue(action("card-3"));
    const shot = sequence.idleBoundary(idle)!;
    expect(sequence.cue(shot.token, "receive")).toBeNull();
    sequence.markStarted(shot.token);
    expect(sequence.cue(shot.token, "receive")).toEqual({
      actionId: "card-3",
      name: "receive",
    });
    expect(sequence.cue(shot.token, "receive")).toBeNull();
    expect(sequence.cue(shot.token, "invented")).toBeNull();
    const reset = sequence.reset();
    expect(sequence.markStarted(shot.token)).toBe(false);
    expect(sequence.cue(shot.token, "foley")).toBeNull();
    expect(sequence.complete(shot.token)).toBeNull();
    expect(sequence.failed(shot.token)).toBeNull();
    expect(sequence.idleBoundary(idle)).toBeNull();
    expect(sequence.current.token).toBe(reset.token);
  });
  it("expires opted-in queued or loading cosmetics while allowing an active movie to finish without stale cues", () => {
    const sequence = new CharacterSequence("wait");
    sequence.enqueue({ ...action("loading"), expireOnTurn: true });
    const shot = sequence.idleBoundary(ready(sequence))!;
    expect(sequence.advanceTurn()?.loop).toBe(true);
    expect(sequence.markStarted(shot.token)).toBe(false);
    sequence.enqueue({ ...action("playing"), expireOnTurn: true });
    const playing = sequence.idleBoundary(ready(sequence))!;
    sequence.markStarted(playing.token);
    expect(sequence.advanceTurn()).toBeNull();
    expect(sequence.current.token).toBe(playing.token);
    expect(sequence.cue(playing.token, "foley")).toBeNull();
    expect(sequence.complete(playing.token)?.loop).toBe(true);
  });
  it("reduced motion cancels pending and active actions and resumes only idle", () => {
    const sequence = new CharacterSequence("wait");
    sequence.enqueue(action("receive"));
    const shot = sequence.idleBoundary(ready(sequence))!;
    sequence.markStarted(shot.token);
    sequence.enqueue(action("next"));
    expect(sequence.setReduced(true)).toMatchObject({
      clip: "wait",
      loop: true,
      paused: true,
    });
    expect(sequence.pending).toEqual([]);
    expect(sequence.complete(shot.token)).toBeNull();
    expect(sequence.enqueue(action("ignored"))).toBe(false);
    expect(sequence.setReduced(false)).toMatchObject({
      clip: "wait",
      loop: true,
      paused: false,
    });
    expect(sequence.pending).toEqual([]);
  });
  it("different character instances advance independently", () => {
    const left = new CharacterSequence("left-wait"),
      right = new CharacterSequence("right-wait");
    left.enqueue(action("left-react"));
    right.enqueue(action("right-react"));
    left.idleBoundary(ready(left));
    expect(left.current.loop).toBe(false);
    expect(right.current).toMatchObject({ clip: "right-wait", loop: true });
    expect(right.pending).toEqual(["right-react"]);
  });
});
