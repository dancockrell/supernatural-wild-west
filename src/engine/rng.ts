import type { RandomSource } from "./types";
/** Mulberry32 seeded test path with rejection sampling; never used for demo wagers. */
export class SeededRng implements RandomSource {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  nextInt(max: number): number {
    if (!Number.isSafeInteger(max) || max <= 0 || max > 0x100000000)
      throw new Error("Invalid RNG range");
    const limit = Math.floor(0x100000000 / max) * max;
    let value: number;
    do {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      value = (t ^ (t >>> 14)) >>> 0;
    } while (value >= limit);
    return value % max;
  }
}
export class RecordingRng implements RandomSource {
  draws: { max: number; value: number }[] = [];
  constructor(private source: RandomSource) {}
  nextInt(max: number) {
    const value = this.source.nextInt(max);
    this.draws.push({ max, value });
    return value;
  }
}
export class ReplayRng implements RandomSource {
  index = 0;
  constructor(private draws: { max: number; value: number }[]) {}
  nextInt(max: number) {
    const d = this.draws[this.index++];
    if (
      !d ||
      d.max !== max ||
      !Number.isInteger(d.value) ||
      d.value < 0 ||
      d.value >= max
    )
      throw new Error("Replay draw mismatch");
    return d.value;
  }
  assertConsumed() {
    if (this.index !== this.draws.length)
      throw new Error("Unused replay draws");
  }
}
