/** Pure per-character movie sequencing. The adapter owns media; the engine owns outcomes. */
export interface CharacterAction {
  id: string;
  clip: string;
  priority: number;
  coalesceKey?: string;
  cues?: readonly string[];
  /** Cosmetic actions may expire; meaningful queued reactions survive ordinary spins by default. */
  expireOnTurn?: boolean;
}
export interface CharacterPlayback {
  token: number;
  clip: string;
  loop: boolean;
  paused: boolean;
  actionId?: string;
}
export interface CharacterCue {
  actionId: string;
  name: string;
}
type QueuedAction = CharacterAction & { order: number; turn: number };

export class CharacterSequence {
  private queue: QueuedAction[] = [];
  private active?: QueuedAction;
  private turn = 0;
  private order = 0;
  private token = 0;
  private reduced = false;
  private started = false;
  private fired = new Set<string>();
  private playback: CharacterPlayback;

  constructor(
    private idleClip: string,
    private maxPending = 4,
  ) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 1)
      throw new Error("Invalid character queue capacity");
    this.playback = this.idle();
  }
  get current(): Readonly<CharacterPlayback> {
    return { ...this.playback };
  }
  get pending(): readonly string[] {
    return this.queue.map((action) => action.id);
  }

  private idle(): CharacterPlayback {
    this.active = undefined;
    this.started = false;
    this.fired.clear();
    this.playback = {
      token: ++this.token,
      clip: this.idleClip,
      loop: true,
      paused: this.reduced,
    };
    return this.current;
  }
  /** Returns false if reduced motion or bounded capacity rejects this action. Never settles game state. */
  enqueue(action: CharacterAction): boolean {
    if (!action.id || !action.clip || !Number.isFinite(action.priority))
      throw new Error("Invalid character action");
    if (
      this.reduced ||
      action.id === this.active?.id ||
      this.queue.some((item) => item.id === action.id)
    )
      return false;
    if (action.coalesceKey)
      this.queue = this.queue.filter(
        (item) => item.coalesceKey !== action.coalesceKey,
      );
    this.queue.push({
      ...action,
      cues: action.cues ? [...action.cues] : undefined,
      order: this.order++,
      turn: this.turn,
    });
    this.queue.sort((a, b) => b.priority - a.priority || a.order - b.order);
    this.queue = this.queue.slice(0, this.maxPending);
    return this.queue.some((item) => item.id === action.id);
  }
  isCurrent(token: number): boolean {
    return token === this.playback.token;
  }
  /** Adapter calls only after this token's movie has become the visible, playing layer. */
  markStarted(token: number): boolean {
    if (!this.isCurrent(token) || this.reduced) return false;
    this.started = true;
    return true;
  }
  /** Loop boundary, not a wall-clock timer. With no action the same idle keeps looping. */
  idleBoundary(token: number): Readonly<CharacterPlayback> | null {
    if (!this.isCurrent(token) || this.reduced || this.active || !this.started)
      return null;
    const action = this.queue.shift();
    if (!action) return null;
    this.active = action;
    this.started = false;
    this.fired.clear();
    this.playback = {
      token: ++this.token,
      clip: action.clip,
      loop: false,
      paused: false,
      actionId: action.id,
    };
    return this.current;
  }
  /** Only declared movie cues can reveal cards or trigger foley; each fires at most once. */
  cue(token: number, name: string): CharacterCue | null {
    const action = this.active;
    if (
      !this.isCurrent(token) ||
      !this.started ||
      this.reduced ||
      !action ||
      !action.cues?.includes(name) ||
      this.fired.has(name) ||
      (action.expireOnTurn && action.turn !== this.turn)
    )
      return null;
    this.fired.add(name);
    return { actionId: action.id, name };
  }
  complete(token: number): Readonly<CharacterPlayback> | null {
    if (!this.isCurrent(token) || !this.active || !this.started) return null;
    return this.idle();
  }
  failed(token: number): Readonly<CharacterPlayback> | null {
    if (!this.isCurrent(token)) return null;
    return this.idle();
  }
  /** Ordinary spins retain meaningful branches. Opt-in cosmetic expiry cannot interrupt a playing movie. */
  advanceTurn(): Readonly<CharacterPlayback> | null {
    this.turn++;
    this.queue = this.queue.filter((action) => !action.expireOnTurn);
    if (this.active?.expireOnTurn && !this.started) return this.idle();
    return null;
  }
  /** Authoritative restore/reconnect invalidates queued actions and all old media callbacks. */
  reset(): Readonly<CharacterPlayback> {
    this.queue = [];
    this.turn++;
    return this.idle();
  }
  setReduced(value: boolean): Readonly<CharacterPlayback> | null {
    if (value === this.reduced) return null;
    this.reduced = value;
    return this.reset();
  }
}
