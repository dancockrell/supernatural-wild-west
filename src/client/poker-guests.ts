import { ghostSprite, type GhostClip } from "./ghost-sprite";
import { parlorResidentMedia } from "./resident-media";
/** Native hand-award guests. They never participate in outcome evaluation. */
export class PokerGuests {
  private stage = document.createElement("div");
  private events = new AbortController();
  private performance?: AbortController;
  private reduced = false;
  private disposed = false;
  private pendingRank?: string;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    host: HTMLElement,
    private cue: (sound: "breath" | "lantern" | "pages") => void,
  ) {
    this.stage.className = "poker-guests";
    this.stage.setAttribute("aria-hidden", "true");
    host.append(this.stage);
    host.addEventListener(
      "hand-award",
      (e) => this.play((e as CustomEvent<string>).detail),
      { signal: this.events.signal },
    );
    host.addEventListener("hand-reset", () => this.stop(), {
      signal: this.events.signal,
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.stop();
      },
      { signal: this.events.signal },
    );
  }
  setReduced(value: boolean) {
    this.reduced = value;
    if (value) this.stop();
  }
  stop() {
    this.pendingRank = undefined;
    clearTimeout(this.timer);
    this.performance?.abort();
    this.performance = undefined;
    for (const v of this.stage.querySelectorAll("video")) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    this.stage.replaceChildren();
    delete this.stage.dataset.reaction;
  }
  play(rank: string) {
    // Finish the current performance; retain only the newest subsequent award.
    if (this.stage.querySelector("video") && !this.reduced && !document.hidden) {
      this.pendingRank = rank;
      return;
    }
    this.stop();
    if (
      this.disposed ||
      this.reduced ||
      document.hidden ||
      !document.documentElement.classList.contains("unified-parlor")
    )
      return;
    const casts: Record<string, GhostClip[]> = {
      Pair: ["queen-lantern"],
      "Two pair": ["medium-seance"],
      "Three of a kind": ["medium-seance"],
      Straight: ["preacher-book"],
      Flush: ["medium-seance"],
      "Full house": ["queen-lantern"],
      "Four of a kind": ["queen-lantern"],
      "Straight flush": ["medium-seance", "preacher-book"],
      "Royal flush": ["queen-lantern", "preacher-book"],
    };
    const clips = casts[rank];
    if (!clips) return;
    this.performance = new AbortController();
    const signal = this.performance.signal;
    this.stage.dataset.reaction = rank;
    clips.forEach((clip, index) => {
      const seat = document.createElement("div");
      seat.className = `poker-guest guest-${index}`;
      seat.dataset.cast = clip;
      const video = ghostSprite(clip);
      if (clip === "queen-lantern" || clip === "medium-seance") {
        const media = parlorResidentMedia(
          clip === "queen-lantern" ? "queen" : "medium",
        );
        video.src = media.reaction;
        video.poster = video.src.replace(/\.webm$/, ".png");
        seat.classList.add("resident-guest");
      }
      const dedicated: Record<string, string> = {
        Pair: 'pair', 'Two pair': 'two-pair', 'Full house': 'full-house',
      };
      if (dedicated[rank]) {
        video.src = `/video/hand-performances-v2/${dedicated[rank]}.webm`;
        video.poster = video.src.replace('.webm', '.png');
        seat.classList.add('authored-hand');
      }
      video.preload = "auto";
      seat.append(video);
      this.stage.append(seat);
      let sounded = false;
      video.addEventListener(
        "loadeddata",
        () => {
          if (!signal.aborted) void video.play().catch(() => seat.remove());
        },
        { once: true, signal },
      );
      video.addEventListener("playing", () => seat.classList.add("arrived"), {
        once: true,
        signal,
      });
      video.addEventListener(
        "timeupdate",
        () => {
          if (
            Number.isFinite(video.duration) &&
            video.duration - video.currentTime < 0.45
          )
            seat.classList.add("departing");
          const at = clip === "preacher-book" ? 1.8 : 0.65;
          if (!sounded && video.currentTime >= at) {
            sounded = true;
            if (
              index === 0 &&
              !video.paused &&
              !document.hidden &&
              video.currentTime - at < 0.4
            )
              this.cue(
                clip === "preacher-book"
                  ? "pages"
                  : clip === "queen-lantern"
                    ? "lantern"
                    : "breath",
              );
          }
        },
        { signal },
      );
      video.addEventListener(
        "ended",
        () => {
          video.pause();
          seat.remove();
          video.removeAttribute("src");
          video.load();
          if (!this.stage.querySelector("video")) {
            const next = this.pendingRank;
            this.stop();
            if (next) this.play(next);
          }
        },
        { once: true, signal },
      );
      video.load();
    });
    // Failure watchdog only; successful native movies finish themselves.
    this.timer = setTimeout(() => this.stop(), 12000);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.events.abort();
    this.stage.remove();
  }
}
