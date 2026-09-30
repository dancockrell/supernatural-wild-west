import { CONFIG } from "../engine/config";
import { initialState } from "../engine/engine";
import { DEAD_MANS_HAND, POKER_PAYS } from "../engine/poker";
import {
  REGULAR,
  type GameState,
  type SpinRequest,
  type SpinResult,
} from "../engine/types";

export interface DemoSession {
  state: GameState;
  rounds: { request: SpinRequest; result: SpinResult }[];
}
const object = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const phase = (v: unknown) =>
  ["noon", "witching", "bonus"].includes(v as string);
const bet = (v: unknown) => CONFIG.bets.includes(v as number);
const indices = (v: unknown, max: number, length = max + 1): v is number[] =>
  Array.isArray(v) &&
  v.length <= length &&
  v.every((n) => integer(n, max)) &&
  new Set(v).size === v.length;
const cells = (v: unknown) => indices(v, CONFIG.rows * CONFIG.reels - 1);
const cards = (v: unknown, max = 5) =>
  indices(v, 51, max) && v.every((n) => !DEAD_MANS_HAND.includes(n));
const symbols = [...REGULAR, "gold", "wild", "scatter", "dust"];
const grid = (v: unknown) =>
  Array.isArray(v) &&
  v.length === CONFIG.reels &&
  v.every(
    (reel) =>
      Array.isArray(reel) &&
      reel.length === CONFIG.rows &&
      reel.every((s) => symbols.includes(s)),
  );

export function validSpinRequest(v: unknown): v is SpinRequest {
  return (
    object(v) &&
    typeof v.requestId === "string" &&
    v.requestId.length > 0 &&
    v.requestId.length <= 200 &&
    integer(v.expectedSequence) &&
    bet(v.bet)
  );
}

function validState(v: unknown): v is GameState {
  if (
    !object(v) ||
    v.schemaVersion !== 1 ||
    v.configVersion !== CONFIG.version ||
    !phase(v.phase) ||
    !indices(v.awakened, 4) ||
    !indices(v.sticky, CONFIG.rows - 1) ||
    !["sequence", "balance", "bonusWin", "roundWin"].every((k) =>
      integer(v[k]),
    ) ||
    !integer(v.witchSpins, CONFIG.witchDuration) ||
    !integer(v.freeSpins, CONFIG.maxFreeSpins) ||
    !integer(v.bonusAwarded, CONFIG.maxFreeSpins) ||
    v.freeSpins > v.bonusAwarded ||
    !(v.bonusBet === 0 || bet(v.bonusBet)) ||
    !(v.roundBet === 0 || bet(v.roundBet)) ||
    !object(v.poker) ||
    !cards(v.poker.cards, 4) ||
    !(v.poker.cards.length ? bet(v.poker.bet) : v.poker.bet === 0)
  )
    return false;
  if (v.phase === "bonus" && (!v.freeSpins || !bet(v.bonusBet))) return false;
  if (v.phase !== "bonus" && v.freeSpins !== 0) return false;
  if (v.phase === "witching" && (!v.witchSpins || !bet(v.roundBet)))
    return false;
  if (
    v.phase === "noon" &&
    (v.witchSpins || v.awakened.length || v.sticky.length)
  )
    return false;
  return v.roundWin <= v.roundBet * CONFIG.maxExposure;
}

const eventTypes = [
  "awaken",
  "transform",
  "multiplier",
  "witching",
  "bonus-start",
  "retrigger",
  "bonus-end",
  "cap",
  "poker-deal",
  "poker-win",
  "gold-strike",
];
function validResult(v: unknown): v is SpinResult {
  if (
    !object(v) ||
    v.schemaVersion !== 1 ||
    v.configVersion !== CONFIG.version ||
    typeof v.id !== "string" ||
    !integer(v.sequence) ||
    !bet(v.bet) ||
    !phase(v.phase) ||
    !integer(v.debit) ||
    v.debit !== (v.phase === "bonus" ? 0 : v.bet) ||
    !integer(v.payout, v.bet * CONFIG.maxExposure) ||
    !validState(v.state) ||
    v.state.sequence !== v.sequence ||
    !grid(v.grid) ||
    !grid(v.rawGrid) ||
    !integer(v.scatters, CONFIG.reels) ||
    v.rawGrid.flat().filter((s: string) => s === "scatter").length !==
      v.scatters ||
    ![1, 2].includes(v.multiplier) ||
    !Array.isArray(v.stops) ||
    v.stops.length !== CONFIG.reels ||
    !v.stops.every(
      (r: unknown, i: number) =>
        Array.isArray(r) &&
        r.length === CONFIG.rows &&
        r.every((n) => integer(n, CONFIG.strips[i].length - 1)),
    ) ||
    !Array.isArray(v.wins) ||
    v.wins.length > REGULAR.length ||
    !v.wins.every(
      (w) =>
        object(w) &&
        REGULAR.includes(w.symbol) &&
        integer(w.count, 5) &&
        w.count >= 3 &&
        integer(w.ways, CONFIG.rows ** 5) &&
        integer(w.amount) &&
        cells(w.cells),
    ) ||
    !Array.isArray(v.events) ||
    v.events.length > 50 ||
    !v.events.every(
      (e) =>
        object(e) &&
        eventTypes.includes(e.type) &&
        typeof e.message === "string" &&
        e.message.length < 300 &&
        (e.location === undefined || integer(e.location, 4)) &&
        (e.cells === undefined || cells(e.cells)) &&
        (e.value === undefined || integer(e.value)),
    )
  )
    return false;
  if (
    !object(v.cardFaces) ||
    !Object.entries(v.cardFaces).every(
      ([cell, card]) =>
        /^(0|[1-9]\d*)$/.test(cell) &&
        integer(Number(cell), CONFIG.rows * CONFIG.reels - 1) &&
        integer(card, 51),
    )
  )
    return false;
  if (
    v.poker !== undefined &&
    (!object(v.poker) ||
      !cards(v.poker.cards) ||
      typeof v.poker.complete !== "boolean" ||
      v.poker.complete !== (v.poker.cards.length === 5) ||
      !(v.poker.rank === "" || Object.hasOwn(POKER_PAYS, v.poker.rank)) ||
      !integer(v.poker.amount) ||
      (v.poker.outcome !== undefined &&
        !["win", "loss", "tie"].includes(v.poker.outcome)) ||
      (v.poker.cell !== undefined &&
        !integer(v.poker.cell, CONFIG.rows * CONFIG.reels - 1)) ||
      (v.poker.cells !== undefined && !cells(v.poker.cells)))
  )
    return false;
  if (
    !object(v.gold) ||
    !Array.isArray(v.gold.lines) ||
    !v.gold.lines.every(cells) ||
    !cells(v.gold.cells) ||
    typeof v.gold.fullScreen !== "boolean" ||
    !integer(v.gold.amount)
  )
    return false;
  return true;
}

/** Reject the whole snapshot: partial repair could replay a wager against another ledger. */
export function validDemoSession(v: unknown): v is DemoSession {
  if (
    !object(v) ||
    !validState(v.state) ||
    !Array.isArray(v.rounds) ||
    v.rounds.length > 50
  )
    return false;
  if (!v.rounds.length)
    return JSON.stringify(v.state) === JSON.stringify(initialState());
  const ids = new Set<string>();
  let previous: GameState | undefined;
  for (const round of v.rounds) {
    if (
      !object(round) ||
      !validSpinRequest(round.request) ||
      !validResult(round.result)
    )
      return false;
    const { request, result } = round;
    if (
      ids.has(request.requestId) ||
      result.id !== request.requestId ||
      result.sequence !== request.expectedSequence + 1 ||
      (result.phase !== "bonus" && request.bet !== result.bet)
    )
      return false;
    if (!previous && result.sequence === 1) previous = initialState();
    if (!previous && v.rounds.length !== 50) return false;
    if (
      previous &&
      (request.expectedSequence !== previous.sequence ||
        result.phase !== previous.phase ||
        result.state.balance !==
          previous.balance - result.debit + result.payout ||
        (previous.phase === "bonus" && result.bet !== previous.bonusBet) ||
        (previous.phase === "witching" && result.bet !== previous.roundBet) ||
        (previous.poker?.cards.length && result.bet !== previous.poker.bet))
    )
      return false;
    ids.add(request.requestId);
    previous = result.state;
  }
  return JSON.stringify(previous) === JSON.stringify(v.state);
}
