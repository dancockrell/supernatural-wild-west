import { MovieSymbols } from "./movie-loops";
import { BoundaryCast } from "./boundary-cast";
import { POKER_PAYS as LEGACY_POKER_PAYS } from "../engine/legacy/poker-v12";
import { CONFIG as POKER130_CONFIG } from "../engine/legacy/config-v130";
import { CONFIG as POKER121_CONFIG } from "../engine/legacy/config-v121";
import { CONFIG as LEGACY_CONFIG } from "../engine/legacy/config-v1";
import { CONFIG as POKER120_CONFIG } from "../engine/legacy/config-v120";
import { PokerTable } from "./poker-table";
import { PokerGuests } from "./poker-guests";
import { parlorResidentMedia } from "./resident-media";
import { POKER_PAYS } from "../engine/poker";
import { installQuickControls } from "./quick-controls";
import "./style.css";
import "./spectacle.css";
import "./impact.css";
import "./polish.css";
import "./cinematics.css";
import "./card-fx.css";
import "./player-ui.css";
import "./parlor.css";
import { CasinoAutoplay } from "./autoplay";
import { CardEffects } from "./card-fx";
import { FeatureCinematics, type FeatureScene } from "./cinematics";
import { SpectralEffects } from "./effects";
import "@fontsource/cinzel/latin-500.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import { FrontierScene } from "./scene";
import { ParlorScene } from "./parlor-scene";
import { DemoRgsAdapter, RgsError } from "./adapter";
import { SoundBus, type EventScoreKey } from "./audio";
import { SYMBOLS, symbolSvg } from "./symbols";
import { CONFIG } from "../engine/config";
import {
  LOCATIONS,
  REGULAR,
  type GameState,
  type SpinRequest,
  type SpinResult,
  type Grid,
  type SymbolId,
} from "../engine/types";
const app = document.querySelector<HTMLDivElement>("#app")!;
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n / 100);
const descriptions = [
  "Graveyard · Reel 1: each active spin has a 22% chance to return a Hellfire Wild to one random cell. Blood Moons are protected.",
  "Saloon · Reel 2: when a Wild lands, a 35% chance spreads it through every non-scatter cell on this reel.",
  "Jail · Reel 3: Hellfire Wilds stay locked for the remaining Witching Hour and any inherited free spins. Blood Moons temporarily cover locked cells.",
  "Mine · Reel 4: one random cell is inspected. A low symbol or poker cards become the Devil Rider.",
  "Church · Reel 5: a Preacher anywhere on this reel doubles all ways wins.",
];
app.innerHTML = `<canvas id="frontier" aria-label="An animated cursed frontier street"></canvas><div class="vignette"></div>
<div class="shell"><header class="topbar"><div class="top-actions"><button id="audio" class="icon-button" aria-label="Enable sound" aria-pressed="false">♫</button><button id="settings" class="icon-button" aria-label="Open settings">⚙</button><button id="help" class="outline-button">HELP</button></div></header>
<main><div class="title-area"><h1><span>SUPERNATURAL</span> WILD WEST</h1></div>
<section class="game" aria-label="Supernatural Wild West slot"><div class="game-meta"><span id="phase"><i></i> HIGH NOON</span><button id="paytable">PAYTABLE <span>↗</span></button></div>
<div class="cabinet"><div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div><div class="locations">${LOCATIONS.map((name, i) => `<button data-location="${i}" aria-label="${name} modifier"><span>${name}</span><i></i></button>`).join("")}</div>
<div id="reels" class="reels" role="group" aria-label="Five reels, five rows">${Array.from({ length: 5 }, (_, i) => `<div class="reel" data-reel="${i}"></div>`).join("")}</div><div class="cabinet-bottom"><span id="cabinet-note"></span></div></div>
<div class="event-line"><p id="status" role="status" aria-live="polite">Opening the gates to the frontier…</p><button id="recover" hidden>RECONNECT</button></div>
<div class="controls"><div class="balance metric"><span>BALANCE <small>CR</small></span><strong id="balance">—</strong></div><div class="bet-control"><span>BET <small>CR</small></span><div><button id="bet-down" aria-label="Decrease bet">−</button><strong id="bet">1.00</strong><button id="bet-up" aria-label="Increase bet">+</button></div></div><button id="spin" class="spin-button" disabled><span class="spin-icon">↻</span><span id="spin-label">CONNECTING</span></button><div class="win metric"><span>TOTAL WIN <small>CR</small></span><strong id="win">0.00</strong></div><button id="history" class="history-button" aria-label="Round history">≡<span>HISTORY</span></button></div>
<div class="under-controls"><span id="round-label">WAITING FOR SESSION</span><span id="connection"><i></i> CONNECTING</span></div></section>
</main>
<footer><span>DEMO PLAY <b>·</b> NO CASH VALUE</span></footer></div>
<dialog id="modal"><div class="dialog-top"><span id="dialog-kicker">HOW TO PLAY</span><button id="close-modal" aria-label="Close dialog">×</button></div><div id="modal-body"></div></dialog>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const adapter = new DemoRgsAdapter(),
  audio = new SoundBus();
const effects = new SpectralEffects();

const cardEffects = new CardEffects(el("reels"));
const movieSymbols = new MovieSymbols(el("reels"));
const pokerTable = new PokerTable(
  document.querySelector(".cabinet")!,
  (cue, detail) => audio.play(cue, detail),
  (token,index,animate) => { if(scene instanceof ParlorScene) scene.noticeCard(token,index,animate); },
);
const boundary = new BoundaryCast(document.querySelector(".shell")!, (cue) =>
  audio.play(cue),
);
try {
  const mix = JSON.parse(localStorage.getItem("dd-mix") || "null");
  if (mix && Number.isFinite(mix.music) && Number.isFinite(mix.effects))
    audio.setLevels(mix.music, mix.effects);
} catch {
  /* Keep default mix. */
}
document.addEventListener("click", (e) => {
  const button = (e.target as Element).closest("button");
  if (button && !["spin", "audio"].includes(button.id)) audio.play("ui");
});
let state: GameState | undefined,
  betIndex = 2,
  busy = false,
  connected = false,
  quick = false,
  lastResult: SpinResult | null = null;
let scene: FrontierScene | ParlorScene | undefined;
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
let reduced =
  localStorage.getItem("dd-motion") === null
    ? motionQuery.matches
    : localStorage.getItem("dd-motion") === "true";
audio.enabled = localStorage.getItem("dd-audio") === "true";
const modal = el<HTMLDialogElement>("modal");
const spinCluster = document.createElement("div");
spinCluster.className = "spin-cluster";
el("spin").before(spinCluster);
spinCluster.append(el("spin"));
spinCluster.insertAdjacentHTML(
  "beforeend",
  '<button id="autoplay" aria-label="Autoplay" aria-pressed="false">↻ AUTO</button>',
);
const autoplay = new CasinoAutoplay(
  () => ({
    balance: state?.balance || 0,
    bet: currentBet(),
    bonus: state?.phase === "bonus",
    ready: connected && !document.hidden && !modal.open,
  }),
  () => spin(true),
  async () => {
    await new Promise((r) => setTimeout(r, 75));
    while (autoplay.active && !el("spectacle").hidden)
      await new Promise((r) => setTimeout(r, 100));
  },
  () => {
    el("autoplay").textContent = autoplay.active
      ? `■ ${autoplay.remaining}`
      : "↻ AUTO";
    el("autoplay").setAttribute(
      "aria-label",
      autoplay.active
        ? `Stop autoplay, ${autoplay.remaining} paid spins remaining`
        : "Configure autoplay",
    );
    el("autoplay").setAttribute("aria-pressed", String(autoplay.active));
    refresh();
    if (!autoplay.active && autoplay.reason) setStatus(autoplay.reason, true);
  },
);
let autoLimits = {
  lossBets: 0,
  singleWin: 0,
  profitLimit: 0,
  stopOnBonus: true,
};
el("autoplay").onclick = () => {
  if (autoplay.active) {
    autoplay.stop();
    return;
  }
  if (busy || !connected || !state) return;
  showAutoplaySettings();
};
function showAutoplaySettings() {
  if (busy || autoplay.active || !connected || !state) return;
  const wager = currentBet();
  openModal(
    `<form id="auto-form"><label>Spins<select id="auto-count"><option>10</option><option>25</option><option>50</option><option selected>100</option></select></label><label>Loss limit · CR<input id="auto-loss" type="number" min="0" step="0.01" placeholder="Unlimited" value="${autoLimits.lossBets ? (wager * autoLimits.lossBets) / 100 : ""}"></label><details><summary>Stop conditions</summary><label>Single win · CR<input id="auto-win" value="${autoLimits.singleWin ? autoLimits.singleWin / 100 : ""}" type="number" min="0" step="0.01" placeholder="Off"></label><label>Balance increase · CR<input id="auto-profit" value="${autoLimits.profitLimit ? autoLimits.profitLimit / 100 : ""}" type="number" min="0" step="0.01" placeholder="Off"></label><label class="auto-check"><input id="auto-bonus" type="checkbox" ${autoLimits.stopOnBonus ? "checked" : ""}>Stop on free spins</label></details><p id="auto-error" role="alert"></p><button class="action-button" type="submit">START AUTOPLAY</button></form>`,
    "AUTOPLAY",
  );
  el("auto-form").onsubmit = (e) => {
    e.preventDefault();
    const value = (id: string) =>
      Math.round(Number(el<HTMLInputElement>(id).value) * 100);
    const options = {
      spins: Number(el<HTMLSelectElement>("auto-count").value),
      lossLimit: value("auto-loss"),
      singleWin: value("auto-win"),
      profitLimit: value("auto-profit"),
      stopOnBonus: el<HTMLInputElement>("auto-bonus").checked,
    };
    if (options.lossLimit !== 0 && options.lossLimit < wager) {
      el("auto-error").textContent = "Loss limit must cover at least one bet.";
      return;
    }
    autoLimits = {
      lossBets: options.lossLimit / wager,
      singleWin: options.singleWin,
      profitLimit: options.profitLimit,
      stopOnBonus: options.stopOnBonus,
    };
    modal.close();
    void autoplay.start(options).catch((e) => setStatus(e.message, true));
  };
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && autoplay.active)
    autoplay.stop("Autoplay stopped when the game was hidden");
});

let focusBefore: HTMLElement | null = null;
app.insertAdjacentHTML(
  "beforeend",
  '<div id="spectacle" class="spectacle" aria-live="polite" hidden><div class="spectacle-card"><h2 id="spectacle-title"></h2><p id="spectacle-copy"></p></div></div>',
);
let spectacleTimer: ReturnType<typeof setTimeout> | undefined;
let pendingAward: (() => void) | undefined;
let awardFrame = 0;
let spectacleSequence = 0;
let presentationGeneration = 0;
let spectacleAudioEvents:AbortController|undefined;
let stopSpectacleScore:()=>void=()=>{};
const spectacleWaiters = new Set<()=>void>();
function waitForSpectacles():Promise<void> {
  return el('spectacle').hidden && !pendingAward ? Promise.resolve() : new Promise(resolve=>spectacleWaiters.add(resolve));
}
function finishSpectacle(continueAwards:boolean) {
  spectacleAudioEvents?.abort();spectacleAudioEvents=undefined;
  stopSpectacleScore();stopSpectacleScore=()=>{};
  audio.stopFeature(); spectacleSequence++;
  cancelAnimationFrame(awardFrame); clearTimeout(spectacleTimer);
  el('spectacle').querySelectorAll('video').forEach(video=>video.pause());
  el('spectacle').hidden=true;
  const next=continueAwards ? pendingAward : undefined; pendingAward=undefined;
  next?.();
  if(el('spectacle').hidden && !pendingAward){for(const resolve of spectacleWaiters)resolve();spectacleWaiters.clear();}
  refresh();
}
const cinematics = new FeatureCinematics(el("spectacle"), (cue) =>
  audio.play(cue),
);
function showSpectacle(
  title: string,
  copy: string,
  kind: FeatureScene = "awaken",
  location = 0,
  award = 0,
) {
  spectacleAudioEvents?.abort();stopSpectacleScore();stopSpectacleScore=()=>{};
  spectacleAudioEvents=new AbortController();
  const sequence = ++spectacleSequence;
  clearTimeout(spectacleTimer);
  cancelAnimationFrame(awardFrame);
  el("spectacle-title").textContent = title;
  el("spectacle-copy").textContent = copy;

  el("spectacle").hidden = false;
  refresh();
  audio.beginFeature();
  cinematics.play(kind, location);
  scene?.pulse();
  if (kind === "fortune" && award > 0 && !reduced) {
    const start = performance.now();
    const count = (now: number) => {
      const progress = Math.min(1, (now - start) / 1800);
      el("spectacle-copy").textContent =
        `${money(Math.floor(award * (1 - Math.pow(1 - progress, 3))))} CR`;
      if (progress < 1 && !el("spectacle").hidden)
        awardFrame = requestAnimationFrame(count);
    };
    awardFrame = requestAnimationFrame(count);
  }
  const close = () => {
    if (sequence !== spectacleSequence || el("spectacle").hidden) return;
    finishSpectacle(true);
  };
  const nativePerformance = el("spectacle").querySelector<HTMLVideoElement>(".feature-ghost");
  const places=['graveyard','saloon','jail','mine','church'] as const;
  const scoreKey:EventScoreKey|undefined=kind==='awaken'
    ? `feature-${places[Math.max(0,Math.min(4,location))]}`
    : kind==='witch' ? 'feature-witch' : kind==='fortune' ? 'feature-fortune' : kind==='ride' ? 'feature-ride' : undefined;
  if(!reduced&&scoreKey){
    if(nativePerformance){
      const signal=spectacleAudioEvents.signal;
      const stop=()=>{if(sequence===spectacleSequence){stopSpectacleScore();stopSpectacleScore=()=>{};}};
      nativePerformance.addEventListener('playing',()=>{
        if(sequence!==spectacleSequence||el('spectacle').hidden)return;
        stop();stopSpectacleScore=audio.playEventScore(scoreKey,nativePerformance.duration,nativePerformance.currentTime);
      },{signal});
      nativePerformance.addEventListener('waiting',stop,{signal});
      nativePerformance.addEventListener('pause',stop,{signal});
    }else stopSpectacleScore=audio.playEventScore(scoreKey,kind==='ride'?8:7);
  }
  if (!reduced && nativePerformance) {
    nativePerformance.addEventListener("ended", () => {
      if (sequence !== spectacleSequence) return;
      clearTimeout(spectacleTimer);
      spectacleTimer = setTimeout(close, 250);
    }, {once:true});
    nativePerformance.addEventListener("error", close, {once:true});
    // Fifteen seconds without decoded progress is a failure; a film that is
    // still advancing must not lose its ending after a slow initial load.
    let lastNativeProgress = -1;
    nativePerformance.addEventListener('timeupdate', () => {
      if (sequence !== spectacleSequence || nativePerformance.ended || el('spectacle').hidden) return;
      if (nativePerformance.currentTime <= lastNativeProgress) return;
      lastNativeProgress = nativePerformance.currentTime;
      clearTimeout(spectacleTimer);
      spectacleTimer = setTimeout(close, 15000);
    }, {signal:spectacleAudioEvents.signal});
    spectacleTimer = setTimeout(close, 15000);
  } else {
    spectacleTimer = setTimeout(close, reduced ? 900 : kind === "ride" ? 8000 : (kind === "noon" || kind === "brand") ? 7200 : 5700);
  }
  if (kind === "ride" && !reduced && !nativePerformance)
    void effects.haunt().then(() => {
      if (sequence !== spectacleSequence || el("spectacle").hidden) return;
      clearTimeout(spectacleTimer);
      audio.play("ride");
      spectacleTimer = setTimeout(close, 3400);
    });
}
function dismissSpectacle() { finishSpectacle(false); }

document.addEventListener("visibilitychange", () => {
    if(document.hidden) { presentationGeneration++; dismissSpectacle(); audio.suspend(); }
    else audio.resume();
});
function openModal(html: string, kicker = "HOW TO PLAY") {
  modal.querySelectorAll('video').forEach(v => v.pause());
  if (autoplay.active) autoplay.stop();
  focusBefore = document.activeElement as HTMLElement;
  el("dialog-kicker").textContent = kicker;
  el("modal-body").innerHTML = html;
  if (!modal.open) modal.showModal();
}
el("close-modal").onclick = () => modal.close();
modal.addEventListener("close", () => {
  previewRequest++;
  modal.querySelectorAll('video').forEach(v => v.pause());
  focusBefore?.focus();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      modal.close();
  }
});
function setStatus(text: string, attention = false) {
  el("status").textContent = text;
  document
    .querySelector(".event-line")!
    .classList.toggle("needs-attention", attention || !connected);
}
function currentBet() {
  return state?.phase === "bonus"
    ? state.bonusBet
    : state?.phase === "witching"
      ? state.roundBet
      : state?.poker?.bet || CONFIG.bets[betIndex];
}
function drawGrid(
  grid: Grid,
  wins: number[] = [],
  faces: Record<number, number> = {},
  celebrate = true,
) {
  el("reels").style.setProperty("--rows", String(grid[0].length));
  el("reels").setAttribute("aria-label", `Five reels, ${grid[0].length} rows`);
  grid.forEach((symbols, r) => {
    document.querySelector(`[data-reel="${r}"]`)!.innerHTML = symbols
      .map(
        (s, row) =>
          `<div class="symbol ${s} ${wins.includes(r * grid[r].length + row) ? (celebrate ? "winning" : "matched") : ""}" aria-label="Reel ${r + 1}, row ${row + 1}: ${SYMBOLS[s].name}">${symbolSvg(s, faces[r * grid[r].length + row])}</div>`,
      )
      .join("");
  });
}
const attract: Grid = [
  ["gunslinger", "ace", "bottle", "medium"],
  ["king", "queen", "horseshoe", "ace"],
  ["scatter", "preacher", "gunslinger", "king"],
  ["medium", "bottle", "rider", "horseshoe"],
  ["rider", "horseshoe", "ace", "wild"],
];
attract.forEach((reel, i) =>
  reel.push(i === 1 || i === 3 ? "gold" : "horseshoe"),
);
drawGrid(attract);
function refresh() {
  if (!state) return;
  el("balance").textContent = money(state.balance);
  el("bet").textContent = money(currentBet());
  if (!lastResult) pokerTable.restore(state.poker?.cards || [], "", 0, true);
  el<HTMLButtonElement>("bet-down").disabled =
    busy ||
    autoplay.active ||
    !!state.poker?.cards.length ||
    state.phase !== "noon" ||
    betIndex === 0;
  el<HTMLButtonElement>("bet-up").disabled =
    busy ||
    autoplay.active ||
    state.phase !== "noon" ||
    !!state.poker?.cards.length ||
    betIndex === CONFIG.bets.length - 1;
  el<HTMLButtonElement>("spin").disabled = !connected || (busy && !finishAnimation) || pokerGuests.active || !el('spectacle').hidden;
  el<HTMLButtonElement>("autoplay").disabled =
    !autoplay.active && (busy || !connected);
  el("spin-label").textContent = busy
    ? finishAnimation ? "QUICK STOP" : "RESOLVING"
    : state.phase === "bonus"
      ? `FREE SPIN · ${state.freeSpins}`
      : "SPIN";
  el("phase").innerHTML =
    `<svg class="phase-emblem" viewBox="0 0 32 32" aria-hidden="true">${state.phase === "noon" ? '<circle cx="16" cy="16" r="6"/><path d="M16 2v5m0 18v5M2 16h5m18 0h5M6 6l4 4m12 12 4 4M6 26l4-4M22 10l4-4"/>' : '<path d="M21 4a12 12 0 1 0 7 19A13 13 0 0 1 21 4Z"/>'}</svg><span class="phase-title">${state.phase === "bonus" ? "Ride of the Damned" : state.phase === "witching" ? "Witching Hour" : "High Noon"}${state.phase === "witching" ? ` <small>${state.witchSpins} spins remaining</small>` : ""}</span>`;
  document.body.classList.toggle("night", state.phase !== "noon");
  scene?.setPhase(state.phase !== "noon");
  audio.setNight(state.phase !== "noon");
  effects.setPhase(state.phase !== "noon");
  document
    .querySelectorAll<HTMLButtonElement>("[data-location]")
    .forEach((b, i) => {
      b.classList.toggle("awake", state!.awakened.includes(i));
      document
        .querySelector(`[data-reel="${i}"]`)
        ?.classList.toggle("location-awake", state!.awakened.includes(i));
      b.setAttribute(
        "aria-label",
        `${LOCATIONS[i]} modifier, ${state!.awakened.includes(i) ? "awakened" : "dormant"}`,
      );
    });
  el("cabinet-note").textContent =
    state.phase === "bonus"
      ? `${state.freeSpins} FREE SPINS REMAINING · FEATURE WIN ${money(state.bonusWin)} CR`
      : state.phase === "witching"
        ? `${state.awakened.length} LOCATIONS AWAKENED · ${state.witchSpins} SPINS UNTIL DAWN`
        : "";
  el("cabinet-note").parentElement!.hidden = state.phase !== "bonus";
  el("round-label").textContent =
    `ROUND ${String(state.sequence).padStart(5, "0")} · ${state.configVersion.toUpperCase()}`;
}
function connection(ok: boolean) {
  connected = ok;
  if (!ok && autoplay.active) autoplay.stop("Connection interrupted");
  el("connection").innerHTML = `<i></i> ${ok ? "CONNECTED" : "OFFLINE"}`;
  el("recover").hidden = ok;
  document
    .querySelector(".event-line")!
    .classList.toggle("needs-attention", !ok);
  el<HTMLButtonElement>("spin").disabled = !ok;
}
async function applyResult(result: SpinResult, live = false) {
  const presentation = presentationGeneration;
  lastResult = result;
  state = result.state;
  drawGrid(
    result.grid,
    result.wins.flatMap((w) => w.cells),
    result.cardFaces,
    result.payout > result.bet,
  );
  el("win").textContent = money(result.payout);
  refresh();
  const messages = result.events.map((e) => e.message);
  setStatus(
    messages.length
      ? messages.join(" · ")
      : result.payout > 0
        ? `${money(result.payout)} CR · ${result.wins.reduce((s, w) => s + w.ways, 0)} winning ways`
        : "Place your next bet.",
  );
  if (
    live &&
    result.payout > result.bet &&
    result.payout > (result.poker?.amount || 0) &&
    !result.events.some(
      (e) => e.type === "bonus-start" || e.type === "witching",
    )
  )
    audio.play(
      result.events.some(
        (e) => e.type === "bonus-start" || e.type === "witching",
      )
        ? "awaken"
        : result.payout > 0
          ? "win"
          : "stop",
    );
  if (live) {
    effects.finish(result);
  }
  if (
    live &&
    !reduced &&
    result.wins.length &&
    result.configVersion !== "dd-1.4.0"
  )
    await new Promise((resolve) => setTimeout(resolve, 250));
  if(live && !reduced && result.poker && scene instanceof ParlorScene)
    scene.noticeHand(result.poker.complete, result.poker.amount > 0);
  await pokerTable.show(result, live && !reduced);
  if (live) {
    // A hand's complete native performance owns its turn before feature events begin.
    await pokerGuests.whenIdle();
    if(document.hidden || presentation!==presentationGeneration)return;
    presentEvents(result);
    await waitForSpectacles();
    boundary.react(result, reduced);
    if(!reduced && scene instanceof ParlorScene) scene.noticePayout(result.payout);
  }
}
let finishAnimation: (() => void) | undefined;
function animate(result: SpinResult) {
  el("reels").style.setProperty("--rows", String(result.grid[0].length));
  return new Promise<void>((resolve, reject) => {
    const reels = [...document.querySelectorAll<HTMLElement>(".reel")];
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      reels.forEach((r) => r.classList.remove("rolling"));
      finishAnimation = undefined;
      void applyResult(result, true).then(resolve, reject);
    };
    finishAnimation = finish;
    refresh();
    if (reduced || quick) {
      finish();
      return;
    }
    reels.forEach((reel, i) =>
      timers.push(
        setTimeout(
          () => {
            reel.classList.remove("rolling");
            reel.innerHTML = result.grid[i]
              .map(
                (s, row) =>
                  `<div class="symbol ${s}" aria-label="Reel ${i + 1}, row ${row + 1}: ${SYMBOLS[s].name}">${symbolSvg(s, result.cardFaces?.[i * result.grid[i].length + row])}</div>`,
              )
              .join("");
            audio.play("stop", i);
            if (result.grid[i].includes("scatter"))
              audio.play(
                "scatter",
                result.grid
                  .slice(0, i + 1)
                  .flat()
                  .filter((s) => s === "scatter").length - 1,
              );
            else if (result.grid[i].includes("wild")) audio.play("wild");
            effects.landReel(
              i,
              result.grid
                .slice(0, i + 1)
                .flat()
                .filter((s) => s === "scatter").length >= 2 && i < 4,
            );
            if (i === 4) finish();
          },
          650 + i * 130,
        ),
      ),
    );
  });
}
async function spin(automatic = false): Promise<SpinResult | undefined> {
  previewRequest++;
  if (!automatic && autoplay.active) {
    autoplay.stop();
    return;
  }
  if (busy) {
    // Quick stop applies only to reel motion, never to a hand or feature performance.
    if(finishAnimation){quick = true; finishAnimation();}
    return;
  }
  if (pokerGuests.active || !el('spectacle').hidden) return;
  if (!state || !connected) return;
  if (state.phase !== "bonus" && state.balance < currentBet()) {
    setStatus(
      state.phase === "witching"
        ? "Not enough credits to complete this Witching Hour at its locked wager."
        : "Not enough demo credits for this wager. Choose a lower bet.",
      true,
    );
    return;
  }
  busy = true;
  const started = performance.now();
  boundary.spin();
  effects.startSpin();
  quick = false;
  refresh();
  audio.play("spin");
  setStatus("Riding into the dust…");
  if (!reduced)
    document
      .querySelectorAll(".reel")
      .forEach((r) => r.classList.add("rolling"));
  const request: SpinRequest = {
    requestId: crypto.randomUUID(),
    expectedSequence: state.sequence,
    bet:
      state.phase === "bonus"
        ? state.bonusBet
        : state.phase === "witching"
          ? state.roundBet
          : CONFIG.bets[betIndex],
  };
  localStorage.setItem("dd-pending", JSON.stringify(request));
  try {
    const result = await adapter.spin(request);
    localStorage.removeItem("dd-pending");
    await animate(result);
    await new Promise((r) =>
      setTimeout(r, Math.max(0, 2500 - (performance.now() - started))),
    );
    return result;
  } catch (e) {
    if (e instanceof RgsError && (e.status === 400 || e.status === 409))
      localStorage.removeItem("dd-pending");
    document
      .querySelectorAll(".reel")
      .forEach((r) => r.classList.remove("rolling"));
    connection(false);
    setStatus(
      `${(e as Error).message}. Reconnect to recover this round safely.`,
    );
  } finally {
    busy = false;
    refresh();
  }
}
async function connect() {
  boundary.reset();
  el("recover").hidden = true;
  setStatus("Connecting to the frontier…");
  try {
    const recovered = await adapter.reconnect();
    state = recovered.state;
    lastResult = recovered.lastResult;
    if (
      ![
        CONFIG.version,
        "dd-1.1.0",
        "dd-1.2.0",
        "dd-1.2.1",
        "dd-1.3.0",
      ].includes(state.configVersion)
    )
      throw new Error(
        "This session belongs to another math version. Use the matching archived release or a new browser profile",
      );
    if (lastResult) betIndex = Math.max(0, CONFIG.bets.indexOf(lastResult.bet));
    const pending = localStorage.getItem("dd-pending");
    if (pending) {
      const request = JSON.parse(pending) as SpinRequest;
      if (
        state.sequence === request.expectedSequence ||
        lastResult?.id === request.requestId
      ) {
        const result = await adapter.spin(request);
        applyResult(result);
      } else {
        if (lastResult) applyResult(lastResult);
        setStatus(
          "Session recovered from the server. A newer round superseded the pending request.",
        );
      }
      localStorage.removeItem("dd-pending");
    } else if (lastResult) {
      applyResult(lastResult);
      setStatus("Welcome back. Your last settled round has been restored.");
    } else
      setStatus(
        "Welcome to the frontier. Two moons wake the dead. Three call the riders.",
      );
    connection(true);
    refresh();
  } catch (e) {
    connection(false);
    setStatus(`Connection unavailable: ${(e as Error).message}`);
  }
}
el("spin").onclick = () => void spin();
el("recover").onclick = () => void connect();
el("bet-down").onclick = () => {
  betIndex = Math.max(0, betIndex - 1);
  refresh();
};
el("bet-up").onclick = () => {
  betIndex = Math.min(CONFIG.bets.length - 1, betIndex + 1);
  refresh();
};
document.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !e.repeat &&
    !modal.open &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A", "SUMMARY"].includes(
      (e.target as HTMLElement).tagName,
    )
  ) {
    e.preventDefault();
    void spin();
  }
});
function audioButton() {
  el("audio").setAttribute("aria-pressed", String(audio.enabled));
  el("audio").setAttribute(
    "aria-label",
    audio.enabled ? "Mute sound" : "Enable sound",
  );
  el("audio").classList.toggle("on", audio.enabled);
}
el("audio").onclick = () => {
  audio.enabled = !audio.enabled;
  localStorage.setItem("dd-audio", String(audio.enabled));
  audioButton();
  audio.play("stop");
};
audioButton();
let stopHandScore:()=>void=()=>{};
const handScores:Record<string,EventScoreKey>={
  'high-card':'hand-high-card',pair:'hand-pair','two-pair':'hand-two-pair','three-kind':'hand-trips',straight:'hand-straight',
  flush:'hand-flush','full-house':'hand-full-house','four-kind':'hand-quads',
  'straight-flush':'hand-straight-flush','royal-flush':'hand-royal-flush',
};
const pokerGuests = new PokerGuests(
  document.querySelector<HTMLElement>(".player-play-space")!,
  (cue,detail) => audio.play(cue,detail),
  event=>{
    stopHandScore();stopHandScore=()=>{};
    if(event.phase==='start')stopHandScore=audio.playEventScore(handScores[event.id],event.duration,event.currentTime);
  },
  ()=>queueMicrotask(refresh),
);
function applyMotion() {
  if(reduced)presentationGeneration++;
  if(reduced && !el("spectacle").hidden) dismissSpectacle();
  pokerGuests.setReduced(reduced);
  cardEffects.setReduced(reduced);
  movieSymbols.setReduced(reduced);
  pokerTable.setReduced(reduced);
  boundary.setReduced(reduced);
  cinematics.setReduced(reduced);
  effects.setReduced(reduced);
  document.body.classList.toggle("reduced-motion", reduced);
  scene?.setReducedMotion(reduced);
}
applyMotion();
motionQuery.addEventListener("change", (e) => {
  if (localStorage.getItem("dd-motion") === null) {
    reduced = e.matches;
    applyMotion();
  }
});
el("settings").onclick = () => {
  openModal(
    `<label class="setting"><span>Reduced motion<small>Skip reel motion and drifting dust.</small></span><input id="motion-setting" type="checkbox" ${reduced ? "checked" : ""}></label><label class="setting"><span>Sound</span><input id="sound-setting" type="checkbox" ${audio.enabled ? "checked" : ""}></label><p class="fine">Keyboard: Space spins or stops the presentation. Tab moves through controls. Enter activates a focused button. Escape closes this panel.</p>`,
    "SETTINGS",
  );
  el("modal-body").insertAdjacentHTML(
    "beforeend",
    '<details class="developer-tools"><summary>Developer tools</summary><button id="animation-preview">Animation preview</button><button id="math-lab">Math Lab</button></details>',
  );
  el("modal-body").insertAdjacentHTML(
    "afterbegin",
    '<button id="feature-showcase" class="action-button">Feature showcase</button><button id="autoplay-settings" class="outline-button">Autoplay settings</button>',
  );
  el("autoplay-settings").onclick = showAutoplaySettings;
  el("feature-showcase").onclick = showAnimationPreview;
  el("animation-preview").onclick = showAnimationPreview;
  el("math-lab").onclick = showMathLab;
  el("modal-body").insertAdjacentHTML(
    "beforeend",
    `<label class="setting"><span>Music</span><input class="sound-slider" id="music-volume" aria-label="Music volume" type="range" min="0" max="100" value="${Math.round(audio.levels.music * 100)}"></label><label class="setting"><span>Machine & effects</span><input class="sound-slider" id="effects-volume" aria-label="Machine and effects volume" type="range" min="0" max="100" value="${Math.round(audio.levels.effects * 100)}"></label>`,
  );
  for (const id of ["music-volume", "effects-volume"])
    el(id).oninput = () => {
      audio.setLevels(
        Number(el<HTMLInputElement>("music-volume").value) / 100,
        Number(el<HTMLInputElement>("effects-volume").value) / 100,
      );
      localStorage.setItem("dd-mix", JSON.stringify(audio.levels));
    };
  el<HTMLInputElement>("motion-setting").onchange = (e) => {
    reduced = (e.target as HTMLInputElement).checked;
    localStorage.setItem("dd-motion", String(reduced));
    applyMotion();
  };
  el<HTMLInputElement>("sound-setting").onchange = (e) => {
    audio.enabled = (e.target as HTMLInputElement).checked;
    localStorage.setItem("dd-audio", String(audio.enabled));
    audioButton();
    audio.play("stop");
  };
};
installQuickControls(audio, descriptions, LOCATIONS);
el("help").onclick = () =>
  openModal(
    `<h2>How to play</h2><p>Choose your wager and spin. Match the same symbol across at least three consecutive reels from the left. Every matching position creates another winning way. Only the longest run for each symbol pays.</p><div class="help-grid"><article><h3>01 / High Noon</h3><p>A sun-scorched frontier. Two Blood Moon scatters start six Witching Hour spins and awaken one location.</p></article><article><h3>02 / Witching Hour</h3><p>Awakened locations modify their own reels. Two moons refresh the six-spin timer. Each active spin can awaken another location.</p></article><article><h3>03 / Ride of the Damned</h3><p>Three or more moons award eight free spins, inherit awakened locations and add another. Two moons during the ride add two spins and awaken another place, up to 32 total awarded spins.</p></article><article><h3>04 / Hellfire Brand</h3><p>Wilds substitute for regular symbols. Blood Moons trigger features and do not pay ways. An all-wild run without any matching natural symbol does not pay that symbol.</p></article></div><h3>Your poker hand</h3><p>When playing cards land, one visible card joins your hand. Collect five across spins to complete it; free spins can add cards too. A completed hand pays when it ranks above A♠ K♠ Q♠ J♠ 2♥, then a new hand begins. A tie or lower hand adds no poker award. Matching symbols and Gold Mines can pay on any spin, independently of your poker hand.</p><p>The wager stays locked while your poker hand is building, throughout Witching Hour and during free spins. Each paid spin and all free spins it triggers share a 10,000× award ceiling. Quick stop only shortens the animation of an already resolved outcome.</p><p class="fine">All amounts use demo credits. Base hit rate measures paid spins with a positive immediate payout. Math Lab reports actual simulation results, including free-spin returns.</p>`,
  );
el("help").addEventListener('click', () => {
  el('modal-body').insertAdjacentHTML('afterbegin', '<button id="rare-animation-gallery" class="action-button">Review rare animations</button>');
  el('rare-animation-gallery').onclick = showAnimationPreview;
});
el("paytable").onclick = () => {
  const payConfig =
    state?.configVersion === "dd-1.1.0"
      ? LEGACY_CONFIG
      : state?.configVersion === "dd-1.2.0"
        ? POKER120_CONFIG
        : state?.configVersion === "dd-1.2.1"
          ? POKER121_CONFIG
          : state?.configVersion === "dd-1.3.0"
            ? POKER130_CONFIG
            : CONFIG;
  const handPays = payConfig.version.startsWith("dd-1.2.")
    ? LEGACY_POKER_PAYS
    : POKER_PAYS;
  const pokerRules = payConfig.version.startsWith("dd-1.2.")
    ? "Collect one card when playing cards land on a paid spin. Five collected cards complete your hand and pay the multiplier below. Free spins do not add cards. Matching-symbol awards pay independently."
    : payConfig.version === "dd-1.3.0"
      ? "The best five visible cards are scored each spin, including free spins. A hand above A♠ K♠ Q♠ J♠ 2♥ pays the multiplier below and enables matching-symbol awards. A tie or lower hand pays neither award."
      : "One visible card joins your hand on each spin that lands playing cards, including free spins. Your fifth collected card completes the hand; it pays when ranked above A♠ K♠ Q♠ J♠ 2♥, then the hand clears. A tie or lower hand adds no poker award. Matching-symbol and Gold Mine awards remain independent. Your wager stays fixed until the hand completes. The five comparison cards and your held cards are excluded from new card faces.";
  const handPayScale =
    payConfig.version === CONFIG.version ? CONFIG.pokerPayScale : 1;
  const pokerMarkup =
    payConfig.version === "dd-1.1.0"
      ? ""
      : `<h2>Poker hands</h2><p>${pokerRules} Multipliers apply to your wager; poker awards are rounded down to 0.01 CR and share the round award ceiling.</p><table><thead><tr><th>HAND</th><th>PAYS</th></tr></thead><tbody>${Object.entries(
          handPays,
        )
          .filter(([, pay]) => pay > 0)
          .map(
            ([hand, pay]) =>
              `<tr><td>${hand}</td><td>${(pay * handPayScale).toLocaleString()}×</td></tr>`,
          )
          .join("")}</tbody></table>`;
  openModal(
    `${pokerMarkup}<h2>Gold Mine</h2><p>Five mines in a full row, column or either main diagonal: 5× per completed line. All 25 mines: 10,000× instead. Wilds do not substitute for mines. All awards share the round ceiling.</p><h2>Matching symbols</h2><p>Multipliers below are per winning way, relative to the total bet. Awards are rounded down to 0.01 CR per symbol before Church multipliers. Wild substitution may contribute to several symbol awards.</p><table><thead><tr><th>SYMBOL</th><th>3 REELS</th><th>4 REELS</th><th>5 REELS</th></tr></thead><tbody>${REGULAR.filter(
      (s) =>
        payConfig.version !== CONFIG.version || !["ace", "king"].includes(s),
    )
      .map(
        (s) =>
          `<tr><td><span class="pay-symbol">${symbolSvg(s)}${SYMBOLS[s].name}</span></td>${payConfig.paytable[s].map((n) => `<td>${((n * payConfig.payoutScale) / 10000).toFixed(3)}×</td>`).join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table><p class="fine">${payConfig.version === CONFIG.version ? "3,125" : "1,024"} is the maximum number of ways across all five reels. Wins start on reel 1. Feature awards and Wild transformations are explained under How to play and the five location buttons.</p>`,
    "PAYTABLE · " + payConfig.version,
  );
};
el("history").onclick = async () => {
  openModal(
    "<h2>Your trail through the dust.</h2><p>Loading authoritative round history…</p>",
    "ROUND HISTORY",
  );
  try {
    const rounds = await adapter.history();
    el("modal-body").innerHTML =
      `<h2>Your trail through the dust.</h2><p>Last 50 settled spins. All amounts in credits.</p><table><thead><tr><th>ROUND</th><th>STATE</th><th>WAGER</th><th>WIN</th></tr></thead><tbody>${
        [...rounds]
          .reverse()
          .map(
            (r) =>
              `<tr><td>${r.sequence}</td><td>${r.phase === "bonus" ? "FREE SPIN" : r.phase.toUpperCase()}</td><td>${money(r.debit)}</td><td>${money(r.payout)}</td></tr>`,
          )
          .join("") || '<tr><td colspan="4">Your first ride awaits.</td></tr>'
      }</tbody></table><button class="action-button" id="export-history">EXPORT RESULTS</button>`;
    el("export-history").onclick = () =>
      download("devils-dust-history.json", rounds);
  } catch {
    el("modal-body").innerHTML =
      "<h2>The trail is temporarily hidden.</h2><p>Close this panel and reconnect to recover your session.</p>";
  }
};
function download(name: string, data: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
let worker: Worker | undefined;
let previewRequest = 0;
async function startShowcase(feature = "ride") {
  if (busy || !state) return;
  const request = ++previewRequest;
  try {
    const response = await fetch("/api/feature-gallery");
    if (!response.ok) throw new Error("Preview unavailable");
    const result = (await response.json()).examples[feature] as SpinResult;
    if (request !== previewRequest || busy || !modal.open) return;
    if (!result) throw new Error("Preview unavailable");
    modal.close();
    dismissSpectacle(); pokerGuests.stop();
    effects.finish(result);
    if (feature === "brand") {
      showSpectacle("HELLFIRE BRAND", "THE WILD TAKES HOLD", "brand");
      audio.play("transform");
    } else presentEvents(result);
    boundary.react(result, reduced);
  } catch (e) {
    setStatus((e as Error).message, true);
  }
}
function presentEvents(result: SpinResult) {
  if(scene instanceof ParlorScene && result.payout >= result.bet * 5 && result.payout > 0 && !result.poker)
    scene.noticeRound();
  pendingAward = undefined;
  if (result.events.some((e) => e.type === "retrigger"))
    audio.play("retrigger");
  else if (result.events.some((e) => e.type === "transform"))
    audio.play("transform");
  const bonus = result.events.find((e) => e.type === "bonus-start"),
    witch = result.events.find((e) => e.type === "witching"),
    awaken = result.events.find((e) => e.type === "awaken");
  if (result.payout >= result.bet * 20 && (bonus || witch || awaken))
    pendingAward = () => {
      showSpectacle(
        result.payout >= result.bet * 100 ? "MEGA WIN" : "BIG WIN",
        `${money(result.payout)} CR`,
        "fortune",
        0,
        result.payout,
      );
      audio.play("fortune");
    };
  if (bonus) {
    if (reduced) audio.play("ride");
    showSpectacle("RIDE OF THE DAMNED", "8 FREE SPINS", "ride");
  } else if (witch) {
    showSpectacle("WITCHING HOUR", "6 SPINS", "witch");
  } else if (awaken && awaken.location !== undefined) {
    showSpectacle(
      LOCATIONS[awaken.location].toUpperCase(),
      "AWAKENED",
      "awaken",
      awaken.location,
    );
  } else if (result.payout >= result.bet * 20) {
    scene?.pulse();
    showSpectacle(
      result.payout >= result.bet * 100 ? "MEGA WIN" : "BIG WIN",
      `${money(result.payout)} CR`,
      "fortune",
      0,
      result.payout,
    );
    audio.play("fortune");
  } else if (result.phase !== "noon" && result.state.phase === "noon") {
    showSpectacle("HIGH NOON", "", "noon");
    audio.play("dawn");
  }
  for (const event of result.events) {
    if (event.type === "transform" && event.location !== undefined) {
      const reel = document.querySelector<HTMLElement>(
        `[data-reel="${event.location}"]`,
      )!;
      reel.classList.add("haunted");
      setTimeout(() => reel.classList.remove("haunted"), 1800);
    }
  }
}
function showAnimationPreview() {
  previewRequest++;
  if(!busy){dismissSpectacle();pokerGuests.stop();}
  let back = document.getElementById('return-animation-gallery');
  if (!back) {
    back = document.createElement('button');
    back.id = 'return-animation-gallery';
    back.className = 'action-button';
    back.textContent = 'Back to animations';
    document.body.append(back);
    back.onclick = showAnimationPreview;
  }
  back.hidden = true;
  const hands = ['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush','Royal flush'];
  const reactions: [string,string][] = [
    ['Lantern maiden · good result',parlorResidentMedia('queen').reaction],
    ['Brazier maiden · good result',parlorResidentMedia('medium').reaction],
    ['Gambler · receives a card','/video/parlor-gambler-native-v2/receive.webm'],
    ['Gambler · notices a result','/video/parlor-gambler-hair-v1/notice.webm'],
    ['Gambler · loses again','/video/parlor-gambler-native-v2/loss.webm'],
    ['Condemned ghost · $1,000 Easter egg','/video/parlor-exterior-stories-v1/condemned-jackpot.webm'],
    ['Mounted ghost · $1,000 Easter egg','/video/parlor-exterior-stories-v1/rider-jackpot.webm'],
  ];
  const idles: [string,string][] = [];
  for (const [key,label] of [['queen','Lantern maiden'],['medium','Brazier maiden']] as const) {
    const media=parlorResidentMedia(key);
    idles.push([`${label} - quiet idle`,media.idle],[`${label} - alternate idle`,media.alternate],[`${label} - quiet movement`,media.characterIdle]);
    media.quietVariants.forEach((src, i) => idles.push([`${label} - quiet variation ${i + 1}`, src]));
  }
  idles.push(['Gambler - quiet idle','/video/parlor-gambler-hair-v1/idle.webm'],['Gambler - adjusts his hat','/video/parlor-idles-v2/gambler-brim.webm'],['Gambler - inspects his hand','/video/parlor-idles-v2/gambler-knuckle.webm']);
  for (const [key,label] of [['condemned','Condemned ghost'],['rider','Mounted ghost']] as const) {
    idles.push([`${label} - quiet idle`,`/video/parlor-exterior-actors-v2/${key}.webm`]);
    for (const action of ['watch',key==='rider'?'settle':'wait']) idles.push([`${label} - ${action}`,`/video/parlor-exterior-stories-v1/${key}-${action}.webm`]);
    for (const action of key==='rider'?['pat','snort']:['palms','cold']) idles.push([`${label} - ${action}`,`/video/parlor-idles-v2/${key}-${action}.webm`]);
  }
  const characterPreviews=[...reactions,...idles];
  openModal(
    `<div class="feature-gallery">${["ride", "witch", "awaken-0", "awaken-1", "awaken-2", "awaken-3", "awaken-4", "fortune", "noon", "brand"].map((id) => `<button class="outline-button" data-feature-preview="${id}">${({ ride: "Ride of the Damned", witch: "Witching Hour", "awaken-0": "Graveyard", "awaken-1": "Saloon", "awaken-2": "Jail", "awaken-3": "Mine", "awaken-4": "Church", fortune: "Major win", noon: "High Noon", brand: "Hellfire Brand" } as Record<string, string>)[id]}</button>`).join("")}</div>`,
    "RARE ANIMATIONS · NO WAGER",
  );
  el('modal-body').insertAdjacentHTML('afterbegin','<h2>Rare animations</h2><p>Preview the current game’s performances without spending credits or changing your hand. Sound follows your sound setting.</p><h3>Feature events</h3>');
  el('modal-body').insertAdjacentHTML('beforeend', `<h3>Poker hand reactions</h3><div class="feature-gallery">${hands.map(rank=>`<button class="outline-button" data-hand-preview="${rank}">${rank}</button>`).join('')}</div><h3>Character reactions & Easter eggs</h3><div class="feature-gallery">${reactions.map(([label],i)=>`<button class="outline-button" data-character-preview="${i}">${label}</button>`).join('')}</div>`);
  el('modal-body').insertAdjacentHTML('beforeend', `<h3>Character idles</h3><div class="feature-gallery">${idles.map(([label],i)=>`<button class="outline-button" data-character-preview="${reactions.length+i}">${label}</button>`).join('')}</div>`);
  if (busy) el('modal-body').insertAdjacentHTML('afterbegin','<p>Let the current spin finish, then choose an animation.</p>');
  el('modal-body').querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=busy);
  if (busy) {
    const buttons=[...el('modal-body').querySelectorAll<HTMLButtonElement>('button')];
    const enableWhenReady=()=>{
      if (!modal.open || !buttons[0]?.isConnected) return;
      if (busy) { setTimeout(enableWhenReady,200); return; }
      buttons.forEach(button=>button.disabled=false);
    };
    setTimeout(enableWhenReady,200);
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-feature-preview]")
    .forEach(
      (b) => (b.onclick = () => { back!.hidden=false; void startShowcase(b.dataset.featurePreview); }),
    );
  el('modal-body').querySelectorAll<HTMLButtonElement>('[data-hand-preview]').forEach(button=>button.onclick=()=>{
    previewRequest++;
    if (reduced) {
      if (!document.getElementById('preview-motion-note')) el('modal-body').insertAdjacentHTML('afterbegin','<p id="preview-motion-note" role="status">Reduced motion is on. Turn it off in Settings to review the poker-hand performances.</p>');
      el('preview-motion-note').scrollIntoView({block:'nearest'});
      return;
    }
    modal.close(); back!.hidden=false;
    dismissSpectacle(); pokerGuests.stop();
    pokerGuests.play(button.dataset.handPreview!);
  });
  el('modal-body').querySelectorAll<HTMLButtonElement>('[data-character-preview]').forEach(button=>button.onclick=()=>{
    previewRequest++;
    const [label,src]=characterPreviews[Number(button.dataset.characterPreview)];
    openModal(`<h2>${label}</h2><video class="reaction-review" controls playsinline muted ${reduced?'':'autoplay'} src="${src}" poster="${src.replace('.webm','.png')}"></video><button id="back-to-rare-animations" class="action-button">Back to animations</button>`, 'CHARACTER PREVIEW · NO WAGER');
    if (label.startsWith('Lantern maiden') || label.startsWith('Brazier maiden')) el('modal-body').querySelector('video')!.style.filter='none';
    el('back-to-rare-animations').onclick=showAnimationPreview;
    if (label.startsWith('Condemned ghost') || label.startsWith('Mounted ghost')) el('modal-body').querySelector('video')!.style.filter='url(#exterior-mist-blend)';
  });
}
function showMathLab() {
  openModal(
    `<h2>Trust the math. Test the dust.</h2><p>The same game engine runs in an isolated worker, using a seeded test RNG. This does not touch your credits or live outcomes.</p><div class="lab-inputs"><label>PAID SPINS<select id="sim-spins"><option value="10000">10,000 · quick check</option><option value="100000">100,000</option><option value="1000000" selected>1,000,000</option><option value="10000000">10,000,000 · extended</option></select></label><label>SEED<input type="number" id="sim-seed" value="42" min="0" max="4294967295"></label><button id="sim-run" class="action-button">RUN STUDY</button><button id="sim-cancel" hidden>CANCEL</button></div><p class="fine">Tuning objectives: approximately 96% RTP, 38% immediate paid-spin hit frequency, bonus about 1/140. These are targets, not declared results. Full triggered bonuses are completed before stopping.</p><div id="sim-result" role="status" aria-live="polite"><div class="lab-empty">✧<p>A frontier built on evidence.</p><span>Run a study to see the actual distribution.</span></div></div>`,
    "MATH LAB · " + CONFIG.version,
  );
  el("sim-run").onclick = () => {
    const spins = Number(el<HTMLSelectElement>("sim-spins").value),
      seed = Number(el<HTMLInputElement>("sim-seed").value);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) {
      el("sim-result").textContent =
        "Choose an integer seed from 0 to 4,294,967,295.";
      return;
    }
    worker?.terminate();
    worker = new Worker(new URL("./math.worker.ts", import.meta.url), {
      type: "module",
    });
    el<HTMLButtonElement>("sim-run").disabled = true;
    el("sim-cancel").hidden = false;
    el("sim-result").innerHTML =
      '<p class="computing">Measuring returns, feature transitions and complete bonus rounds…</p>';
    worker.onmessage = (e) => {
      el<HTMLButtonElement>("sim-run").disabled = false;
      el("sim-cancel").hidden = true;
      if (e.data.error) {
        el("sim-result").textContent = e.data.error;
        return;
      }
      const r = e.data.result;
      el("sim-result").innerHTML =
        `<div class="stat-grid"><div><span>MEASURED RTP</span><strong>${r.rtp.toFixed(3)}%</strong></div><div><span>PAID-SPIN HIT RATE</span><strong>${r.hitRate.toFixed(2)}%</strong></div><div><span>BONUS FREQUENCY</span><strong>${r.bonusOneIn ? "1 / " + r.bonusOneIn.toFixed(1) : "None"}</strong></div><div><span>LARGEST ROUND</span><strong>${r.maxRoundX.toFixed(2)}×</strong></div></div><p class="fine">${r.paidSpins.toLocaleString()} paid spins + ${r.bonusSpins.toLocaleString()} free spins · seed ${r.seed}. Approximate 95% RTP interval ${r.approximateRtp95.map((n: number) => n.toFixed(2) + "%").join("–")}. This normal interval ignores serial correlation from persistent awakenings and is diagnostic only.</p><h3>COMPLETE ROUND DISTRIBUTION</h3>${Object.entries(
          r.distribution,
        )
          .map(
            ([k, v]) =>
              `<div class="distribution-row"><span>${k}</span><div><i style="width:${Math.max(0.2, (Number(v) / r.paidSpins) * 100)}%"></i></div><b>${((Number(v) / r.paidSpins) * 100).toFixed(3)}%</b></div>`,
          )
          .join(
            "",
          )}<details><summary>FEATURE FREQUENCIES</summary><table><tbody>${Object.entries(
          r.features,
        )
          .map(
            ([k, v]) =>
              `<tr><td>${k.replace(/:(\d)/, (_, n) => " · " + LOCATIONS[Number(n)])}</td><td>${Number(v).toLocaleString()}</td><td>${((Number(v) / r.totalSpins) * 100).toFixed(3)}% of all spins</td></tr>`,
          )
          .join(
            "",
          )}</tbody></table></details><button id="export-sim" class="action-button">EXPORT STUDY JSON</button>`;
      el("export-sim").onclick = () =>
        download(`devils-dust-study-${seed}.json`, r);
      worker?.terminate();
      worker = undefined;
    };
    worker.onerror = () => {
      el("sim-result").textContent =
        "The study could not complete. Try a smaller sample.";
      el<HTMLButtonElement>("sim-run").disabled = false;
      el("sim-cancel").hidden = true;
      worker?.terminate();
    };
    worker.postMessage({ spins, seed });
  };
  el("sim-cancel").onclick = () => {
    worker?.terminate();
    worker = undefined;
    el<HTMLButtonElement>("sim-run").disabled = false;
    el("sim-cancel").hidden = true;
    el("sim-result").textContent = "Study cancelled. No credits were changed.";
  };
}
modal.addEventListener("close", () => {
  worker?.terminate();
  worker = undefined;
});
try {
  scene = new URLSearchParams(location.search).has('parlor')
    ? new ParlorScene(el<HTMLCanvasElement>('frontier'), (cue,detail)=>audio.play(cue,detail))
    : new FrontierScene(el<HTMLCanvasElement>('frontier'));
  applyMotion();
} catch (e) {
  console.warn("WebGL presentation unavailable", e);
  document.body.classList.add("scene-fallback");
  el("frontier").setAttribute(
    "aria-label",
    "3D unavailable; using the accessible flat cabinet presentation",
  );
}
void connect();
