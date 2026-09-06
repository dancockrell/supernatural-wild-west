import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundBus } from '../src/client/audio';

function mixer() {
  const bus = new SoundBus();
  const score = { volume: .2, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), loop: true };
  const internal = bus as unknown as { score: typeof score; duckMusic(ms: number, depth: number): void; context: unknown; scoreSource: unknown };
  internal.score = score;
  internal.context = { resume: vi.fn().mockResolvedValue(undefined), suspend: vi.fn().mockResolvedValue(undefined) };
  internal.scoreSource = {};
  return { bus, score, duck: (ms: number) => internal.duckMusic(ms, .4) };
}

describe('music fader ownership', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps a manual zero level throughout an in-progress duck and release', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance'] });
    const { bus, score, duck } = mixer();
    duck(100);
    vi.advanceTimersByTime(20);
    bus.setLevels(0, .85);
    vi.advanceTimersByTime(40);
    expect(score.volume).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(score.volume).toBe(0);
  });
  it('does not let an old release overwrite a newly chosen nonzero level', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance'] });
    const { bus, score, duck } = mixer();
    duck(100);
    vi.advanceTimersByTime(180);
    bus.setLevels(.07, .4);
    vi.advanceTimersByTime(1000);
    expect(score.volume).toBe(.07);
  });
  it('drops stale duck state when disabled or suspended', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance'] });
    const { bus, score, duck } = mixer();
    duck(5400);
    bus.enabled = false;
    bus.enabled = true;
    bus.setLevels(.12, .5);
    expect(score.volume).toBe(.12);
    duck(5400);
    bus.suspend();
    bus.setLevels(.1, .5);
    vi.advanceTimersByTime(7000);
    expect(score.volume).toBe(.1);
    expect(score.pause).toHaveBeenCalled();
  });
});
