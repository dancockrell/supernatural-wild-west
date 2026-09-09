#!/usr/bin/env node
/**
 * Re-encode the game's video at a sane bitrate and resolution.
 *
 * Why this exists: the source clips are encoded between 53 and 102 Mbps, at up
 * to 2560x1600, for a game whose viewport is 1600x900 and whose character
 * sprites display at about 324x576. Netflix streams 4K at roughly 15 Mbps. The
 * result is that opening the parlor downloads about 800 MB, which is what makes
 * loops stutter and starves the main thread that audio ducking runs on.
 *
 * What it does NOT do: touch the artwork. Every clip keeps its alpha channel,
 * its duration and its frame rate. Only the pixel dimensions and the bitrate
 * change, and both are checked per file below.
 *
 * Usage:
 *   node scripts/reencode-video.mjs --dry-run        # report, write nothing
 *   node scripts/reencode-video.mjs                  # encode into public/video-optimised
 *   node scripts/reencode-video.mjs --apply          # replace originals in place
 *
 * The default writes to a sibling directory so the originals survive until a
 * human has looked at the result. `--apply` is the deliberate second step.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

/** Nothing on screen is taller than the 900px viewport; 1080 leaves retina headroom. */
const MAX_HEIGHT = 1080;
/** Constant quality. 32 was compared frame for frame against the source and holds. */
const CRF = 32;
/** Below this there is nothing to win and re-encoding only loses generations. */
const SKIP_UNDER_BYTES = 2 * 1024 * 1024;

const SRC = 'public/video';
const OUT = 'public/video-optimised';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const apply = args.has('--apply');

function probe(file) {
  const raw = execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate',
    '-show_entries', 'format=duration,size',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { encoding: 'utf8' }).trim().split('\n').map(s => s.trim());
  const [width, height, rate, duration, size] = raw;
  return {
    width: Number(width), height: Number(height), rate,
    duration: Number(duration), size: Number(size),
  };
}

/** Share of fully transparent pixels in one frame, as a proxy for "alpha survived". */
function alphaShare(file, at) {
  const out = execFileSync(FFMPEG, [
    '-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(at), '-i', file,
    '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-',
  ], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  let clear = 0;
  for (let i = 3; i < out.length; i += 4) if (out[i] < 16) clear++;
  return clear / (out.length / 4);
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else if (/\.(webm|mp4)$/i.test(entry.name)) found.push(path);
  }
  return found;
}

const files = walk(SRC).sort();
if (files.length === 0) throw new Error(`${SRC} holds no video; refusing to report a clean run over nothing.`);

let before = 0, after = 0, encoded = 0, skipped = 0;
const failures = [];

console.log(`${files.length} clips found in ${SRC}\n`);

for (const file of files) {
  const info = probe(file);
  before += info.size;
  const target = join(OUT, relative(SRC, file));
  const webm = /\.webm$/i.test(file);

  if (info.size < SKIP_UNDER_BYTES) {
    skipped++; after += info.size;
    if (!dryRun) { mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target); }
    continue;
  }

  const height = Math.min(info.height, MAX_HEIGHT);
  const mbps = (info.size * 8) / info.duration / 1e6;
  console.log(`${relative(SRC, file)}  ${info.width}x${info.height} ${mbps.toFixed(0)} Mbps ${(info.size / 1048576).toFixed(1)} MB`);

  if (dryRun) { after += info.size; continue; }

  mkdirSync(dirname(target), { recursive: true });
  const scale = height === info.height ? [] : ['-vf', `scale=-2:${height}`];
  execFileSync(FFMPEG, [
    '-y', '-v', 'error',
    ...(webm ? ['-c:v', 'libvpx-vp9'] : []),
    '-i', file, ...scale,
    ...(webm
      ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0']
      : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow']),
    '-crf', String(CRF), ...(webm ? ['-b:v', '0'] : []),
    '-row-mt', '1', '-cpu-used', '3', '-an', target,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Per-file checks. A clip that fails any of these is reported, not shipped.
  const got = probe(target);
  const problems = [];
  if (Math.abs(got.duration - info.duration) > 0.15) problems.push(`duration ${info.duration}s -> ${got.duration}s`);
  if (got.rate !== info.rate) problems.push(`frame rate ${info.rate} -> ${got.rate}`);
  if (got.size >= info.size) problems.push(`no saving (${(got.size / 1048576).toFixed(1)} MB)`);
  if (webm) {
    const at = Math.min(1, info.duration / 3);
    const a0 = alphaShare(file, at), a1 = alphaShare(target, at);
    // Only meaningful when the source actually has transparency to lose.
    if (a0 > 0.02 && Math.abs(a0 - a1) > 0.05) problems.push(`alpha ${(a0 * 100).toFixed(0)}% -> ${(a1 * 100).toFixed(0)}%`);
  }
  if (problems.length) { failures.push({ file: relative(SRC, file), problems }); rmSync(target, { force: true }); after += info.size; continue; }

  after += got.size; encoded++;
  console.log(`   -> ${got.width}x${got.height}  ${(got.size / 1048576).toFixed(1)} MB  ${(info.size / got.size).toFixed(1)}x smaller`);
}

console.log(`\n${files.length} clips: ${encoded} re-encoded, ${skipped} already small, ${failures.length} refused`);
console.log(`${(before / 1073741824).toFixed(2)} GB -> ${(after / 1073741824).toFixed(2)} GB  (${(100 * (before - after) / before).toFixed(0)}% saved)`);
if (failures.length) {
  console.log('\nRefused, originals left in place:');
  for (const f of failures) console.log(`  ${f.file}: ${f.problems.join('; ')}`);
}
if (encoded === 0 && !dryRun) { console.error('\nNothing was re-encoded. That is a broken run, not a clean one.'); process.exit(1); }

if (apply && !dryRun && failures.length === 0) {
  for (const file of files) {
    const target = join(OUT, relative(SRC, file));
    if (existsSync(target)) copyFileSync(target, file);
  }
  rmSync(OUT, { recursive: true, force: true });
  console.log('\nApplied in place; originals replaced.');
} else if (apply && failures.length) {
  console.error('\nRefusing --apply while any clip failed its checks.');
  process.exit(1);
}
