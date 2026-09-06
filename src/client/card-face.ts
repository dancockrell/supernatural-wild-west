export function cardFace(card: number) {
  const suit = Math.floor(card / 13);
  const rank = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ][card % 13];
  const glyph = ["♠", "♥", "♣", "♦"][suit];
  return `<div class="playing-card suit-${suit}" data-card="${card}" aria-hidden="true"><div class="playing-card-plate"></div><div class="playing-card-ink"><b>${rank}</b><i>${glyph}</i><small>${glyph}</small></div></div>`;
}
