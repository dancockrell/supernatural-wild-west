#!/usr/bin/env node
/**
 * Close the loop on clips that visibly jump when they repeat.
 *
 * A looping clip is seamless when its last frame matches its first. Measured
 * across everything the game loops, most are fine and two are not:
 *
 *     environment-color.mp4      0.50   seamless
 *     dealer-idle.webm           2.09   seamless
 *     gold-mine-loop.mp4         2.99   seamless
 *     preacher-book-v10.webm    12.52   visible
 *     rider-gallop-v5.webm      15.72   visible
 *     queen-idle.webm           31.75   bad
 *     medium-idle.webm          40.52   worst
 *
 * The residents are the two that jump every four or five seconds, which is
 * what reads as the loops flashing.
 *
 * The fix is a crossfade, and the order matters. Blending the tail onto the
 * *end* barely helps - measured, 40.52 only fell to 34.50 - because the clip
 * then ends on head[T] while the loop restarts at head[0], so the jump moves
 * rather than closing. Putting the blend at the *start*, so the clip opens on
 * a mix of head[0] and tail[0] and ends where that mix began, takes the same
 * clip to 4.85.
 *
 *   node scripts/close-loops.mjs --dry-run    # measure only
 *   node scripts/close-loops.mjs              # writes public/video-looped
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

/** Everything `movie()` sets `loop = true` on. */
const LOOPS = [
  'public/video/parlor-maidens-v1/queen-idle.webm',
  'public/video/parlor-maidens-v1/medium-idle.webm',
  'public/video/preacher-book-v10.webm',
  'public/video/rider-gallop-v5.webm',
  'public/video/cast-loop-v1/dealer-idle.webm',
  'public/video/cast-loop-v1/gold-mine-loop.mp4',
];

/** Below this a seam is not visible in motion; dealer-idle sits at 2.09. */
const SEAM_OK = 6;
/**
 * How much of the clip to spend closing it, tried shortest first. The fade is
 * paid for in running time, so a clip that closes at 0.6s should not be given
 * 1.4s. Some never close at any of these: a galloping rider's legs are in a
 * different phase at each end and blending two phases together is worse than
 * the cut, which is what the checks below catch.
 */
const FADES = [0.6, 1.0, 1.5];

const OUT = 'public/video-looped';
const dryRun = process.argv.includes('--dry-run');

const isWebm = f => /\.webm$/i.test(f);
const dec = f => (isWebm(f) ? ['-c:v', 'libvpx-vp9'] : []);

function duration(file) {
  return Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

function rgba(file, at) {
  const [w, h] = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file],
    { encoding: 'utf8' }).trim().split('x').map(Number);
  const buf = execFileSync(FFMPEG, ['-v', 'error', ...dec(file), '-ss', String(at), '-i', file,
    '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  return { w, h, buf };
}

/** Mean absolute RGB difference between the first and last frame. */
function seam(file) {
  const d = duration(file);
  const a = rgba(file, 0).buf, b = rgba(file, Math.max(0, d - 0.05)).buf;
  const n = Math.min(a.length, b.length);
  let sum = 0, count = 0;
  for (let i = 0; i < n; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return sum / count;
}

const clearShare = buf => {
  let n = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] < 16) n++;
  return n / (buf.length / 4);
};

const present = LOOPS.filter(f => existsSync(f));
if (present.length === 0) throw new Error('None of the looping clips are on disk; refusing to report a clean run over nothing.');
if (present.length < LOOPS.length) {
  for (const f of LOOPS) if (!existsSync(f)) console.log(`  not on disk, skipped: ${f}`);
}

let fixed = 0, alreadyFine = 0;
const refused = [];

for (const file of present) {
  const before = seam(file);
  const name = basename(file);
  if (before <= SEAM_OK) { alreadyFine++; console.log(`${name}  seam ${before.toFixed(2)}  already closes`); continue; }
  console.log(`${name}  seam ${before.toFixed(2)}  needs closing`);
  if (dryRun) continue;

  const d = duration(file);
  const target = join(OUT, file.replace(/^public\/video\//, ''));
  mkdirSync(dirname(target), { recursive: true });
  const fmt = isWebm(file) ? 'rgba' : 'rgb24';
  const outFmt = isWebm(file) ? 'yuva420p' : 'yuv420p';

  let landed = null; const tried = [];
  for (const fade of FADES) {
    if (d - fade * 2 < 0.5) break;             // nothing left in the middle
    const midEnd = (d - fade).toFixed(3);
    execFileSync(FFMPEG, ['-y', '-v', 'error', ...dec(file), '-i', file,
      '-filter_complex',
      `[0:v]format=${fmt},split=3[h][t][m];` +
      `[h]trim=0:${fade},setpts=PTS-STARTPTS[head];` +
      `[t]trim=${midEnd}:${d},setpts=PTS-STARTPTS[tail];` +
      `[m]trim=${fade}:${midEnd},setpts=PTS-STARTPTS[mid];` +
      `[tail][head]blend=all_expr='A*(1-(T/${fade}))+B*(T/${fade})':shortest=1,format=${fmt}[xf];` +
      `[xf][mid]concat=n=2:v=1:a=0,format=${outFmt}[out]`,
      '-map', '[out]',
      ...(isWebm(file)
        ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0']
        : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow']),
      '-crf', '30', '-row-mt', '1', '-cpu-used', '3', '-an', target],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    const after = seam(target);
    tried.push(`${fade}s->${after.toFixed(2)}`);
    if (after <= SEAM_OK && after < before) { landed = { fade, after }; break; }
  }

  if (!landed) { refused.push(`${name}: never closed (tried ${tried.join(', ')}; source ${before.toFixed(2)})`); rmSync(target, { force: true }); continue; }

  const problems = [];
  if (isWebm(file)) {
    const a0 = clearShare(rgba(file, Math.min(1, d / 3)).buf);
    const a1 = clearShare(rgba(target, Math.min(1, d / 3)).buf);
    if (a0 > 0.02 && Math.abs(a0 - a1) > 0.05) problems.push(`alpha ${(a0 * 100).toFixed(0)}% -> ${(a1 * 100).toFixed(0)}%`);
  }
  if (problems.length) { refused.push(`${name}: ${problems.join('; ')}`); rmSync(target, { force: true }); continue; }

  console.log(`   -> seam ${landed.after.toFixed(2)} with a ${landed.fade}s fade, ${(d - duration(target)).toFixed(2)}s shorter`);
  fixed++;
}

console.log(`\n${present.length} looping clips: ${fixed} closed, ${alreadyFine} already fine, ${refused.length} refused`);
for (const r of refused) console.log(`  ${r}`);
if (!dryRun && fixed === 0 && alreadyFine < present.length) {
  console.error('Nothing was closed and something needed it. That is a broken run, not a clean one.');
  process.exit(1);
}
