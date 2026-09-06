import type { SpinResult } from "../engine/types";
import { ghostSprite } from "./ghost-sprite";
/** All spectacle is downstream of authoritative results; no outcome generation here. */
export class SpectralEffects {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private rider = document.createElement("div");
  private performance = ghostSprite("rider-gallop");
  private riderObserver: MutationObserver;
  private wash = document.createElement("div");
  private frame = 0;
  private smokeBrush = document.createElement("canvas");
  private smoke: { x: number; y: number; size: number; age: number }[] = [];
  private lastSmoke = 0;
  private reduced = false;
  private bolt = 0;
  private boltX = 0.72;
  private width = 0;
  private height = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private presentation = 0;
  private haunting = 0;
  private visibility = () => {
    if (document.hidden) this.performance.pause();
    else if (
      !this.reduced &&
      this.rider.classList.contains("riding") &&
      !this.rider.parentElement?.hidden
    )
      void this.performance.play().catch(() => {});
  };
  constructor() {
    this.smokeBrush.width = this.smokeBrush.height = 96;
    const brush = this.smokeBrush.getContext("2d")!;
    const haze = brush.createRadialGradient(48, 48, 0, 48, 48, 48);
    haze.addColorStop(0, "#a6b9aa66");
    haze.addColorStop(0.35, "#879e943d");
    haze.addColorStop(1, "#82918b00");
    brush.fillStyle = haze;
    brush.fillRect(0, 0, 96, 96);
    this.canvas.id = "impact-effects";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.rider.className = "spectral-rider";
    this.rider.setAttribute("aria-hidden", "true");
    this.performance.muted = true;
    this.performance.playsInline = true;
    this.performance.preload = "auto";
    this.rider.append(this.performance);
    this.riderObserver = new MutationObserver(() => {
      if (
        this.rider.parentElement?.hidden ||
        (!this.rider.classList.contains("riding") &&
          !this.rider.classList.contains("preparing"))
      )
        this.performance.pause();
    });
    this.riderObserver.observe(this.rider, {
      attributes: true,
      attributeFilter: ["class"],
    });
    document.body.append(this.rider);
    this.wash.className = "storm-wash";
    this.wash.setAttribute("aria-hidden", "true");
    document.body.append(this.wash);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.visibility);
    this.resize();
    this.frame = requestAnimationFrame(this.render);
  }
  private resize = () => {
    this.width = innerWidth;
    this.height = innerHeight;
    const dpr = Math.min(1.5, devicePixelRatio);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, ms);
    this.timers.push(id);
  }
  setReduced(value: boolean) {
    this.reduced = value;
    if (value) {
      this.smoke = [];
      this.presentation++;
      document.querySelector(".win-ribbon")?.remove();
      document
        .querySelectorAll(".win-focus")
        .forEach((s) => s.classList.remove("win-focus"));
      this.bolt = 0;
      this.rider.classList.remove("riding");
      this.performance.pause();
      document
        .querySelectorAll(".reel-impact,.anticipation,.cabinet-impact")
        .forEach((e) =>
          e.classList.remove("reel-impact", "anticipation", "cabinet-impact"),
        );
    }
  }
  setPhase(night: boolean) {
    document.body.classList.toggle("spectral-weather", night);
  }
  startSpin() {
    this.presentation++;
    document
      .querySelectorAll(".win-focus")
      .forEach((s) => s.classList.remove("win-focus"));
    document.querySelector(".win-ribbon")?.remove();
    document
      .querySelectorAll(".symbol.winning")
      .forEach((s) => s.classList.remove("winning"));
    document.querySelector(".cabinet")?.classList.add("is-spinning");
    document
      .querySelectorAll(".anticipation")
      .forEach((r) => r.classList.remove("anticipation"));
  }
  landReel(index: number, anticipation: boolean) {
    const reel = document.querySelector<HTMLElement>(`[data-reel="${index}"]`);
    if (!reel) return;
    if (!this.reduced) {
      reel.classList.remove("reel-impact");
      void reel.offsetWidth;
      reel.classList.add("reel-impact");
      this.later(() => reel.classList.remove("reel-impact"), 650);
    }
    if (anticipation && !this.reduced)
      for (let i = index + 1; i < 5; i++)
        document
          .querySelector(`[data-reel="${i}"]`)
          ?.classList.add("anticipation");
  }
  finish(result: SpinResult) {
    document.querySelector(".cabinet")?.classList.remove("is-spinning");
    document
      .querySelectorAll(".anticipation")
      .forEach((r) => r.classList.remove("anticipation"));
    if (this.reduced || result.payout <= result.bet) return;
    const presentation = this.presentation;
    // Sequence the actual winning character groups; never imply fixed paylines.
    result.wins.slice(0, 4).forEach((win, index) => {
      this.later(() => {
        if (presentation !== this.presentation) return;
        document
          .querySelectorAll(".win-focus")
          .forEach((s) => s.classList.remove("win-focus"));
        for (const cell of win.cells)
          document
            .querySelector(
              `[data-reel="${Math.floor(cell / result.grid[0].length)}"] .symbol:nth-child(${(cell % result.grid[0].length) + 1})`,
            )
            ?.classList.add("win-focus");
      }, index * 650);
    });
    this.later(() => {
      if (presentation === this.presentation)
        document
          .querySelectorAll(".win-focus")
          .forEach((s) => s.classList.remove("win-focus"));
    }, 2800);
    for (const cell of result.gold?.cells || []) {
      const tile = document.querySelectorAll(".symbol")[cell];
      tile?.classList.add("gold-strike");
      this.later(() => tile?.classList.remove("gold-strike"), 1400);
    }
    const reelAward = Math.max(0, result.payout - (result.poker?.amount || 0));
    if (reelAward > 0) this.countWin(reelAward);
    if (result.events.some((e) => e.type === "witching")) this.lightning();
    else if (result.payout >= result.bet * 20) this.impact();
    for (const e of result.events)
      if (e.type === "transform" && e.location !== undefined) {
        for (const cell of e.cells || []) {
          const target = document.querySelector(
            `[data-reel="${Math.floor(cell / result.grid[0].length)}"] .symbol:nth-child(${(cell % result.grid[0].length) + 1})`,
          );
          target?.classList.add("transmuted");
          this.later(() => target?.classList.remove("transmuted"), 950);
        }
      }
  }
  private countWin(amount: number) {
    // The authoritative amount stays in #win; a transient decorative ribbon counts separately.
    const old = document.querySelector(".win-ribbon");
    old?.remove();
    const ribbon = document.createElement("div");
    ribbon.className = "win-ribbon";
    ribbon.setAttribute("aria-hidden", "true");
    document.querySelector(".cabinet")?.append(ribbon);
    ribbon.innerHTML = `<span>REELS</span><strong>${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>CR</small></strong>`;
    this.later(() => ribbon.remove(), 1900);
  }
  private impact() {
    const cabinet = document.querySelector<HTMLElement>(".cabinet");
    cabinet?.classList.remove("cabinet-impact");
    if (cabinet) {
      void cabinet.offsetWidth;
      cabinet.classList.add("cabinet-impact");
      this.later(() => cabinet.classList.remove("cabinet-impact"), 700);
    }
  }
  lightning() {
    if (this.reduced) return;
    this.bolt = 1;
    this.boltX = 0.64 + Math.random() * 0.23;
    this.wash.classList.remove("struck");
    void this.wash.offsetWidth;
    this.wash.classList.add("struck");
    this.later(() => this.wash.classList.remove("struck"), 950);
  }
  async haunt() {
    if (this.reduced) return;
    const haunting = ++this.haunting;
    // Keep the apparition inside the reveal so copy remains above it and skip hides it.
    document.getElementById("spectacle")?.append(this.rider);
    this.riderObserver.observe(document.getElementById("spectacle")!, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
    this.lightning();
    this.impact();
    this.rider.classList.remove("riding");
    void this.rider.offsetWidth;
    this.rider.classList.add("preparing");
    this.performance.currentTime = 0;
    try {
      await this.performance.play();
      if (
        haunting !== this.haunting ||
        this.reduced ||
        this.rider.parentElement?.hidden
      ) {
        this.performance.pause();
        return;
      }
      this.rider.classList.add("riding");
      this.later(() => {
        if (haunting === this.haunting) this.rider.classList.remove("riding");
      }, 3200);
    } catch {
      this.rider.classList.remove("riding");
    } finally {
      this.rider.classList.remove("preparing");
    }
  }

  private lastTime = 0;
  private render = (time: number) => {
    this.frame = requestAnimationFrame(this.render);
    const dt = Math.min(0.04, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    if (document.hidden) return;
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    if (this.reduced) return;
    c.globalCompositeOperation = "source-over";
    if (
      this.rider.classList.contains("riding") &&
      !this.rider.parentElement?.hidden &&
      time - this.lastSmoke > 110
    ) {
      this.lastSmoke = time;
      const box = this.performance.getBoundingClientRect();
      const imageHeight = Math.min(box.height, box.width * 0.75);
      const x = box.x + box.width * 0.48;
      const y = box.y + (box.height - imageHeight) / 2 + imageHeight * 0.87;
      if (x > -80 && x < innerWidth + 80)
        this.smoke.push({
          x,
          y,
          size: Math.min(180, box.width * 0.18),
          age: 0,
        });
    }
    for (const puff of this.smoke) {
      puff.age += dt;
      puff.x += dt * 20;
      puff.y -= dt * 4;
      const swell = 1 + puff.age * 0.65;
      c.globalAlpha =
        Math.min(1, puff.age * 8) * Math.max(0, 1 - puff.age / 1.5) * 0.65;
      c.drawImage(
        this.smokeBrush,
        puff.x - puff.size * swell,
        puff.y - puff.size * 0.3,
        puff.size * 2 * swell,
        puff.size * 0.6 * swell,
      );
    }
    this.smoke = this.smoke.filter((p) => p.age < 1.5);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "lighter";
    if (this.bolt > 0) {
      this.bolt = Math.max(0, this.bolt - dt * 1.9);
      const x = this.boltX * this.width;
      c.globalAlpha = this.bolt * 0.75;
      c.shadowColor = "#8abfff";
      c.shadowBlur = 18;
      c.strokeStyle = "#ccecff";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, 0);
      for (let i = 1; i <= 9; i++)
        c.lineTo(x + Math.sin(i * 4.9) * 30 + i * 2, i * this.height * 0.028);
      c.stroke();
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  };
  dispose() {
    this.performance.pause();
    this.riderObserver.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.timers.forEach(clearTimeout);
    this.canvas.remove();
    this.rider.remove();
    this.wash.remove();
  }
}
