import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundBus } from "../src/client/audio";
class FakeAudio {
  static all: FakeAudio[] = [];
  static pending = false;
  src: string;
  duration = 10;
  readyState = 1;
  currentTime = 0;
  playbackRate = 1;
  preservesPitch = false;
  paused = true;
  volume = 1;
  loop = false;
  preload = "";
  onloadedmetadata: null | (() => void) = null;
  onended: null | (() => void) = null;
  onerror: null | (() => void) = null;
  resolve?: () => void;
  constructor(src: string) {
    this.src = src;
    FakeAudio.all.push(this);
  }
  load() {
    this.onloadedmetadata?.();
  }
  play() {
    this.paused = false;
    if (FakeAudio.pending && !this.loop)
      return new Promise<void>(
        (r) =>
          (this.resolve = () => {
            this.paused = false;
            r();
          }),
      );
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
const param = () => ({
  value: 0,
  cancelScheduledValues() {},
  setTargetAtTime() {},
});
const node = () => ({
  gain: param(),
  frequency: param(),
  Q: param(),
  threshold: param(),
  knee: param(),
  ratio: param(),
  attack: param(),
  release: param(),
  connect() {},
  disconnect: vi.fn(),
});
class FakeContext {
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  createGain() {
    return node();
  }
  createDynamicsCompressor() {
    return node();
  }
  createBiquadFilter() {
    return node();
  }
  createMediaElementSource() {
    return node();
  }
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  FakeAudio.all = [];
  FakeAudio.pending = false;
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("document", {
    hidden: false,
    body: { classList: { contains: () => false } },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("native-clock event score transport", () => {
  it("reserves ducking during loading and keeps only one event soundtrack alive", async () => {
    const bus=new SoundBus();bus.enabled=true;
    bus.playEventScore("hand-pair",8);await tick();
    const first=FakeAudio.all.at(-1)!;
    bus.stopEventScore(250);
    FakeAudio.pending=true;
    bus.playEventScore("feature-mine",7);
    expect(first.paused).toBe(true);
    expect((bus as any).eventScoreVoices.size).toBe(1);
    await vi.advanceTimersByTimeAsync(120);
    expect(FakeAudio.all[0].volume).toBeCloseTo(.2*.18);
    bus.enabled=false;
  });
  it("an incidental release cannot unduck the theme over the event fade tail", async () => {
    const bus=new SoundBus();bus.enabled=true;
    bus.playEventScore("hand-pair",8);await tick();
    (bus as any).duckMusic(50,.5);
    bus.stopEventScore(1500);
    await vi.advanceTimersByTimeAsync(800);
    expect(FakeAudio.all[0].volume).toBeCloseTo(.2*.18);
    await vi.advanceTimersByTimeAsync(1500);
    expect(FakeAudio.all[0].volume).toBeCloseTo(.2);
    bus.enabled=false;
  });

  it("uses distinct hand music and resumes at the native video offset with pitch preserved", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    bus.playEventScore("hand-pair", 8, 2);
    await tick();
    const cue = FakeAudio.all.at(-1)!;
    expect(cue.src).toBe("/audio/event-scores-v1/hand-pair.mp3");
    expect(cue.preservesPitch).toBe(true);
    expect(cue.playbackRate).toBe(1.25);
    expect(cue.currentTime).toBe(2.5);
    bus.playEventScore("hand-trips", 10);
    await tick();
    expect(FakeAudio.all.at(-1)!.src).toContain("/hand-trips.mp3");
    bus.enabled = false;
  });
  it("an old stop closure cannot stop or unduck a replacement score", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    const oldStop = bus.playEventScore("hand-pair", 8);
    await tick();
    bus.playEventScore("feature-mine", 7);
    await tick();
    const latest = FakeAudio.all.at(-1)!;
    oldStop();
    await vi.advanceTimersByTimeAsync(800);
    expect(latest.paused).toBe(false);
    expect(FakeAudio.all[0].volume).toBeCloseTo(0.2 * 0.18);
    bus.enabled = false;
  });
  it("mute cancels pending playback even if its play promise resolves afterwards", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    FakeAudio.pending = true;
    bus.playEventScore("hand-quads", 9);
    const cue = FakeAudio.all.at(-1)!;
    bus.enabled = false;
    cue.resolve?.();
    await tick();
    expect(cue.paused).toBe(true);
    expect((bus as any).eventScoreVoices.size).toBe(0);
  });
  it("manual music level owns cue and restored theme while effects stay independent", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    const stop = bus.playEventScore("hand-flush", 10);
    await tick();
    bus.setLevels(0.4, 0.1);
    expect(FakeAudio.all.at(-1)!.volume).toBeCloseTo(0.4 * 0.92);
    expect((bus as any).machine.gain.value).toBe(0.1);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeAudio.all[0].volume).toBeCloseTo(0.4);
    bus.enabled = false;
  });
  it("hiding stops every fading cue and does not restart event music on resume", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    bus.playEventScore("hand-pair");
    await tick();
    bus.playEventScore("feature-church");
    await tick();
    (document as any).hidden = true;
    bus.suspend();
    expect(FakeAudio.all.every((a) => a.paused)).toBe(true);
    (document as any).hidden = false;
    bus.resume();
    await tick();
    expect(FakeAudio.all.slice(1).every((a) => a.paused)).toBe(true);
    bus.enabled = false;
  });
  it("does not start stale music when metadata arrives after the film window", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    const oldLoad = FakeAudio.prototype.load;
    FakeAudio.prototype.load = function () {
      this.readyState = 0;
    };
    bus.playEventScore("hand-straight", 7, 6.5);
    const cue = FakeAudio.all.at(-1)!;
    await vi.advanceTimersByTimeAsync(900);
    cue.onloadedmetadata?.();
    await tick();
    expect(cue.paused).toBe(true);
    FakeAudio.prototype.load = oldLoad;
    bus.enabled = false;
  });
  it("catches an audio-buffer restart up to the still-running native film", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    bus.playEventScore("hand-trips", 10);
    await tick();
    const cue = FakeAudio.all.at(-1)!;
    await vi.advanceTimersByTimeAsync(2300);
    cue.currentTime = 0.2;
    (cue as any).onplaying();
    expect(cue.currentTime).toBeCloseTo(2.3);
    bus.enabled = false;
  });
  it("finishing event music preserves a newer incidental music duck", async () => {
    const bus = new SoundBus();
    bus.enabled = true;
    const stop = bus.playEventScore("hand-pair", 8);
    await tick();
    (bus as any).duckMusic(2000, 0.5);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeAudio.all[0].volume).toBeCloseTo(0.1);
    await vi.advanceTimersByTimeAsync(1800);
    expect(FakeAudio.all[0].volume).toBeCloseTo(0.2);
    bus.enabled = false;
  });
});
