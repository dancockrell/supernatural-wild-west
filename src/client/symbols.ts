import { cardFace } from "./card-face";
import type { SymbolId } from "../engine/types";
export const SYMBOLS: Record<
  SymbolId,
  { name: string; short: string; color: string }
> = {
  gunslinger: { name: "Gunslinger", short: "GUNSLINGER", color: "#d6ae69" },
  medium: { name: "Brazier Maiden", short: "BRAZIER MAIDEN", color: "#9bb9b1" },
  queen: { name: "Lantern Maiden", short: "LANTERN MAIDEN", color: "#cb927c" },
  preacher: { name: "Preacher", short: "THE PREACHER", color: "#c9b997" },
  rider: { name: "Devil Rider", short: "DEVIL RIDER", color: "#d47b51" },
  ace: { name: "Ace", short: "ACE", color: "#bdb394" },
  king: { name: "King", short: "KING", color: "#bcb298" },
  horseshoe: { name: "Lucky Iron", short: "LUCKY IRON", color: "#b8ae8d" },
  bottle: { name: "Snake Oil", short: "SNAKE OIL", color: "#93ac9b" },
  wild: {
    name: "Hellfire Brand Wild",
    short: "HELLFIRE WILD",
    color: "#f7ba60",
  },
  scatter: {
    name: "Blood Moon Scatter",
    short: "BLOOD MOON",
    color: "#e17f68",
  },
  gold: { name: "Gold Mine", short: "GOLD MINE", color: "#ffd36c" },
  dust: { name: "Poker Card", short: "CARDS", color: "#916249" },
};
export function symbolSvg(id: SymbolId, card = 0) {
  if (["gold","gunslinger","queen","medium","preacher","rider"].includes(id)) return `<div class="movie-symbol" aria-hidden="true"><canvas data-movie="${id}"></canvas></div>`;
  if (id === "dust") return cardFace(card);
  const portraits: SymbolId[] = [
    "gunslinger",
    "medium",
    "queen",
    "preacher",
    "rider",
  ];
  const portrait = portraits.indexOf(id);
  if (portrait >= 0)
    return `<div class="portrait-art portrait-${id}" aria-hidden="true" style="--portrait:${portrait};background-position:${portrait * 25}% 24%"></div>`;
  const relics: SymbolId[] = [
    "ace",
    "king",
    "horseshoe",
    "bottle",
    "wild",
    "scatter",
  ];
  const relic = relics.indexOf(id);
  if (relic >= 0)
    return `<div class="relic-art" aria-hidden="true" style="background-position:${(relic % 3) * 50}% ${relic < 3 ? 0 : 100}%"></div>`;
  let drawing = "";
  const face =
    '<path d="M39 47 Q36 70 49 78 L59 74 65 48Z" fill="currentColor" opacity=".65"/><path d="M42 55L48 54M56 53L61 54M49 68L57 67" stroke="#1a201c" stroke-width="2.5"/>';
  if (id === "gunslinger")
    drawing =
      '<path d="M17 96L27 78 41 70 51 84 63 70 79 79 87 96" fill="currentColor" opacity=".35"/>' +
      face +
      '<path d="M16 45Q48 32 85 44L80 49 20 50ZM32 39L35 17 63 14 73 39Z" fill="currentColor"/><path d="M34 33L69 32" stroke="#191e19" stroke-width="5"/><path d="M32 74L52 85 67 73 62 92 44 91Z" fill="currentColor"/>';
  if (id === "medium")
    drawing =
      '<path d="M15 97Q25 55 30 29Q50 -2 74 29L86 97Z" fill="currentColor" opacity=".23"/><path d="M30 60Q23 16 52 16Q81 21 71 65L63 41 44 32Z" fill="currentColor"/>' +
      face +
      '<path d="M37 77L24 96M65 78L79 96" stroke="currentColor" stroke-width="11"/><circle cx="52" cy="29" r="4" fill="#e4d7aa"/><circle cx="50" cy="91" r="10" fill="none" stroke="currentColor"/><path d="M48 6L50 0 53 6 60 8 53 11 50 17 47 11 41 8Z" fill="currentColor"/>';
  if (id === "queen")
    drawing =
      '<path d="M21 97L26 81 42 70 58 70 76 80 86 97" fill="currentColor" opacity=".5"/><path d="M30 48Q23 16 53 17Q82 24 72 81L59 67 42 72 29 84Z" fill="currentColor" opacity=".6"/>' +
      face +
      '<path d="M13 42L33 36 38 13 62 18 68 35 85 45Z" fill="currentColor"/><path d="M38 28L65 32" stroke="#22221c" stroke-width="4"/><path d="M66 28Q95 4 81 2Q65 6 66 28" fill="currentColor"/><circle cx="64" cy="61" r="3" fill="none" stroke="currentColor"/>';
  if (id === "preacher")
    drawing =
      '<path d="M13 97L29 76 40 73 58 73 74 78 86 97" fill="currentColor" opacity=".45"/>' +
      face +
      '<path d="M19 43L31 38 35 9 66 9 70 38 84 43 78 49 23 49Z" fill="currentColor"/><path d="M36 76L51 87 64 76" stroke="currentColor" stroke-width="4"/><path d="M50 85V100M43 91H57" stroke="currentColor" stroke-width="3"/><path d="M44 61L48 68 58 67 62 59" fill="none" stroke="#34372b" stroke-width="3"/>';
  if (id === "rider")
    drawing =
      '<path d="M13 98L27 74 45 68 63 72 84 98" fill="currentColor" opacity=".4"/><path d="M34 45Q28 65 43 76L62 75 73 44Z" fill="currentColor"/><path d="M41 54L49 58 42 62 37 57ZM57 58L66 53 68 58 60 63Z" fill="#331f16"/><path d="M50 61L47 68 54 68M43 72H61" stroke="#331f16" stroke-width="3"/><path d="M13 44L31 35 32 13 63 12 71 35 89 43 76 48 24 48Z" fill="currentColor"/><path d="M34 27L67 26" stroke="#38261e" stroke-width="4"/><path d="M22 84Q1 64 15 51Q8 75 32 74M74 74Q94 55 87 45Q108 71 80 88" fill="currentColor" opacity=".5"/>';
  if (id === "wild")
    drawing =
      '<path d="M53 3Q67 28 62 41Q86 29 80 53Q97 72 71 93Q35 109 22 80Q11 57 34 39Q25 62 41 55Q31 29 53 3Z" fill="currentColor" opacity=".28"/><path d="M32 34L40 76 52 56 64 76 74 34M28 42H77" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="52" cy="56" r="33" fill="none" stroke="currentColor" stroke-width="2"/>';
  if (id === "scatter")
    drawing =
      '<circle cx="50" cy="50" r="33" fill="currentColor" opacity=".7"/><circle cx="64" cy="40" r="28" fill="#272821"/><path d="M13 51H3M97 51H86M50 4V14M50 86V97" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="50" r="43" stroke="currentColor" fill="none" stroke-dasharray="2 8"/>';
  if (id === "ace" || id === "king")
    drawing = `<text x="50" y="73" font-size="72" text-anchor="middle" font-family="Georgia" fill="currentColor">${id === "ace" ? "A" : "K"}</text><path d="M50 3L55 11 50 19 45 11ZM50 82L55 90 50 98 45 90Z" fill="currentColor" opacity=".5"/>`;
  if (id === "horseshoe")
    drawing =
      '<path d="M29 23L20 51Q15 87 49 89Q83 87 80 51L71 23 57 27 65 52Q69 73 50 75Q31 73 36 52L43 27Z" fill="none" stroke="currentColor" stroke-width="7"/><path d="M28 45L32 46M25 60H30M34 77L37 74M70 45L65 46M73 60H68M64 77L60 74" stroke="currentColor" stroke-width="3"/>';
  if (id === "bottle")
    drawing =
      '<path d="M42 10H60V34L70 47V90Q50 99 30 90V47L42 34Z" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="2"/><path d="M39 11H63M39 18H63" stroke="currentColor" stroke-width="5"/><path d="M33 52H67V79H33Z" fill="currentColor" opacity=".7"/><path d="M42 60Q61 54 56 65Q41 73 56 74" fill="none" stroke="#273029" stroke-width="3"/>';
  return `<svg viewBox="0 0 100 105" aria-hidden="true" style="color:${SYMBOLS[id].color}">${drawing}</svg>`;
}
