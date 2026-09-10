import { createVideo } from './media-element';
import { parlorResidentMedia } from './resident-media';
export const MOVIES = {
  queen: parlorResidentMedia('queen').idle,
  medium: parlorResidentMedia('medium').idle,
  gunslinger: "/video/cast-loop-v1/dealer-idle.webm",
  gold: "/video/cast-loop-v1/gold-mine-loop.mp4",
  preacher: "/video/preacher-book-v10.webm",
  rider: "/video/rider-gallop-v5.webm",
} as const;
export type MovieKey = keyof typeof MOVIES;
export function movie(key: MovieKey, offset = 0, source: string = MOVIES[key]) {
  const video = createVideo();
  video.src = source;
  video.poster = source.replace(/\.(webm|mp4)$/, ".png");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  // These six loops are visible ambient background from the very first
  // paint, so they still need to start buffering immediately — but they
  // are not what makes the game playable (the poster already covers the
  // gap until each one decodes, per the fallback in MovieSymbols.paint).
  // Deprioritizing their fetch keeps them from competing with the JS
  // bundle and the session connect() call for early bandwidth.
  video.setAttribute("fetchpriority", "low");
  video.dataset.movie = key;
  // Slow the baked vapor only in the repeating reel portrait.
  if (key === 'preacher') video.playbackRate = .8;
  video.setAttribute("aria-hidden", "true");
  video.addEventListener(
    "loadedmetadata",
    () => {
      if (offset && video.duration) video.currentTime = offset % video.duration;
    },
    { once: true },
  );
  return video;
}

/** Six decoded movies serve every repeated symbol; twenty-five independent decoders are unnecessary. */
export class MovieSymbols {
  private sources = new Map<MovieKey, HTMLVideoElement>();
  private posters = new Map<MovieKey, HTMLImageElement>();
  private tiles: { canvas: HTMLCanvasElement; key: MovieKey }[] = [];
  private decodedTiles = new WeakMap<HTMLCanvasElement, MovieKey>();
  private reduced = false;
  private dirty = true;
  private previous = 0;
  constructor(private host: HTMLElement) {
    const parlor = document.documentElement.classList.contains("unified-parlor") ||
      new URLSearchParams(location.search).get("parlor") === "1";
    (Object.keys(MOVIES) as MovieKey[]).forEach((key, i) => {
      const resident = key === "queen" || key === "medium";
      const source = movie(key, i * 0.61, resident
        ? parlorResidentMedia(key as 'queen' | 'medium').idle : MOVIES[key]);
      if (resident) source.dataset.parlorResident = "true";
      this.sources.set(key, source);
      const poster = new Image();
      if(import.meta.env.MODE === "public-demo")poster.crossOrigin="anonymous";
      poster.src = source.poster;
      this.posters.set(key, poster);
    });
    new MutationObserver(() => {
      this.dirty = true;
    }).observe(host, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", () => this.sync());
    this.sync();
    requestAnimationFrame(this.paint);
  }
  setReduced(value: boolean) {
    this.reduced = value;
    this.sync();
  }
  private sync() {
    for (const video of this.sources.values()) {
      if (document.hidden || this.reduced) video.pause();
      else void video.play().catch(() => {});
    }
  }
  private paint = (time: number) => {
    requestAnimationFrame(this.paint);
    if (document.hidden || time - this.previous < 1000 / 24) return;
    this.previous = time;
    if (this.dirty) {
      this.tiles = [
        ...this.host.querySelectorAll<HTMLCanvasElement>("canvas[data-movie]"),
      ].map((canvas) => ({ canvas, key: canvas.dataset.movie as MovieKey }));
      this.dirty = false;
    }
    for (const { canvas, key } of this.tiles) {
      const source = this.sources.get(key);
      const poster = this.posters.get(key);
      const decoded = source && !source.seeking && source.readyState >= 2 &&
        source.videoWidth > 0 && source.videoHeight > 0;
      // Decoder gaps at a loop boundary must not flash the opening poster.
      // Keep this tile's last native frame, but never keep a different symbol.
      if (!decoded && this.decodedTiles.get(canvas) === key) continue;
      const frame =
        decoded
          ? source
          : poster?.complete && poster.naturalWidth
            ? poster
            : undefined;
      if (!frame) {
        if (this.decodedTiles.has(canvas) && this.decodedTiles.get(canvas) !== key) {
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          this.decodedTiles.delete(canvas);
          delete canvas.dataset.ready;
        }
        continue;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      if (canvas.width !== 320) {
        canvas.width = 320;
        canvas.height = 240;
      }
      ctx.clearRect(0, 0, 320, 240);
      if (["gunslinger", "queen", "medium", "preacher"].includes(key)) {
        const w =
          frame instanceof HTMLVideoElement
            ? frame.videoWidth
            : frame.naturalWidth;
        const h =
          frame instanceof HTMLVideoElement
            ? frame.videoHeight
            : frame.naturalHeight;
        if (source?.dataset.parlorResident) {
          // Frame the face/hat at reel distance, rather than shrinking the room performance.
          // Source crop stays 4:3, so the portrait is never stretched.
          ctx.drawImage(frame, w * (key === "medium" ? .29 : .28), h * (key === "medium" ? .11 : .018), w * .50, w * .375, 0, 0, 320, 240);
        } else ctx.drawImage(frame, w * 0.25, 0, w * 0.5, h * 0.65, 0, 0, 320, 240);
      } else ctx.drawImage(frame, 0, 0, 320, 240);
      canvas.dataset.ready = frame === source ? "true" : "poster";
      if (frame === source) this.decodedTiles.set(canvas, key);
      else this.decodedTiles.delete(canvas);
    }
  };
}
