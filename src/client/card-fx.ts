type Grain = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  seed: number;
};
// Smooth, non-periodic value noise; decorative only, never connected to slot RNG.
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const noise = (x: number, seed: number) => {
  const i = Math.floor(x),
    f = x - i,
    u = f * f * (3 - 2 * f);
  return hash(i + seed) * (1 - u) + hash(i + seed + 1) * u;
};
/** Shared 30 Hz compositor for dust tiles. Pure presentation, independent of game RNG. */
export class CardEffects {
  private plume = document.createElement("canvas");
  private cards: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    index: number;
  }[] = [];
  private observer: MutationObserver;
  private particles = new WeakMap<HTMLCanvasElement, Grain[]>();
  private frame = 0;
  private last = 0;
  private reduced = false;
  private dirty = true;
  constructor(private reels: HTMLElement) {
    this.plume.width = this.plume.height = 64;
    const brush = this.plume.getContext("2d")!;
    const soft = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
    soft.addColorStop(0, "#b8b4a577");
    soft.addColorStop(0.3, "#a9aca044");
    soft.addColorStop(0.65, "#939c961a");
    soft.addColorStop(1, "#917c5f00");
    brush.fillStyle = soft;
    brush.fillRect(0, 0, 64, 64);
    this.observer = new MutationObserver(() => {
      this.dirty = true;
    });
    this.observer.observe(reels, { childList: true, subtree: true });
    this.frame = requestAnimationFrame(this.render);
    reels.addEventListener("pointermove", this.pointer);
    reels.addEventListener("pointerleave", this.leave);
  }
  private hovered?: HTMLElement;
  private pointer = (e: PointerEvent) => {
    if (this.reduced || e.pointerType === "touch") return;
    const card = (e.target as Element).closest<HTMLElement>(".symbol");
    if (!card || card.closest(".rolling")) return;
    if (this.hovered !== card) {
      this.leave();
      this.hovered = card;
    }
    const box = card.getBoundingClientRect();
    card.style.setProperty(
      "--light-x",
      `${((e.clientX - box.x) / box.width) * 100}%`,
    );
    card.style.setProperty(
      "--light-y",
      `${((e.clientY - box.y) / box.height) * 100}%`,
    );
    card.classList.add("card-lit");
  };
  private leave = () => {
    this.hovered?.classList.remove("card-lit");
    this.hovered = undefined;
  };
  setReduced(value: boolean) {
    this.reduced = value;
    this.dirty = true;
    if (value) this.leave();
  }
  private scan() {
    this.cards = [
      ...this.reels.querySelectorAll<HTMLCanvasElement>(".dust-vortex"),
    ].map((canvas, index) => {
      if (canvas.width !== 200) {
        canvas.width = 200;
        canvas.height = 200;
      }
      return { canvas, ctx: canvas.getContext("2d")!, index };
    });
  }
  private render = (now: number) => {
    this.frame = requestAnimationFrame(this.render);
    if (document.hidden || now - this.last < 33) return;
    if (this.reduced && !this.dirty) return;
    if (this.dirty) {
      this.scan();
      this.dirty = false;
    }
    const dt = Math.min(0.055, (now - this.last) / 1000);
    this.last = now;
    for (const { canvas, ctx: c, index } of this.cards) {
      if (canvas.closest(".rolling")) continue;
      const t = this.reduced ? 2.1 : now / 1000;
      c.clearRect(0, 0, 200, 200);
      let grains = this.particles.get(canvas);
      if (!grains) {
        grains = Array.from({ length: 42 }, (_, i) => {
          const seed = i * 19.73 + index * 137.91;
          return {
            x: hash(seed) * 240 - 20,
            y: 35 + hash(seed + 5) * 155,
            vx: 18,
            vy: 0,
            age: hash(seed + 3) * 3,
            life: 3 + hash(seed + 4) * 4,
            size: 42 + hash(seed + 8) * 46,
            seed,
          };
        });
        this.particles.set(canvas, grains);
      }
      // Broad overlapping vapor follows a slow, irregular wind field.
      const gust = Math.pow(noise(t * 0.43, index * 71 + 9), 2);
      const wind = 9 + gust * 34;
      const crosswind = (noise(t * 0.27, index * 47 + 88) - 0.5) * 22;
      for (let i = 0; i < grains.length; i++) {
        const p = grains[i];
        if (!this.reduced) {
          p.age += dt;
          if (p.age > p.life || p.x > 235 || p.y < -30 || p.y > 225) {
            p.seed += 113.17;
            p.x = -25 - hash(p.seed + 1) * 40;
            p.y = 60 + hash(p.seed + 2) * 137;
            p.age = 0;
            p.life = 3 + hash(p.seed + 3) * 5;
            p.vx = wind * 0.5;
            p.vy = 0;
          }
          const shear = (noise(p.y * 0.025 + t * 0.9, index * 23) - 0.5) * 24;
          const lift = (noise(p.x * 0.023 + t * 0.63, p.seed) - 0.5) * 30;
          const drag = 1.1;
          p.vx += (wind + shear - p.vx) * dt * drag;
          p.vy += (crosswind + lift - 4 - p.vy) * dt * drag;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        const lifeFade = Math.min(1, p.age * 2, (p.life - p.age) * 1.5);
        const edgeFade = Math.max(
          0,
          Math.min(1, p.x / 24, (200 - p.x) / 28, p.y / 24, (200 - p.y) / 20),
        );
        c.save();
        c.translate(p.x, p.y);
        c.rotate(Math.atan2(p.vy, p.vx) * 0.35);
        c.globalAlpha = Math.max(0, lifeFade * edgeFade) * (0.3 + gust * 0.12);
        const stretch = 1.2 + hash(p.seed + 2) * 0.55;
        c.drawImage(
          this.plume,
          (-p.size * stretch) / 2,
          -p.size * 0.48,
          p.size * stretch,
          p.size * 0.96,
        );
        c.restore();
      }
      c.globalAlpha = 1;
    }
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.reels.removeEventListener("pointermove", this.pointer);
    this.reels.removeEventListener("pointerleave", this.leave);
  }
}
