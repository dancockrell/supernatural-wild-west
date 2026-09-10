"""Measurement primitives.

These are the instruments. Most of them exist because a hand investigation
reached a wrong conclusion first, so each one carries a note about what it is
allowed to conclude. An instrument that can only report a number is safer than
one that reports a verdict.
"""
from __future__ import annotations

import io
import math
from dataclasses import dataclass
from typing import Any, Sequence

from PIL import Image

# --- DOM geometry -----------------------------------------------------------

RECTS_JS = """
(selectors) => {
  const out = {};
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = null; continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // "painted" matters as much as the box: this codebase hides several
    // elements with clip-path:inset(50%) for screen readers, and those still
    // report a full rect. Treating them as visible blocked measurement of the
    // floor they merely overlap.
    const painted = cs.visibility !== 'hidden' && cs.display !== 'none'
      && parseFloat(cs.opacity || '1') > 0.01
      && !(cs.clipPath || '').includes('inset(50%)');
    out[sel] = {x: r.x, y: r.y, w: r.width, h: r.height,
                right: r.right, bottom: r.bottom, painted};
  }
  return out;
}
"""

# Lowest opaque row of a playing clip, as a fraction of its own height. This is
# how you find where a character's feet actually are instead of guessing a
# percentage: scan up from the bottom for the first row with real alpha.
FEET_JS = """
(sel) => {
  const host = document.querySelector(sel);
  if (!host) return null;
  const v = host.querySelector('video:not([hidden])');
  if (!v || v.readyState < 2 || !v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  const x = c.getContext('2d'); x.drawImage(v, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  for (let y = c.height - 1; y >= 0; y--) {
    let hits = 0;
    for (let px = 0; px < c.width; px += 2) if (d[(y * c.width + px) * 4 + 3] > 40) hits++;
    if (hits > 3) {
      const box = host.getBoundingClientRect();
      const vidAR = v.videoWidth / v.videoHeight, boxAR = box.width / box.height;
      const renderH = vidAR > boxAR ? box.width / vidAR : box.height;
      const offY = (box.height - renderH) / 2;
      return {clip: v.src.split('/').pop(), frac: y / c.height,
              pageY: box.y + offY + (y / c.height) * renderH,
              boxTop: box.y, boxHeight: box.height};
    }
  }
  return null;
}
"""

# One animation frame's worth of truth about every sprite group. Counts the
# frames where nothing is painting, or where the painting element is not
# actually able to paint. Note it deliberately reports raw states and lets the
# check decide: an ended clip that is still visible is a legitimate hold.
WATCH_JS = """
({groups, ms}) => new Promise(resolve => {
  const stat = {}, samples = {};
  const start = performance.now();
  const bump = (k, e) => { stat[k] = (stat[k] || 0) + 1;
    (samples[k] = samples[k] || []); if (samples[k].length < 4) samples[k].push(e); };
  function frame() {
    const t = Math.round(performance.now() - start);
    for (const [name, sel] of Object.entries(groups)) {
      const host = document.querySelector(sel.host);
      if (!host) continue;
      const vids = [...host.querySelectorAll('video')]
        .filter(v => !v.hidden && getComputedStyle(v).display !== 'none');
      const covers = [...host.querySelectorAll('canvas')]
        .filter(c => c.width > 0 && getComputedStyle(c).display !== 'none');
      stat[name + '/frames'] = (stat[name + '/frames'] || 0) + 1;
      if (vids.length === 0 && covers.length === 0)
        bump(name + '/BLANK', {t});
      for (const v of vids) {
        const stalled = v.ended || v.paused || v.readyState < 2 || v.seeking;
        if (!stalled) continue;
        // A stalled clip is fine while something still paints: either a held
        // canvas, or the clip itself frozen on its last decoded frame.
        const painting = covers.length > 0 || (v.readyState >= 2 && v.videoWidth > 0);
        bump(name + (painting ? '/HELD' : '/GAP'),
             {t, src: v.src.split('/').pop(), ended: v.ended, paused: v.paused,
              rs: v.readyState, seeking: v.seeking});
      }
    }
    if (performance.now() - start < ms) requestAnimationFrame(frame);
    else resolve({stat, samples});
  }
  requestAnimationFrame(frame);
})
"""


# --- pixel analysis ---------------------------------------------------------

@dataclass
class Edge:
    pos: int
    delta: float

    def as_dict(self) -> dict[str, float]:
        return {"pos": self.pos, "delta": round(self.delta, 2)}


def _luma_columns(img: Image.Image) -> list[float]:
    px = img.convert("RGB").load()
    w, h = img.size
    return [sum((px[x, y][0] + px[x, y][1] + px[x, y][2]) / 3 for y in range(0, h, 2)) / max(1, len(range(0, h, 2)))
            for x in range(w)]


def _luma_rows(img: Image.Image) -> list[float]:
    px = img.convert("RGB").load()
    w, h = img.size
    return [sum((px[x, y][0] + px[x, y][1] + px[x, y][2]) / 3 for x in range(0, w, 2)) / max(1, len(range(0, w, 2)))
            for y in range(h)]


def _strongest(profile: Sequence[float], skip: int = 3) -> Edge:
    """Largest local step in a 1-D profile.

    A wide window is used on purpose: a 1px window finds noise, and a real
    architectural seam is a step between two regions rather than a spike.
    """
    best = Edge(-1, 0.0)
    for i in range(skip, len(profile) - skip):
        delta = ((profile[i + 1] + profile[i + 2]) / 2) - ((profile[i - 1] + profile[i - 2]) / 2)
        if abs(delta) > abs(best.delta):
            best = Edge(i, delta)
    return best


def vertical_seams(png: bytes, threshold: float, min_sep: int = 24, limit: int = 3) -> list[Edge]:
    """Every vertical step above threshold, not just the strongest.

    Reporting only the maximum hid a newly introduced seam behind an existing
    one: the count never rose, so the check looked blind during its own
    sabotage test. Peaks are suppressed within min_sep so one soft edge is not
    counted several times.
    """
    profile = _luma_columns(Image.open(io.BytesIO(png)))
    deltas: list[Edge] = []
    for i in range(3, len(profile) - 3):
        delta = ((profile[i + 1] + profile[i + 2]) / 2) - ((profile[i - 1] + profile[i - 2]) / 2)
        if abs(delta) >= threshold:
            deltas.append(Edge(i, delta))
    deltas.sort(key=lambda e: abs(e.delta), reverse=True)
    kept: list[Edge] = []
    for edge in deltas:
        if all(abs(edge.pos - k.pos) >= min_sep for k in kept):
            kept.append(edge)
        if len(kept) >= limit:
            break
    return kept


def vertical_seam(png: bytes) -> Edge:
    """Strongest vertical edge. Says nothing about the cause.

    A high value here is not automatically a bug: reel borders, panel edges and
    painted architecture all produce real vertical steps. Only run it on a crop
    that contains no UI, and confirm a cause by hiding layers.
    """
    return _strongest(_luma_columns(Image.open(io.BytesIO(png))))


def horizontal_seam(png: bytes) -> Edge:
    return _strongest(_luma_rows(Image.open(io.BytesIO(png))))


def mean_luma(png: bytes) -> float:
    img = Image.open(io.BytesIO(png)).convert("RGB")
    px = img.load()
    w, h = img.size
    total = 0.0
    count = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            total += (r + g + b) / 3
            count += 1
    return total / max(1, count)


def frames_differ(a: bytes, b: bytes, sample: int = 6) -> float:
    """Mean absolute luminance difference between two screenshots, 0-255.

    Used to notice that something changed at all — a spin that paints nothing,
    or a 'reduced motion' setting that still animates.
    """
    ia = Image.open(io.BytesIO(a)).convert("RGB")
    ib = Image.open(io.BytesIO(b)).convert("RGB")
    if ia.size != ib.size:
        return 255.0
    pa, pb = ia.load(), ib.load()
    w, h = ia.size
    total = 0.0
    count = 0
    for y in range(0, h, sample):
        for x in range(0, w, sample):
            ra, ga, ba = pa[x, y]
            rb, gb, bb = pb[x, y]
            total += abs((ra + ga + ba) / 3 - (rb + gb + bb) / 3)
            count += 1
    return total / max(1, count)


def column_difference(a: bytes, b: bytes) -> list[float]:
    """Per-column mean absolute luminance difference between two screenshots.

    This is how you find a hard edge belonging to one layer without needing a
    patch of scene with nothing in it. Everything identical in both shots —
    characters, interface, painted architecture — cancels to zero, so what
    survives is only what that layer contributes. A layer clipped with a hard
    edge shows up as a step from nothing to something at the clip line.
    """
    ia = Image.open(io.BytesIO(a)).convert("RGB")
    ib = Image.open(io.BytesIO(b)).convert("RGB")
    if ia.size != ib.size:
        return []
    pa, pb = ia.load(), ib.load()
    w, h = ia.size
    rows = range(0, h, 2)
    out = []
    for x in range(w):
        total = 0.0
        for y in rows:
            ra, ga, ba = pa[x, y]
            rb, gb, bb = pb[x, y]
            total += abs((ra + ga + ba) / 3 - (rb + gb + bb) / 3)
        out.append(total / max(1, len(rows)))
    return out


def profile_steps(profile: Sequence[float], threshold: float, min_sep: int = 24,
                  limit: int = 3) -> list[Edge]:
    """Sharp steps in any 1-D profile, strongest first."""
    found: list[Edge] = []
    for i in range(3, len(profile) - 3):
        delta = ((profile[i + 1] + profile[i + 2]) / 2) - ((profile[i - 1] + profile[i - 2]) / 2)
        if abs(delta) >= threshold:
            found.append(Edge(i, delta))
    found.sort(key=lambda e: abs(e.delta), reverse=True)
    kept: list[Edge] = []
    for edge in found:
        if all(abs(edge.pos - k.pos) >= min_sep for k in kept):
            kept.append(edge)
        if len(kept) >= limit:
            break
    return kept


# Rendered font size and contrast for text a player has to read. Reported as
# numbers only: whether 9px is too small is the check's call, not the probe's.
TEXT_JS = """
(selectors) => {
  const parse = (c) => {
    const m = (c || '').match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  };
  const lum = (rgb) => {
    const f = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const backdrop = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const rgba = (bg || '').match(/[\d.]+/g);
      if (rgba && (rgba.length < 4 || Number(rgba[3]) > 0.5)) return parse(bg);
      node = node.parentElement;
    }
    return [10, 10, 10];
  };
  const out = {};
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = null; continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // Skip anything that is present for screen readers but not painted:
    // this codebase clips those to a 1px box with clip-path:inset(50%),
    // and reporting their font size as unreadable is a false alarm.
    const hidden = cs.visibility === 'hidden' || cs.display === 'none' || r.width < 1
      || parseFloat(cs.opacity || '1') <= 0.01
      || (cs.clipPath || '').includes('inset(50%)') || r.width <= 2 || r.height <= 2;
    if (hidden) { out[sel] = null; continue; }
    const fg = parse(cs.color), bg = backdrop(el);
    const l1 = lum(fg), l2 = lum(bg);
    out[sel] = {
      px: parseFloat(cs.fontSize),
      text: (el.textContent || '').trim().slice(0, 40),
      contrast: +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2),
    };
  }
  return out;
}
"""


# Does a label fit inside the control that holds it? scrollWidth exceeding
# clientWidth means the text is being clipped or spilling out.
FIT_JS = """
(pairs) => {
  const out = {};
  for (const {label, host, states} of pairs) {
    const el = document.querySelector(label);
    const box = document.querySelector(host);
    if (!el || !box) { out[label] = null; continue; }
    const original = el.textContent;
    const originalAttrs = {};
    const worst = {state: null, overflowX: 0, overflowY: 0};
    for (const entry of (states && states.length ? states : [original])) {
      // A state is not just its text. The app sets attributes alongside the
      // caption (data-caption drives the font size), and forcing the words
      // without them measures a combination the game never renders — which is
      // exactly how this probe invented a 10px overflow that no player sees.
      const state = typeof entry === 'string' ? entry : entry.text;
      const attrs = (typeof entry === 'object' && entry.hostAttrs) || {};
      for (const [k, v] of Object.entries(attrs)) {
        if (!(k in originalAttrs)) originalAttrs[k] = box.getAttribute(k);
        box.setAttribute(k, v);
      }
      el.textContent = state;
      void el.offsetWidth;
      // Measure the text itself, not the span. A wrapped span is as wide as
      // the line box it sits in, so its corners stick out of a round button
      // even when every glyph is comfortably inside — that produced a
      // confident 8px "overflow" for a caption that actually fits.
      const b = box.getBoundingClientRect();
      let lines = [];
      if (el.firstChild && el.firstChild.nodeType === 3) {
        const range = document.createRange();
        range.selectNodeContents(el);
        lines = [...range.getClientRects()].filter(x => x.width > 0 && x.height > 0);
      }
      if (!lines.length) lines = [el.getBoundingClientRect()];
      const r = {
        left: Math.min(...lines.map(l => l.left)), right: Math.max(...lines.map(l => l.right)),
        top: Math.min(...lines.map(l => l.top)), bottom: Math.max(...lines.map(l => l.bottom)),
        width: Math.max(...lines.map(l => l.width)),
        height: Math.max(...lines.map(l => l.bottom)) - Math.min(...lines.map(l => l.top)),
      };
      const ox = Math.max(0, r.right - b.right) + Math.max(0, b.left - r.left);
      const oy = Math.max(0, r.bottom - b.bottom) + Math.max(0, b.top - r.top);
      // A rectangle test is not enough for a round control: text can sit
      // inside the bounding box and still poke straight through the ring.
      // When the host is circular, measure the worst label corner against the
      // radius instead.
      const radii = getComputedStyle(box).borderRadius || '';
      const round = radii.includes('50%') && Math.abs(b.width - b.height) < 2;
      let escape = 0;
      if (round) {
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2, rad = b.width / 2;
        for (const line of lines)
          for (const [px, py] of [[line.left, line.top], [line.right, line.top],
                                  [line.left, line.bottom], [line.right, line.bottom]])
            escape = Math.max(escape, Math.hypot(px - cx, py - cy) - rad);
        escape = +escape.toFixed(1);
      }
      const spill = round ? Math.max(escape, 0) : ox + oy;
      // Record the first state unconditionally: tracking only the worst
      // meant a caption set that all fits left worst.state null, and the
      // check then reported nothing at all — indistinguishable from never
      // having run.
      if (worst.state === null || spill > worst.overflowX + worst.overflowY)
        Object.assign(worst, {state, overflowX: round ? spill : +ox.toFixed(1),
                              overflowY: round ? 0 : +oy.toFixed(1),
                              shape: round ? 'circle' : 'rect',
                              labelW: +r.width.toFixed(1), hostW: +b.width.toFixed(1)});
    }
    el.textContent = original;
    for (const [k, v] of Object.entries(originalAttrs)) {
      if (v === null) box.removeAttribute(k); else box.setAttribute(k, v);
    }
    out[label] = worst;
  }
  return out;
}
"""
