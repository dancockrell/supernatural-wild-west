export type FeatureScene = "witch" | "awaken" | "ride" | "fortune" | "noon";
import { ghostSprite, type GhostClip } from "./ghost-sprite";
import { parlorResidentMedia } from './resident-media';
/** Scenic choreography only. The caller has already settled the authoritative result. */
export class FeatureCinematics {
  private stage = document.createElement("div");
  private reduced = false;
  private observer: MutationObserver;
  private syncPlayback = () => {
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
    if (kind === "awaken" || kind === "witch" || kind === "fortune") {
      const clips: GhostClip[] = [
        "medium-seance",
        "medium-seance",
        "gunslinger-chains",
        "queen-lantern",
        "preacher-book",
      ];
      const clip =
        kind === "witch"
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
      this.stage.append(spirit);
      const beats: [
        number,
        "chain" | "chain-snap" | "chain-link" | "breath" | "lantern" | "pages",
      ][] =
        parlorResident
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
    // Recreate the animated layer and restart copy on every event, even if already visible.
    const card = this.host.querySelector<HTMLElement>(".spectacle-card")!;
    card.getAnimations().forEach((a) => a.cancel());
    this.host.style.setProperty(
      "--caption-top",
      `${Math.min(cabinet.bottom, document.querySelector(".controls")!.getBoundingClientRect().top) - card.offsetHeight - 36}px`,
    );
    if (!document.body.classList.contains("reduced-motion"))
      card.animate(
        [
          { opacity: 0, transform: "translateY(25px) scale(.9)" },
          { opacity: 1, transform: "none" },
        ],
        {
          delay: kind === "ride" ? 550 : 350,
          duration: 650,
          fill: "backwards",
          easing: "cubic-bezier(.12,.8,.2,1)",
        },
      );
  }
  dispose() {
    this.stage.querySelectorAll("video").forEach((v) => v.pause());
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.syncPlayback);
  }
}

