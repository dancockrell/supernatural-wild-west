export const REGULAR = [
  "gunslinger",
  "medium",
  "queen",
  "preacher",
  "rider",
  "ace",
  "king",
  "horseshoe",
  "bottle",
] as const;
export type Regular = (typeof REGULAR)[number];
export type SymbolId = Regular | "gold" | "wild" | "scatter" | "dust";
export type Grid = SymbolId[][];
export type Phase = "noon" | "witching" | "bonus";
export const LOCATIONS = [
  "Graveyard",
  "Saloon",
  "Jail",
  "Mine",
  "Church",
] as const;
export interface GameState {
  schemaVersion: 1;
  configVersion: string;
  sequence: number;
  balance: number;
  phase: Phase;
  witchSpins: number;
  awakened: number[];
  sticky: number[];
  freeSpins: number;
  bonusAwarded: number;
  bonusBet: number;
  bonusWin: number;
  roundWin: number;
  roundBet: number;
  poker?: { cards: number[]; bet: number };
}
export interface Win {
  symbol: Regular;
  count: number;
  ways: number;
  amount: number;
  cells: number[];
}
export interface GameEvent {
  type:
    | "awaken"
    | "transform"
    | "multiplier"
    | "witching"
    | "bonus-start"
    | "retrigger"
    | "bonus-end"
    | "cap"
    | "poker-deal"
    | "poker-win"
    | "gold-strike";
  location?: number;
  cells?: number[];
  value?: number;
  message: string;
}
export interface SpinResult {
  schemaVersion: 1;
  configVersion: string;
  id: string;
  sequence: number;
  bet: number;
  debit: number;
  payout: number;
  phase: Phase;
  cardFaces?: Record<number, number>;
  rawGrid: Grid;
  grid: Grid;
  stops: number[][];
  scatters: number;
  wins: Win[];
  poker?: {
    cards: number[];
    outcome?: "win" | "loss" | "tie";
    cell?: number;
    cells?: number[];
    complete: boolean;
    rank: string;
    amount: number;
  };
  gold?: { lines: number[][]; cells: number[]; fullScreen: boolean; amount: number };
  multiplier: number;
  events: GameEvent[];
  state: GameState;
}
export interface RandomSource {
  nextInt(maxExclusive: number): number;
}
export interface SpinRequest {
  requestId: string;
  expectedSequence: number;
  bet: number;
}
export interface RgsAdapter {
  connect(): Promise<GameState>;
  spin(request: SpinRequest): Promise<SpinResult>;
  reconnect(): Promise<{ state: GameState; lastResult: SpinResult | null }>;
  history(): Promise<SpinResult[]>;
}
