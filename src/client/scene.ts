/** The frontier is a generated film plate. No procedural particle or geometry animation. */
import { FrontierFilm } from './frontier-framing';
export class FrontierScene {
  private film: FrontierFilm;
  private movies: HTMLVideoElement[] = [];
  private night = false;
  private reduced = false;
  private frame = 0;
  private previous = 0;
  private resize = () => {
    this.canvas.width = Math.round(
      innerWidth * Math.min(devicePixelRatio, 1.5),
    );
    this.canvas.height = Math.round(
      innerHeight * Math.min(devicePixelRatio, 1.5),
    );
  };
  constructor(private canvas: HTMLCanvasElement) {
    this.film = new FrontierFilm(canvas);
    for (const name of ["frontier-noon", "frontier-night"]) {
      const video = document.createElement("video");
      video.src = `/video/environment-loop-v2/${name}.mp4`;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
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
    this.movies.forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
  }
}
