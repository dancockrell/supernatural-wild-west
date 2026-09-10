import { createVideo } from './media-element';
/** The frontier is a generated film plate. No procedural particle or geometry animation. */
import { FrontierFilm } from './frontier-framing';
export class FrontierScene {
  private film: FrontierFilm;
  private movies: HTMLVideoElement[] = [];
  private night = false;
  private reduced = false;
  private frame = 0;
  private previous = 0;
  private dprWatcher: MediaQueryList | undefined;
  private resize = () => {
    this.canvas.width = Math.round(
      innerWidth * Math.min(devicePixelRatio, 1.5),
    );
    this.canvas.height = Math.round(
      innerHeight * Math.min(devicePixelRatio, 1.5),
    );
    // `resize` alone misses a devicePixelRatio change with no viewport-size
    // change (moving the window to a display with a different DPR, or an
    // OS zoom change) in some browsers. A `resolution` media query only
    // fires once it stops matching the ratio it was created at, so it has
    // to be re-armed at the new ratio after every firing.
    this.dprWatcher?.removeEventListener("change", this.onDprChange);
    this.dprWatcher = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.dprWatcher.addEventListener("change", this.onDprChange);
  };
  private onDprChange = () => this.resize();
  constructor(private canvas: HTMLCanvasElement) {
    this.film = new FrontierFilm(canvas);
    for (const [i, name] of ["frontier-noon", "frontier-night"].entries()) {
      const video = createVideo();
      video.src = `/video/environment-loop-v2/${name}.mp4`;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      // Only the phase that starts active is worth buffering up front; the
      // other loads on demand the first time setPhase() actually switches
      // to it, so the two loops don't compete for bandwidth on startup.
      video.preload = i === Number(this.night) ? "auto" : "none";
      video.setAttribute("fetchpriority", "low");
      this.movies.push(video);
    }
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.sync);
    this.resize();
    this.sync();
    this.frame = requestAnimationFrame(this.paint);
  }
  private sync = () => {
    this.movies.forEach((v, i) => {
      if (document.hidden || this.reduced || i !== Number(this.night))
        v.pause();
      else void v.play().catch(() => {});
    });
  };
  private paint = (t: number) => {
    this.frame = requestAnimationFrame(this.paint);
    if (document.hidden || t - this.previous < 1000 / 24) return;
    this.previous = t;
    const v = this.movies[Number(this.night)];
    if (v.readyState < 2) return;
    this.film.draw(v);
  };
  setPhase(night: boolean) {
    if (this.night !== night) {
      this.night = night;
      const video = this.movies[Number(night)];
      if (video.preload !== "auto") {
        video.preload = "auto";
        video.load();
      }
      this.sync();
    }
  }
  setReducedMotion(value: boolean) {
    this.reduced = value;
    this.sync();
  }
  pulse() {} // Event films own transitions; no synthetic sky flare.
  dispose() {
    this.film.dispose();
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.sync);
    this.dprWatcher?.removeEventListener("change", this.onDprChange);
    this.movies.forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
  }
}
