import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResidentSequence } from '../src/client/resident-sequence';

// Decoded dimensions exercise the actual frame-hold path. Playing and frame
// presentation are separate signals, just as they are in a browser decoder.
class Clip extends EventTarget {
  loop = true;
  dataset: Record<string, string> = {};
  preload = '';
  currentTime = 0;
  readyState = 2;
  videoWidth = 1080;
  videoHeight = 1920;
  seeking = false;
  ended = false;
  error = null;
  paused = true;
  load = vi.fn();
  remove = vi.fn();
  pause() { this.paused = true; }
  play() {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  finish() {
    this.ended = true;
    this.dispatchEvent(new Event('ended'));
  }
}

class Frame {
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  drawImage = vi.fn();
  remove = vi.fn();
  getContext() { return { drawImage: this.drawImage }; }
}

let frames: Frame[];
let animationFrames: FrameRequestCallback[];
function presentAnimationFrame() {
  const pending = animationFrames.splice(0);
  pending.forEach(callback => callback(0));
}

function setup() {
  const idle = new Clip(), alt = new Clip(), reaction = new Clip();
  let shown: Clip = idle;
  const slot = { prepend: (clip: Clip) => { shown = clip; }, append: vi.fn() };
  const sound = vi.fn();
  const sequence = new ResidentSequence(
    slot as unknown as HTMLElement,
    idle as unknown as HTMLVideoElement,
    reaction as unknown as HTMLVideoElement,
    () => true,
    sound,
    [alt as unknown as HTMLVideoElement],
  );
  sequence.setPaused(false);
  return { idle, alt, reaction, sequence, slot, sound, shown: () => shown };
}

describe('native idle repertoire', () => {
  beforeEach(() => {
    frames = [];
    animationFrames = [];
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas');
        const frame = new Frame();
        frames.push(frame);
        return frame;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      opacity: '1', filter: 'none', maskImage: 'none', transform: 'none',
    }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('changes idle only at the endpoint and gives a queued reaction priority', () => {
    const s = setup();
    expect(s.shown()).toBe(s.idle);
    s.idle.finish();
    presentAnimationFrame();
    expect(s.shown()).toBe(s.alt);
    s.sequence.enqueue();
    expect(s.shown()).toBe(s.alt);
    s.alt.finish();
    presentAnimationFrame();
    expect(s.shown()).toBe(s.reaction);
    s.reaction.dispatchEvent(new Event('playing'));
    expect(s.sound).toHaveBeenCalledTimes(1);
    s.reaction.finish();
    presentAnimationFrame();
    expect(s.shown()).toBe(s.idle);
  });

  it('repeats decoded idle rather than freezing for an unavailable alternate', () => {
    const s = setup();
    s.alt.readyState = 0;
    s.idle.finish();
    presentAnimationFrame();
    expect(s.shown()).toBe(s.idle);
    expect(s.idle.paused).toBe(false);
    s.alt.readyState = 2;
    s.idle.finish();
    presentAnimationFrame();
    expect(s.shown()).toBe(s.alt);
  });

  it('holds decoded pixels until playing and the next paint in the fallback path', () => {
    const s = setup();
    s.idle.finish();
    const frame = frames[0];
    expect(frame.width).toBe(1080);
    expect(frame.height).toBe(1920);
    expect(frame.drawImage).toHaveBeenCalledWith(s.idle, 0, 0);
    expect(s.slot.append).toHaveBeenCalledWith(frame);
    expect(frame.style.opacity).toBe('1');
    expect(frame.style.filter).toBe('none');
    expect(s.shown()).toBe(s.alt);
    expect(frame.remove).not.toHaveBeenCalled();
    presentAnimationFrame();
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it('waits for native frame presentation even when playing has already fired', () => {
    const s = setup();
    let decoded: (() => void) | undefined;
    Object.assign(s.alt, {
      requestVideoFrameCallback: (callback: () => void) => { decoded = callback; return 1; },
    });
    s.idle.finish();
    const frame = frames[0];
    expect(s.alt.paused).toBe(false);
    presentAnimationFrame();
    expect(frame.remove).not.toHaveBeenCalled();
    expect(decoded).toBeTypeOf('function');
    decoded!();
    expect(frame.remove).not.toHaveBeenCalled();
    presentAnimationFrame();
    expect(frame.remove).toHaveBeenCalledTimes(1);
  });

  it('holds the outgoing frame during a seek and ignores superseded seek completion', () => {
    const s = setup();
    s.alt.seeking = true;
    s.idle.finish();
    const frame = frames[0];
    s.sequence.setPaused(true);
    s.sequence.setPaused(false);
    expect(s.shown()).toBe(s.idle);
    expect(s.idle.paused).toBe(true);
    expect(s.alt.paused).toBe(true);
    expect(frame.remove).not.toHaveBeenCalled();
    s.sequence.reset();
    presentAnimationFrame();
    expect(frame.remove).toHaveBeenCalledTimes(1);
    s.alt.seeking = false;
    s.alt.dispatchEvent(new Event('seeked'));
    expect(s.shown()).toBe(s.idle);
    expect(s.idle.paused).toBe(false);
    expect(s.alt.paused).toBe(true);
  });
});
