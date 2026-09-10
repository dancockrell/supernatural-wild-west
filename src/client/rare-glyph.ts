/** Resolution-independent performances for rare events without an admitted film. */
export function rareGlyph(kind: 'brand'): HTMLElement {
  const host = document.createElement('div');
  host.className = `rare-glyph rare-glyph-${kind}`;
  host.dataset.performance = kind;
  const sparks = Array.from({length: 20}, (_, i) => `<i style="--spark-x:${14 + (i * 37 % 73)}%;--spark-delay:${.9 + (i % 7) * .24}s;--spark-drift:${(i % 2 ? 1 : -1) * (18 + i * 3)}px"></i>`).join('');
  const brand = `<g class="glyph-ring"><path d="M300 70l192 111v222L300 514 108 403V181Z"/><circle cx="300" cy="292" r="176"/></g><path class="glyph-brand-iron" pathLength="1" d="M182 223l48 147 70-123 70 123 48-147M172 208h53m150 0h53M212 394h176"/><g class="glyph-brand-flame"><path d="M264 191c-42-49 52-57 32-108 74 64 24 86 38 108M233 425q67 36 134 0"/></g>`;
  host.innerHTML = `<div class="glyph-light"></div><div class="glyph-mist"></div><svg viewBox="0 0 600 600" aria-hidden="true"><defs><linearGradient id="glyph-metal-${kind}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#fff0c4"/><stop offset=".38" stop-color="#c18a43"/><stop offset=".53" stop-color="#80502a"/><stop offset=".65" stop-color="#f5cc85"/><stop offset="1" stop-color="#af7439"/></linearGradient></defs>${brand}</svg><div class="glyph-embers">${sparks}</div>`;
  return host;
}

