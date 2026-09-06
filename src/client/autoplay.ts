import type { SpinResult } from "../engine/types";
export interface AutoOptions {
  spins: number;
  lossLimit: number;
  singleWin: number;
  profitLimit: number;
  stopOnBonus: boolean;
}
export interface AutoContext {
  balance: number;
  bet: number;
  bonus: boolean;
  ready: boolean;
}
/** Serial, settled-result autoplay. Amounts are integer minor credits. */
export class CasinoAutoplay {
  active = false;
  remaining = 0;
  reason = "";
  private generation = 0;
  constructor(
    private context: () => AutoContext,
    private spin: () => Promise<SpinResult | undefined>,
    private wait: () => Promise<void>,
    private changed: () => void,
  ) {}
  stop(reason = "Stopped") {
    this.generation++;
    this.active = false;
    this.reason = reason;
    this.changed();
  }
  async start(options: AutoOptions) {
    if (this.active) return;
    const initial = this.context();
    if (
      !Number.isSafeInteger(options.spins) ||
      options.spins < 1 ||
      options.spins > 1000 ||
      !Number.isSafeInteger(options.lossLimit) ||
      (options.lossLimit !== 0 && options.lossLimit < initial.bet) ||
      ![options.singleWin, options.profitLimit].every(
        (v) => Number.isSafeInteger(v) && v >= 0,
      )
    )
      throw new Error("Choose valid autoplay limits.");
    const generation = ++this.generation;
    this.active = true;
    this.remaining = options.spins;
    this.reason = "";
    this.changed();
    const stop = (reason: string) => {
      if (this.generation === generation) this.stop(reason);
    };
    try {
      while (this.active && this.generation === generation) {
        const current = this.context();
        if (!current.ready) {
          stop("Autoplay stopped");
          break;
        }
        if (current.bet !== initial.bet) {
          stop("Bet changed");
          break;
        }
        if (!current.bonus) {
          if (this.remaining === 0) {
            stop("Autoplay complete");
            break;
          }
          if (current.balance < current.bet) {
            stop("Insufficient credits");
            break;
          }
          // Do not place a wager that could exceed the selected net-loss budget.
          if (
            options.lossLimit > 0 &&
            initial.balance - current.balance + current.bet > options.lossLimit
          ) {
            stop("Loss limit reached");
            break;
          }
        }
        const result = await this.spin();
        if (this.generation !== generation || !this.active) break;
        if (!result) {
          stop("Autoplay stopped");
          break;
        }
        if (result.phase !== "bonus") this.remaining--;
        this.changed();
        const award = Math.max(
          result.payout,
          result.events.find((e) => e.type === "bonus-end")?.value || 0,
        );
        if (options.singleWin && award >= options.singleWin) {
          stop("Single-win limit reached");
          break;
        }
        if (
          options.profitLimit &&
          result.state.balance - initial.balance >= options.profitLimit
        ) {
          stop("Profit limit reached");
          break;
        }
        if (
          options.stopOnBonus &&
          result.events.some((e) => e.type === "bonus-start")
        ) {
          stop("Free spins awarded");
          break;
        }
        await this.wait();
      }
    } catch {
      stop("Autoplay interrupted");
    }
  }
}
