import { cardFace } from "./card-face";
import { handMotion, handChoreographyIndices, stageHandFrames } from "./poker-motion";
import type { SpinResult } from "../engine/types";

export class PokerTable {
  private table = document.createElement("div");
  private content = document.createElement("div");
  private reduced = false;
  private presentation = 0;
  setReduced(value: boolean) {
    this.reduced = value;
  }
  constructor(
    cabinet: Element,
    private sound: (
      cue: "card" | "hand" | "breath" | "lantern" | "pages",
      detail?: number,
    ) => void,
    private arrived: (token:string,index:number,animate:boolean)=>void = ()=>{},
  ) {
    this.table.className = "poker-table player-play-space";
    this.table.setAttribute("aria-label", "Your poker hand");
    this.content.className = "poker-felt";
    this.table.append(this.content);
    (document.querySelector(".controls") || cabinet).after(this.table);
    this.restore([]);
  }
  restore(cards: number[], rank = "", amount = 0, preserveGuest = false) {
    this.presentation++;
    if (!preserveGuest) this.table.dispatchEvent(new Event("hand-reset"));
    const slots = (hand: number[]) =>
      Array.from({ length: 5 }, (_, i) => {
        const card = hand[i];
        return card === undefined
          ? '<div class="poker-slot" aria-label="Empty card slot"></div>'
          : `<div class="poker-slot dealt" aria-label="${["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][card % 13]} ${["spades", "hearts", "clubs", "diamonds"][Math.floor(card / 13)]}">${cardFace(card)}</div>`;
      }).join("");
    this.table.removeAttribute("data-hand");
    this.content.innerHTML = `<div class="player-seat"><div class="poker-cards" aria-label="Your poker hand">${slots(cards)}</div><div class="poker-award" role="status">${rank}${amount ? `<strong>${(amount / 100).toFixed(2)} CR</strong>` : ""}</div></div>`;
  }
  async show(result: SpinResult, animate: boolean) {
    const hand = result.poker;
    animate = animate && !this.reduced;
    this.table.toggleAttribute(
      "data-legacy",
      !["dd-1.3.0", "dd-1.4.0"].includes(result.configVersion),
    );
    if (!hand) {
      this.restore(result.state.poker?.cards || [], "", 0, true);
      return;
    }
    this.restore(hand.cards, "", 0, true);
    const generation=this.presentation;
    const cells = hand.cells || [hand.cell!];
    const indices = hand.cells
      ? hand.cards.map((_, i) => i)
      : [hand.cards.length - 1];
    const targets = [
      ...this.content.querySelectorAll<HTMLElement>(".poker-cards .poker-slot"),
    ];
    const symbols = [...document.querySelectorAll<HTMLElement>(".symbol")];
    cells.forEach((cell) => {
      symbols[cell]?.classList.add("poker-collected");
    });
    if (animate) {
      const sources = cells.map((cell) => symbols[cell]).filter(Boolean);
      sources.forEach((source) => source.classList.add("poker-source"));
      symbols
        .filter((s) => s.classList.contains("dust") && !sources.includes(s))
        .forEach((s) => s.classList.add("poker-not-selected"));
      indices.forEach((index) => {
        targets[index].style.visibility = "hidden";
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.all(
        indices.map(async (index, i) => {
          const target = targets[index],
            source = symbols[cells[i]];
          target.style.visibility = "hidden";
          await new Promise((resolve) => setTimeout(resolve, i * 40));
          const to = target.getBoundingClientRect(),
            from = source?.getBoundingClientRect();
          this.sound("card");
          const flyer = document.createElement("div");
          flyer.className = "poker-flying-card";
          flyer.innerHTML = cardFace(hand.cards[index]);
          Object.assign(flyer.style, {
            left: `${to.x}px`,
            top: `${to.y}px`,
            width: `${to.width}px`,
            height: `${to.height}px`,
          });
          // The flight and landing use identical ink geometry at every stage scale.
          for (const selector of ['.playing-card-ink', '.playing-card-ink b', '.playing-card-ink i', '.playing-card-ink small']) {
            const sourceInk = target.querySelector<HTMLElement>(selector);
            const flyingInk = flyer.querySelector<HTMLElement>(selector);
            if (!sourceInk || !flyingInk) continue;
            const style = getComputedStyle(sourceInk);
            for (const property of ['font-size','font-weight','line-height','top','right','bottom','left','width','height','transform','text-align']) {
              flyingInk.style.setProperty(property, style.getPropertyValue(property));
            }
          }
          document.body.append(flyer);
          let landed=false;
          try {
            await flyer.animate(
              [
                {
                  transform: `translate(${(from?.x ?? to.x) - to.x}px,${(from?.y ?? to.y) - to.y}px) rotate(-8deg) scale(1.2)`,
                },
                { transform: "translate(0,0) rotate(0) scale(1)" },
              ],
              { duration: 220, easing: "cubic-bezier(.2,.75,.3,1)" },
            ).finished;
            landed=true;
          } catch {
            // A cancelled flight cannot trigger a new ghost arrival.
          } finally {
            flyer.remove();
            target.style.visibility = "";

          }
          if(landed && generation===this.presentation && target.isConnected) this.arrived(`${result.id}:${index}`,index,!this.reduced&&!document.hidden);
        }),
      );
      sources.forEach((s) => s.classList.remove("poker-source"));
      symbols.forEach((s) => s.classList.remove("poker-not-selected"));
    }
    if(!animate && generation===this.presentation) indices.forEach(index=>this.arrived(`${result.id}:${index}`,index,false));
    if(generation!==this.presentation) return;
    if (!hand.complete) return;
    this.content.querySelector(".poker-award")!.innerHTML =
      `${hand.rank}${hand.amount ? `<strong>${(hand.amount / 100).toFixed(2)} CR</strong>` : ""}`;
    const matching = handChoreographyIndices(hand.cards, hand.rank).map(i => targets[i]);
    const motion = handMotion(hand.rank);
    this.table.dataset.hand = motion.name;
    if (hand.amount) matching.forEach((c) => c.classList.add("poker-matching"));
    if (animate && (hand.amount > 0 || hand.rank === "High card")) this.table.dispatchEvent(new CustomEvent("hand-award", {detail: hand.rank}));
    if (animate && hand.amount > 0) {
      this.sound("hand", motion.sound);
      await Promise.all(
        matching.map(
          (card, i) =>
            card.animate(document.documentElement.classList.contains('unified-parlor')
              ? stageHandFrames(motion.frames(i, matching.length), card.getBoundingClientRect().width)
              : motion.frames(i, matching.length), {
              duration: motion.duration,
              delay: motion.delay(i),
              easing: "cubic-bezier(.22,.7,.3,1)",
            }).finished,
        ),
      );
    }
  }
}
