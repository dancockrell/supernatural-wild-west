import type { SpinResult } from "../engine/types";
/**
 * All spectacle is downstream of authoritative results; no outcome generation here.
 *
 * DEAD FALLBACK REMOVED. This class used to carry a second Ride of the Damned:
 * a `.spectral-rider` div holding `ghostSprite("rider-gallop")`
 * (/video/rider-gallop-v5.webm), a `riding`/`preparing` class pair, a
 * MutationObserver watching both that element and #spectacle, an async
 * `haunt()` that crossed the horse over the reveal, and a canvas smoke plume
 * that only emitted while `riding` was set.
 *
 * It was the no-native-film path: main.ts called it as
 * `if (kind === "ride" && !reduced && !nativePerformance) effects.haunt()`.
 * That branch cannot be taken. `nativePerformance` is
 * `#spectacle .feature-ghost`, read immediately after `cinematics.play(kind)`,
 * and cinematics.ts appends a `.feature-ghost` spirit unconditionally for
 * kind 'ride' (src/client/cinematics.ts:85-125), synchronously, before its src
 * has been fetched.
 *
 * The load-failure case is the one worth measuring rather than reasoning
 * about, because that is the only thing the fallback could still have been
 * for. Measured, with /video/rare-features-v4/ride.webm aborted at the route:
 * from the instant #spectacle opens it holds exactly one `.feature-ghost`
 * (readyState 0, error still null), which errors 3ms later with code 4
 * (MEDIA_ERR_SRC_NOT_SUPPORTED); the spectacle then closes through that
 * element's own `error` listener in main.ts rather than falling back to
 * anything. So `nativePerformance` is non-null for this kind whether the film
 * loads or not, `!nativePerformance` is unsatisfiable, and haunt() could not
 * run even in the case it existed for - the guard tested element presence,
 * which is not the same proposition as "the film plays".
 *
 * Two other specs had already measured the same thing from the outside; see
 * the comments in tests/browser/rider-loading.spec.ts and game.spec.ts, which
 * record `.spectral-rider`'s video sitting at currentTime 0 with readyState 4
 * forever while the authored film plays.
 *
 * What removing it saves is one duplicate page-load video fetch: measured, `/`
 * requested /video/rider-gallop-v5.webm twice and its poster once before, and
 * once and once after. The file does not disappear from the page and should
 * not - `rider` is a live reel symbol (symbols.ts:30) whose tile is decoded by
 * MovieSymbols from the same source. This class was the second decoder of it.
 * The horse in the reveal is not lost either: it is the authored film, and
 * cinematics.followNativeFilm drives its reveal from the film's own clock.
 */
export class SpectralEffects {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private wash = document.createElement("div");
  private frame = 0;
  private reduced = false;
  private bolt = 0;
  private boltX = 0.72;
  private width = 0;
  private height = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private presentation = 0;
  constructor() {
    this.canvas.id = "impact-effects";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.wash.className = "storm-wash";
    this.wash.setAttribute("aria-hidden", "true");
    document.body.append(this.wash);
    window.addEventListener("resize", this.resize);
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
      this.presentation++;
      document.querySelector(".win-ribbon")?.remove();
      document
        .querySelectorAll(".win-focus")
        .forEach((s) => s.classList.remove("win-focus"));
      this.bolt = 0;
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
  private lastTime = 0;
  private render = (time: number) => {
    this.frame = requestAnimationFrame(this.render);
    const dt = Math.min(0.04, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    if (document.hidden) return;
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    if (this.reduced) return;
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
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.timers.forEach(clearTimeout);
    this.canvas.remove();
    this.wash.remove();
  }
}
