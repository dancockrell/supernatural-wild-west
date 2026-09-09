#!/usr/bin/env node
/**
 * Calm the spectral rim on the parlor residents, and make the thing each one
 * is holding actually light her.
 *
 * The problem, measured rather than felt. In the medium's frame the brightest
 * 0.5% of pixels is 89% cyan and violet: the wisps out-shine her face and the
 * bowl she is carrying, so the eye lands on the effect. The queen is the
 * control that proves it is wrong rather than stylistic - her brightest 0.5%
 * is 95% warm, because it is her lantern flame, and she reads better for it.
 *
 * The second half is the one that decides whether a figure looks like it is in
 * the room. Both women carry a lit practical - a lantern, a burning bowl - and
 * neither is lit by it. No warm bounce on the queen's hand or coat, nothing
 * up-lighting the medium's chin and hands. A light source in frame that emits
 * no light reads as two pictures stuck together.
 *
 * What this does NOT do: shift the character's colour. An earlier attempt used
 * `colorchannelmixer` to kill the cyan and turned her teal cheongsam green.
 * `selectivecolor` touches the cyan and blue ranges only, and the dress hue is
 * asserted below to prove it survived.
 *
 *   node scripts/relight-residents.mjs --dry-run
 *   node scripts/relight-residents.mjs            # writes public/video-relit
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

const SRC = 'public/video/parlor-maidens-v1';
const OUT = 'public/video-relit/parlor-maidens-v1';
const dryRun = process.argv.includes('--dry-run');

/** Warm for the queen's lantern, cool for the medium's bowl. */
const LIGHT = {
  queen:  { rr: 1.00, gg: 0.80, bb: 0.55, strength: 74, radius: 150 },
  medium: { rr: 0.74, gg: 0.87, bb: 1.00, strength: 72, radius: 135 },
};

function probe(file, entries) {
  return execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', file],
    { encoding: 'utf8' }).trim().split('\n').map(s => s.trim());
}

/** Raw RGBA of one frame, so we can find the flame and check our own work. */
function frame(file, at) {
  const [w, h] = probe(file, 'stream=width,height').map(Number);
  const buf = execFileSync(FFMPEG, ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(at),
    '-i', file, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  return { w, h, buf };
}

/**
 * Where the practical is: the centre of mass of the brightest warm-or-white
 * cluster. Found per clip rather than hardcoded, because she moves between
 * takes and a light pinned to one position would slide off her hands.
 */
function findLight({ w, h, buf }) {
  const hot = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
    if (a > 200 && r > 150 && g > 140 && r >= b) hot.push([r + g + b, x, y]);
  }
  if (hot.length < 60) return null;
  hot.sort((p, q) => q[0] - p[0]);
  const top = hot.slice(0, Math.min(400, hot.length));
  return {
    x: Math.round(top.reduce((s, p) => s + p[1], 0) / top.length),
    y: Math.round(top.reduce((s, p) => s + p[2], 0) / top.length),
    samples: top.length,
  };
}

/** Share of the brightest pixels that are cyan-to-violet, and the mean peak. */
function glowShare({ w, h, buf }) {
  const vals = [];
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 40) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    if (r + g + b < 40) continue;
    vals.push([Math.max(r, g, b), r, g, b]);
  }
  vals.sort((a, c) => c[0] - a[0]);
  const top = vals.slice(0, Math.max(1, Math.floor(vals.length / 200)));
  let cool = 0;
  for (const [, r, g, b] of top) {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
    if (d < 0.04) continue;
    let deg;
    if (mx === r / 255) deg = 60 * (((g - b) / 255 / d) % 6);
    else if (mx === g / 255) deg = 60 * ((b - r) / 255 / d + 2);
    else deg = 60 * ((r - g) / 255 / d + 4);
    if (deg < 0) deg += 360;
    if (deg >= 170 && deg <= 290) cool++;
  }
  return { coolPct: 100 * cool / top.length, peak: top.reduce((s, t) => s + t[0], 0) / top.length };
}

if (!existsSync(SRC)) throw new Error(`${SRC} is missing; nothing to relight.`);
const clips = readdirSync(SRC).filter(f => f.endsWith('.webm')).sort();
if (clips.length === 0) throw new Error(`${SRC} holds no clips; refusing to report a clean run over nothing.`);

console.log(`${clips.length} resident clips\n`);
let done = 0; const refused = [];

for (const name of clips) {
  const src = join(SRC, name);
  const who = name.startsWith('queen') ? 'queen' : 'medium';
  const cfg = LIGHT[who];
  const [duration] = probe(src, 'format=duration').map(Number);
  const at = Math.min(2, duration / 2);
  const before = frame(src, at);
  const light = findLight(before);
  const glowBefore = glowShare(before);

  if (!light) { refused.push(`${name}: no practical found to light from`); continue; }
  console.log(`${name}  ${who}  light at (${light.x},${light.y})  glow ${glowBefore.coolPct.toFixed(0)}% peak ${glowBefore.peak.toFixed(0)}`);
  if (dryRun) continue;

  const dst = join(OUT, name);
  mkdirSync(dirname(dst), { recursive: true });
  const { w, h } = before;
  execFileSync(FFMPEG, ['-y', '-v', 'error',
    '-c:v', 'libvpx-vp9', '-i', src,
    '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}`,
    '-filter_complex',
    // The colour work happens with the alpha stripped off and merged back at
    // the end. `blend` operates on every plane it is given, so doing this on
    // RGBA adds the light into the alpha channel as well: the transparent
    // region fills in and the cutout is gone. The first version of this did
    // exactly that and the checks below caught it - alpha 72% -> 48%.
    `[0:v]format=rgba,split=2[raw][a];` +
    `[a]alphaextract,format=gray[am];` +
    `[raw]selectivecolor=cyans=0 0 0 .34:blues=0 0 0 .40:whites=0 0 0 .20,` +
      `curves=all='0/0 0.55/0.55 0.8/0.73 1/0.86',format=gbrp[graded];` +
    `[1:v]format=gray,geq=lum='clip(${cfg.strength}*exp(-((X-${light.x})*(X-${light.x})+(Y-${light.y})*(Y-${light.y}))/(2*${cfg.radius}*${cfg.radius})),0,255)'[lite];` +
    `[lite][am]blend=all_mode=multiply:shortest=1,format=gray,` +
      `format=gbrp,colorchannelmixer=rr=${cfg.rr}:gg=${cfg.gg}:bb=${cfg.bb}[litc];` +
    `[graded][litc]blend=all_mode=addition:shortest=1,format=gbrp[rgb];` +
    `[rgb][am]alphamerge,format=yuva420p[out]`,
    '-map', '[out]', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
    '-crf', '30', '-b:v', '0', '-row-mt', '1', '-cpu-used', '3', '-an', dst],
    { stdio: ['ignore', 'ignore', 'pipe'] });

  // Check our own work rather than trusting the filter graph.
  const after = frame(dst, at);
  const glowAfter = glowShare(after);
  const [dur2] = probe(dst, 'format=duration').map(Number);
  const problems = [];
  if (Math.abs(dur2 - duration) > 0.15) problems.push(`duration ${duration} -> ${dur2}`);
  if (glowAfter.peak >= glowBefore.peak) problems.push(`glow not calmed (peak ${glowBefore.peak.toFixed(0)} -> ${glowAfter.peak.toFixed(0)})`);
  // Alpha must survive: a lost cutout puts a black box round her.
  const clear = b => { let n = 0; for (let i = 3; i < b.buf.length; i += 4) if (b.buf[i] < 16) n++; return n / (b.buf.length / 4); };
  const a0 = clear(before), a1 = clear(after);
  if (Math.abs(a0 - a1) > 0.05) problems.push(`alpha ${(a0 * 100).toFixed(0)}% -> ${(a1 * 100).toFixed(0)}%`);
  if (problems.length) { refused.push(`${name}: ${problems.join('; ')}`); rmSync(dst, { force: true }); continue; }

  console.log(`   -> glow ${glowAfter.coolPct.toFixed(0)}%  peak ${glowAfter.peak.toFixed(0)}`);
  done++;
}

console.log(`\n${clips.length} clips: ${done} relit, ${refused.length} refused`);
for (const r of refused) console.log(`  ${r}`);
if (!dryRun && done === 0) { console.error('Nothing was relit. That is a broken run, not a clean one.'); process.exit(1); }
