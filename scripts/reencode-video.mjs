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
 * Where most of the bitrate actually goes, measured 10 Sep 2026 and the reason
 * `--matte` exists: these clips carry alpha, and the colour plane *underneath
 * the transparent pixels is random saturated noise*. Decode
 * hand-performances-v3/straight-flush.webm without the alpha-aware decoder and
 * two thirds of the frame is coloured static. It never reaches the screen - the
 * alpha there is 0 to 23 out of 255 - but the encoder cannot know that and
 * spends most of 88 Mbps describing it. One frame's alpha histogram: 61.5% at
 * exactly 0, another 12.7% between 1 and 31, and it is different static every
 * frame, so inter-frame prediction cannot help either. Dropping resolution, as
 * the first pass did, only makes a smaller picture of the same static.
 *
 * `--matte` therefore despeckles the alpha (median 3), floors anything under 24
 * to zero, and paints the colour plane black wherever the result is invisible.
 * On that clip: 95.2 MB -> 19.2 MB at unchanged 1442x1600, with the composited
 * result measuring SSIM mean 0.994 / worst frame 0.991 over 218 frames against
 * the original. Which is the second reason it exists - `--keep-size` plus
 * `--matte` wins 80% *without touching the pixel dimensions*, and it was the
 * dimension change alone that broke native-resolution assertions at 4K and
 * forced 7f2b52e to revert this script off the four biggest categories.
 *
 * Every matte run is gated on that SSIM: the clip is composited over grey the
 * way the game composites it, compared frame by frame, and refused if the mean
 * or any single frame falls below --min-ssim. The frame count is asserted too,
 * so a comparison that comes back empty is a failure and not a pass.
 *
 * Usage:
 *   node scripts/reencode-video.mjs --dry-run        # report, write nothing
 *   node scripts/reencode-video.mjs                  # encode into public/video-optimised
 *   node scripts/reencode-video.mjs --apply          # replace originals in place
 *   node scripts/reencode-video.mjs --matte --keep-size --only=hand-performances-v3
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
/** Below this there is nothing to win and re-encoding only loses generations. */
const SKIP_UNDER_BYTES = 2 * 1024 * 1024;

const SRC = 'public/video';
const OUT = 'public/video-optimised';

const argv = process.argv.slice(2);
const args = new Set(argv);
const dryRun = args.has('--dry-run');
const apply = args.has('--apply');
/** Clean the invisible colour noise out of the matte. See the header. */
const matte = args.has('--matte');
/** Leave pixel dimensions alone. Some clips have their native size asserted. */
const keepSize = args.has('--keep-size');
const flag = (name, fallback) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
/** Substring filter on the path, so one category can be done at a time. */
const only = flag('only', '');
/** Refuse any matte clip whose composited appearance moves more than this. */
const MIN_SSIM = Number(flag('min-ssim', '0.985'));
/** Alpha at or under this never reaches the screen; below it lives the noise. */
const ALPHA_FLOOR = 24;
/**
 * Constant quality. 32 was compared frame for frame against the source and
 * holds for a first-generation encode of native footage.
 *
 * It does not hold for a clip that has already been through this script once:
 * parlor-maidens-v1/queen-idle, re-encoded a second time at 32, measured
 * composited SSIM worst-frame 0.9825 and the run refused it. Second generation
 * needs a lower number, hence --crf. Cleaning the matte is still worth doing on
 * those clips, because the invisible noise survived the first pass untouched.
 */
const CRF = Number(flag('crf', '32'));

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

/** True when the clip really carries transparency, not merely a yuva pix_fmt. */
function hasAlpha(file) {
  const fmt = execFileSync(FFPROBE, [
    '-v', 'error', '-c:v', 'libvpx-vp9', '-select_streams', 'v:0',
    '-show_entries', 'stream=pix_fmt', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' }).trim();
  return /^yuva/.test(fmt);
}

/**
 * Despeckle the matte and black out everything it makes invisible.
 *
 * Written as a filtergraph rather than per-pixel work so it stays inside
 * ffmpeg: alphaextract pulls the matte out, median 3 removes isolated
 * speckle, the geq floors anything under ALPHA_FLOOR to zero, and a
 * maskedmerge paints the colour plane black exactly where that floor bit.
 * Partially visible pixels - the smoke, the aura, every soft edge - keep
 * both their alpha and their colour untouched, which is why the composited
 * SSIM stays above 0.99 while four fifths of the bytes go away.
 */
function matteGraph({ width, height, rate, duration }) {
  const black = `color=black:s=${width}x${height}:r=${rate}:d=${(duration + 0.2).toFixed(3)},format=yuv420p`;
  return [
    '[0:v]format=yuva420p,split=2[c][a]',
    `[a]alphaextract,median=3,geq=lum='if(lt(p(X,Y),${ALPHA_FLOOR}),0,p(X,Y))',split=2[al][k]`,
    `[k]geq=lum='if(gt(p(X,Y),0),255,0)'[mask]`,
    `${black}[bg]`,
    '[c]format=yuv420p[cy]',
    '[bg][cy][mask]maskedmerge[clean]',
    // The black backing is a generated source with no end of its own, and
    // maskedmerge/alphamerge run to their longest input, so without this trim
    // the clip comes out longer than the artwork and every loop drifts.
    `[clean][al]alphamerge,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[out]`,
  ].join(';');
}

/**
 * Compare two alpha clips the way the game shows them: composited, not raw.
 *
 * Comparing the raw planes would score the invisible noise this script exists
 * to delete, and score it as a loss. So both are laid over the same flat grey
 * and the visible result is what gets measured. Returns every frame's score,
 * because a mean can hide one ruined frame in two hundred good ones - and the
 * caller asserts the count, so an empty comparison cannot read as a pass.
 */
function compositeSsim(original, candidate, info) {
  const bg = `color=gray:s=${info.width}x${info.height}:r=${info.rate}:d=${info.duration.toFixed(3)},format=yuv420p,split=2[b1][b2]`;
  const graph = [
    bg,
    '[0:v]format=yuva420p[a]',
    `[1:v]scale=${info.width}:${info.height},format=yuva420p[c]`,
    '[b1][a]overlay=shortest=1,format=yuv420p[A]',
    '[b2][c]overlay=shortest=1,format=yuv420p[C]',
    '[A][C]ssim=stats_file=-',
  ].join(';');
  const out = execFileSync(FFMPEG, [
    '-v', 'error',
    '-c:v', 'libvpx-vp9', '-i', original,
    '-c:v', 'libvpx-vp9', '-i', candidate,
    '-filter_complex', graph, '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const scores = [];
  for (const line of out.split('\n')) {
    const hit = /All:([0-9.]+)/.exec(line);
    if (hit) scores.push(Number(hit[1]));
  }
  return scores;
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

const allFiles = walk(SRC).sort();
if (allFiles.length === 0) throw new Error(`${SRC} holds no video; refusing to report a clean run over nothing.`);
const files = only ? allFiles.filter(f => f.replaceAll('\\', '/').includes(only)) : allFiles;
// A filter that empties its input is an error naming the reason, never a quiet
// run over nothing that ends up printing "0 refused" and reads like success.
if (files.length === 0) throw new Error(`--only=${only} matched none of the ${allFiles.length} clips in ${SRC}.`);

let before = 0, after = 0, encoded = 0, skipped = 0;
const failures = [];
const ssimReport = [];

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

  const height = keepSize ? info.height : Math.min(info.height, MAX_HEIGHT);
  const cleaning = matte && webm && hasAlpha(file);
  const mbps = (info.size * 8) / info.duration / 1e6;
  console.log(`${relative(SRC, file)}  ${info.width}x${info.height} ${mbps.toFixed(0)} Mbps ${(info.size / 1048576).toFixed(1)} MB`);

  if (dryRun) { after += info.size; continue; }

  mkdirSync(dirname(target), { recursive: true });
  const scaling = height === info.height ? '' : `scale=-2:${height}`;
  // The matte graph names its own output pad, so scaling has to join it rather
  // than sit in a separate -vf that would silently be ignored beside it.
  const shaping = cleaning
    ? ['-filter_complex', scaling ? `${matteGraph(info)};[out]${scaling}[final]` : matteGraph(info),
       '-map', cleaning && scaling ? '[final]' : '[out]']
    : scaling ? ['-vf', scaling] : [];
  execFileSync(FFMPEG, [
    '-y', '-v', 'error',
    ...(webm ? ['-c:v', 'libvpx-vp9'] : []),
    '-i', file, ...shaping,
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
    // Matte cleaning is *supposed* to raise the transparent share - flooring
    // the noise to zero is the whole point - so in that mode only a loss of
    // transparency is a defect. The appearance is defended by the SSIM below,
    // which is a far better instrument than one frame's alpha count.
    if (a0 > 0.02 && (cleaning ? a0 - a1 > 0.05 : Math.abs(a0 - a1) > 0.05))
      problems.push(`alpha ${(a0 * 100).toFixed(0)}% -> ${(a1 * 100).toFixed(0)}%`);
  }
  if (cleaning && problems.length === 0) {
    const scores = compositeSsim(file, target, info);
    // Count the fragile thing: no frames compared means the comparison broke,
    // and a broken comparison must never be the reason a clip ships.
    const wanted = Math.floor(info.duration * 0.5);
    if (scores.length < wanted) problems.push(`only ${scores.length} frames compared, expected at least ${wanted}`);
    else {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const worst = Math.min(...scores);
      if (mean < MIN_SSIM || worst < MIN_SSIM)
        problems.push(`composited SSIM mean ${mean.toFixed(4)} worst ${worst.toFixed(4)} over ${scores.length} frames, floor ${MIN_SSIM}`);
      else ssimReport.push(`${relative(SRC, file)} SSIM mean ${mean.toFixed(4)} worst ${worst.toFixed(4)} (${scores.length} frames)`);
    }
  }
  if (problems.length) { failures.push({ file: relative(SRC, file), problems }); rmSync(target, { force: true }); after += info.size; continue; }

  after += got.size; encoded++;
  console.log(`   -> ${got.width}x${got.height}  ${(got.size / 1048576).toFixed(1)} MB  ${(info.size / got.size).toFixed(1)}x smaller`);
}

console.log(`\n${files.length} clips: ${encoded} re-encoded, ${skipped} already small, ${failures.length} refused`);
console.log(`${(before / 1073741824).toFixed(2)} GB -> ${(after / 1073741824).toFixed(2)} GB  (${(100 * (before - after) / before).toFixed(0)}% saved)`);
if (ssimReport.length) {
  console.log(`\nMatte cleaning verified against the original, composited (floor ${MIN_SSIM}):`);
  for (const line of ssimReport) console.log(`  ${line}`);
} else if (matte && !dryRun) {
  console.log('\nNo clip was matte-cleaned. Either none carried alpha, or --matte did nothing.');
}
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
