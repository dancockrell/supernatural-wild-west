import { createVideo } from './media-element';
import { parlorResidentMedia } from './resident-media';
export type GhostClip =
  | "rider-gallop"
  | "medium-seance"
  | "gunslinger-chains"
  | "queen-lantern"
  | "preacher-book";
/** Filled-silhouette alpha preserves dark clothing; no screen blending. */
export function ghostSprite(clip: GhostClip) {
  const video = createVideo();
  video.className = "ghost-sprite";
  video.dataset.ghost = clip;
  video.muted = true;
  video.playsInline = true;
  video.loop = false;
  video.preload = "metadata";
  video.setAttribute("aria-hidden", "true");
  const version =
    clip === "rider-gallop"
      ? "v5"
      : clip === "medium-seance"
        ? "v11"
        : clip === "gunslinger-chains"
          ? "v12"
          : "v10";
  video.src = clip==='queen-lantern'||clip==='medium-seance'
    ? parlorResidentMedia(clip==='queen-lantern'?'queen':'medium').reaction
    : `/video/${clip}-${version}.webm`;
  video.poster=video.src.replace('.webm','.png');
  video.addEventListener("error", () => video.classList.add("poster-fallback"));
  return video;
}
