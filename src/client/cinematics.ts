export type FeatureScene = "witch" | "awaken" | "ride" | "fortune" | "noon" | "brand";
import { rareGlyph } from "./rare-glyph";
import { ghostSprite, type GhostClip } from "./ghost-sprite";
import { parlorResidentMedia } from './resident-media';
/** Scenic choreography only. The caller has already settled the authoritative result. */
export class FeatureCinematics {
  private stage = document.createElement("div");
  private reduced = false;
  private observer: MutationObserver;
  private performance?: AbortController;
  private nativeAnimations = new WeakSet<Animation>();
  private syncPlayback = () => {
    for (const animation of this.stage.getAnimations({ subtree: true })) {
      if (this.nativeAnimations.has(animation)) continue;
      if (this.host.hidden || document.hidden || this.reduced) animation.pause();
      else animation.play();
    }
    for (const video of this.stage.querySelectorAll("video")) {
      if (this.host.hidden || document.hidden || this.reduced) video.pause();
      else void video.play().catch(() => video.classList.add("unavailable"));
    }
  };
  constructor(
    private host: HTMLElement,
    private cue: (
      sound:
        "chain" | "chain-snap" | "chain-link" | "breath" | "lantern" | "pages",
    ) => void = () => {},
  ) {
    this.stage.className = "feature-stage";
    this.stage.setAttribute("aria-hidden", "true");
    host.prepend(this.stage);
    this.observer = new MutationObserver(this.syncPlayback);
    this.observer.observe(host, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
    document.addEventListener("visibilitychange", this.syncPlayback);
  }
  setReduced(value: boolean) {
    this.reduced = value;
    this.syncPlayback();
    if (value)
      this.host.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  }
  play(kind: FeatureScene, location = 0) {
    this.performance?.abort();
    this.performance = new AbortController();
    this.stage.querySelectorAll("video").forEach((v) => v.pause());
    this.host.dataset.scene = kind;
    const reel = document
      .querySelector(`[data-reel="${location}"]`)
      ?.getBoundingClientRect();
    const cabinet = document.querySelector(".cabinet")!.getBoundingClientRect();
    this.host.style.setProperty(
      "--performance-top",
      `${Math.max(36, cabinet.top - 90)}px`,
    );
    this.host.style.setProperty(
      "--performance-height",
      `${Math.min(innerHeight * 0.64, cabinet.height + 50)}px`,
    );
    this.host.style.setProperty(
      "--caption-top",
      `${cabinet.bottom - (kind === "fortune" ? 180 : 110)}px`,
    );
    const originX =
      kind === "awaken" && reel ? reel.x + reel.width / 2 : innerWidth / 2;
    const originY = reel ? reel.bottom : innerHeight * 0.7;
    this.stage.style.setProperty("--origin-x", `${originX}px`);
    this.stage.style.setProperty("--origin-y", `${originY}px`);
    this.stage.innerHTML =
      kind === "noon"
        ? '<div class="dawn-return"></div>'
        : kind === "ride"
          ? ""
          : '<div class="apparition-light"></div>';
    if (kind === "noon" || kind === "brand") this.stage.replaceChildren(rareGlyph(kind));
    if (kind === "awaken" || kind === "witch" || kind === "fortune" || kind === "ride") {
      const clips: GhostClip[] = [
        "medium-seance",
        "medium-seance",
        "gunslinger-chains",
        "queen-lantern",
        "preacher-book",
      ];
      const clip =
        kind === "ride" ? "rider-gallop" : kind === "witch"
          ? "medium-seance"
          : kind === "fortune"
            ? "medium-seance"
            : clips[location] || "medium-seance";
      this.stage.querySelector(".summoned-face")?.remove();
      const spirit = ghostSprite(clip);
      spirit.classList.add("feature-ghost");
      const parlorResident = document.documentElement.classList.contains("unified-parlor") &&
        (clip === "medium-seance" || clip === "queen-lantern");
      if (parlorResident) {
        const resident = clip === "queen-lantern" ? "queen" : "medium";
        const media = parlorResidentMedia(resident);
        spirit.src = media.reaction;
        spirit.poster = spirit.src.replace(/\.webm$/, '.png');
        spirit.classList.add("parlor-feature-resident");
      }
      if (kind === 'witch' || (kind === 'awaken' && [1,2,3].includes(location))) {
        const performance = kind === 'witch' ? 'witch' : ['','saloon','jail','mine'][location];
        spirit.src = `/video/feature-performances-v2/${performance}.webm`;
        spirit.poster = spirit.src.replace('.webm', '.png');
        spirit.classList.add('authored-feature');
      }
      if (kind === 'fortune' || kind === 'ride' || (kind === 'awaken' && location === 0)) {
        const performance = kind === 'fortune' ? 'fortune' : kind === 'ride' ? 'ride' : 'graveyard';
        spirit.src = `/video/rare-features-v4/${performance}.webm`;
        spirit.poster = spirit.src.replace('.webm', '.png');
        spirit.classList.add('authored-feature', 'parlor-feature-resident');
        if (kind === 'ride') spirit.classList.add('rare-mounted-performance');
      }
      // Repaired women must stay on their solid source in event previews too.
      const solidFeature = kind === 'witch' ? ['medium', 'witch']
        : kind === 'fortune' ? ['medium', 'fortune']
        : kind === 'awaken' && location === 1 ? ['medium', 'saloon']
        : kind === 'awaken' && location === 3 ? ['queen', 'mine'] : null;
      if (solidFeature) {
        spirit.src = `/video/parlor-women-solid-v2/${solidFeature[0]}-feature-${solidFeature[1]}.webm`;
        spirit.poster = spirit.src.replace('.webm', '.png');
      }
      this.stage.append(spirit);
      const beats: [
        number,
        "chain" | "chain-snap" | "chain-link" | "breath" | "lantern" | "pages",
      ][] =
        kind === 'awaken' && location === 2
          ? [[3.4, "chain"], [4.9, "chain-snap"], [5.2, "chain-link"], [5.8, "chain-link"]]
          : kind === 'awaken' && location === 1
          ? [[3.7, "breath"]]
          : parlorResident
          ? clip === "queen-lantern" ? [[.65, "lantern"]] : [[.65, "breath"]]
          : clip === "gunslinger-chains"
          ? [
              [0.33, "chain-snap"],
              [2.04, "chain-link"],
              [2.44, "chain-link"],
              [2.68, "chain-link"],
              [2.86, "chain-link"],
              [3.03, "chain"],
            ]
          : clip === "preacher-book"
            ? [[1.8, "pages"]]
            : clip === "queen-lantern"
              ? [[1.6, "lantern"]]
              : [
                  [1.25, "breath"],
                  [3.4, "breath"],
                ];
      const fired = new Set<number>();
      spirit.addEventListener("timeupdate", () => {
        if (
          this.host.hidden ||
          document.hidden ||
          this.reduced ||
          spirit.paused
        )
          return;
        for (const [at, sound] of beats) {
          if (spirit.currentTime >= at && !fired.has(at)) {
            fired.add(at);
            if (spirit.currentTime - at < 0.4) this.cue(sound);
          }
        }
      });
      const fog = document.createElement("div");
      fog.className = "performance-fog";
      this.stage.append(fog);
      this.host.classList.add("has-ghost");
      this.syncPlayback();
    } else this.host.classList.remove("has-ghost");
    this.syncPlayback();
    // Recreate the animated layer and restart copy on every event, even if already visible.
    const card = this.host.querySelector<HTMLElement>(".spectacle-card")!;
    card.getAnimations().forEach((a) => a.cancel());
    this.host.style.setProperty(
      "--caption-top",
      `${Math.min(cabinet.bottom, document.querySelector(".controls")!.getBoundingClientRect().top) - card.offsetHeight - 36}px`,
    );
    if (!document.body.classList.contains("reduced-motion")) {
      const caption = card.animate(
        [
          { opacity: 0, transform: "translateY(25px) scale(.9)" },
          { opacity: 1, transform: "none" },
        ],
        {
          delay: kind === "ride" ? 550 : 350,
          duration: 650,
          fill: "both",
          easing: "cubic-bezier(.12,.8,.2,1)",
        },
      );
      const film = this.stage.querySelector<HTMLVideoElement>('.feature-ghost');
      const fog = this.stage.querySelector<HTMLElement>('.performance-fog');
      if (film && fog) this.followNativeFilm(film, fog, caption, this.performance.signal);
    }
  }
  private followNativeFilm(film: HTMLVideoElement, fog: HTMLElement, caption: Animation, signal: AbortSignal) {
    // No bright poster flash while the decoder warms up, and no separate fog or
    // caption clock drifting ahead of a buffered/paused performance.
    film.preload = 'auto';
    film.style.animation = 'none';
    fog.style.animation = 'none';
    caption.pause();
    this.nativeAnimations.add(caption);
    let request: number | undefined;
    const native = typeof film.requestVideoFrameCallback === 'function';
    const cancel = () => {
      if (request !== undefined) {
        if (native) film.cancelVideoFrameCallback(request); else cancelAnimationFrame(request);
        request = undefined;
      }
    };
    const draw = () => {
      if (signal.aborted) return;
      const t = film.currentTime;
      const ease = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
      const duration = Number.isFinite(film.duration) ? film.duration : 0;
      const entry = ease(t / .4);
      const exit = duration ? ease((duration - t) / .55) : 1;
      film.style.opacity = film.src.includes('/parlor-women-solid-v2/') ? '1' : String(entry * exit);
      caption.currentTime = t * 1000;
      const progress = duration ? Math.max(0, Math.min(1, t / duration)) : 0;
      fog.style.opacity = String(Math.sin(Math.PI * progress) * .6);
      fog.style.transform = `translateX(${-3 + progress * 8}%) scaleX(${.94 + progress * .14})`;
    };
    const schedule = () => {
      if (signal.aborted || film.paused || film.ended || this.host.hidden || document.hidden || request !== undefined) return;
      const frame = () => { request = undefined; draw(); schedule(); };
      request = native ? film.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
    };
    film.addEventListener('playing', schedule, { signal });
    film.addEventListener('pause', cancel, { signal });
    film.addEventListener('waiting', cancel, { signal });
    film.addEventListener('timeupdate', draw, { signal });
    film.addEventListener('seeked', draw, { signal });
    film.addEventListener('ended', () => { cancel(); draw(); }, { signal });
    signal.addEventListener('abort', () => { cancel(); caption.cancel(); this.nativeAnimations.delete(caption); }, { once: true });
    draw(); schedule();
  }
  dispose() {
    this.performance?.abort();
    this.stage.querySelectorAll("video").forEach((v) => v.pause());
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.syncPlayback);
  }
}
