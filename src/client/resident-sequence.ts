import {
  CharacterSequence,
  type CharacterPlayback,
} from "./character-sequence";

/** Native movie boundaries are the only permitted cuts for a resident performance. */
export class ResidentSequence {
  private sequence: CharacterSequence;
  private current: HTMLVideoElement;
  private paused = false;
  private serial = 0;
  private idleIndex = 0;
  private transition = 0;
  private awaitingFrame = false;
  private handoff = new AbortController();
  private heldFrame?: HTMLCanvasElement;
  constructor(
    private slot: HTMLElement,
    private idle: HTMLVideoElement,
    private reaction: HTMLVideoElement,
    private allowBranch: () => boolean,
    private sound: () => void,
    private idleVariants: HTMLVideoElement[] = [],
  ) {
    this.sequence = new CharacterSequence("idle", 2);
    this.current = idle;
    for (const clip of [idle, ...idleVariants, reaction]) clip.loop = false;
    idle.dataset.performance = "idle";
    reaction.dataset.performance = "reaction";
    reaction.preload = "auto";
    for (const video of [idle, ...idleVariants, reaction]) {
      video.dataset.performance = video === reaction ? 'reaction' : 'idle';
      video.addEventListener("playing", () => {
        if (video !== this.current) return;
        this.sequence.markStarted(this.sequence.current.token);
        if (
          video === reaction &&
          this.sequence.cue(this.sequence.current.token, "foley")
        )
          this.sound();
      });
      video.addEventListener("ended", () => {
        if (video !== this.current || !video.ended || this.paused) return;
        const token = this.sequence.current.token;
        if (video === reaction) {
          const next = this.sequence.complete(token);
          if (next) this.apply(next);
        } else {
          const next =
            this.allowBranch() && reaction.readyState >= 2
              ? this.sequence.idleBoundary(token)
              : null;
          if (next) this.apply(next);
          else {
            this.nextIdle();
          }
        }
      });
      video.addEventListener("error", () => {
        if (video !== this.current) return;
        const next = this.sequence.failed(this.sequence.current.token);
        if (next && video !== idle) this.apply(next);
      });
    }
    reaction.load();
    idleVariants.forEach(clip => clip.load());
  }
  enqueue(priority = 1) {
    this.sequence.enqueue({
      id: `reaction-${++this.serial}`,
      clip: "reaction",
      priority,
      coalesceKey: "resident-event",
      cues: ["foley"],
    });
    if (this.reaction.error) this.reaction.load();
  }
  advanceTurn() {
    this.sequence.advanceTurn();
  }
  setReduced(value: boolean) {
    const next = this.sequence.setReduced(value);
    if (next) this.apply(next);
  }
  reset() {
    this.apply(this.sequence.reset());
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.sync();
  }
  private nextIdle() {
    const choices = [this.idle, ...this.idleVariants];
    const nextIndex = (this.idleIndex + 1) % choices.length;
    const next = choices[nextIndex];
    if (next.readyState >= 2) this.idleIndex = nextIndex;
    const ready = choices[this.idleIndex];
    this.present(ready);
  }
  private apply(playback: Readonly<CharacterPlayback>) {
    const next = playback.clip === "idle" ? this.idle : this.reaction;
    if (next === this.idle) this.idleIndex = 0;
    this.present(next);
  }
  private present(next: HTMLVideoElement) {
    const request = ++this.transition;
    this.handoff.abort();
    this.handoff = new AbortController();
    this.awaitingFrame = true;
    this.current.pause();
    // Keep the last presented pixels while the next decoder seeks and starts.
    // HAVE_CURRENT_DATA alone does not guarantee a composited video frame.
    if (!this.heldFrame && this.current.readyState >= 2 &&
        this.current.videoWidth > 0 && this.current.videoHeight > 0) {
      const frame = document.createElement('canvas');
      frame.width = this.current.videoWidth;
      frame.height = this.current.videoHeight;
      if (frame.width && frame.height) {
        frame.getContext('2d')!.drawImage(this.current, 0, 0);
        frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:2';
        const appearance = getComputedStyle(this.current);
        frame.style.opacity = appearance.opacity;
        frame.style.filter = appearance.filter;
        frame.style.maskImage = appearance.maskImage;
        frame.style.transform = appearance.transform;
        this.heldFrame = frame;
        this.slot.append(frame);
      }
    }
    const commit = () => {
      if (request !== this.transition) {
        next.removeEventListener('seeked', commit);
        next.removeEventListener('loadeddata', commit);
        return;
      }
      if (next.seeking || next.readyState < 2) return;
      next.removeEventListener('seeked', commit);
      next.removeEventListener('loadeddata', commit);
      this.awaitingFrame = false;
      const previous = this.current;
      if (next !== previous) {
        previous.remove();
        this.slot.prepend(next);
      }
      const release = () => {
        if (request !== this.transition) return;
        this.heldFrame?.remove();
        this.heldFrame = undefined;
      };
      if (typeof next.requestVideoFrameCallback === 'function') {
        next.requestVideoFrameCallback(() => requestAnimationFrame(release));
      } else {
        next.addEventListener('playing', () => requestAnimationFrame(release), {once:true, signal:this.handoff.signal});
      }
      this.current = next;
      this.sync();
    };
    next.addEventListener('seeked', commit, {signal: this.handoff.signal});
    next.addEventListener('loadeddata', commit, {signal: this.handoff.signal});
    if (next.currentTime !== 0) next.currentTime = 0;
    commit();
  }
  private sync() {
    if (this.paused || this.sequence.current.paused || this.awaitingFrame) this.current.pause();
    else {
      if (this.current.ended) this.current.currentTime = 0;
      void this.current.play().catch(() => {});
    }
  }
}

