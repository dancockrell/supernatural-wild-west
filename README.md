# Supernatural Wild West

Current playable supernatural Western slot prototype: fixed-aspect parlor, independent animated ghosts, fog and storm sky, five-by-five reels, progressive poker hands and an authoritative TypeScript server. Demo credits only.

## Play online

[Play the public demo](https://dancockrell.github.io/supernatural-wild-west/?parlor=1). Fictional credits only, saved in this browser. The public demo runs the same rules locally; it does not connect to the server ledger. `npm run build:demo` creates its static page with version-pinned media.

## Run

Requires Node.js 22.12 or later.

```sh
npm ci
npm run build
npm start
```

Open http://localhost:8787/?parlor=1 for the current parlor. For development run `npm run dev` and open http://localhost:5180/?parlor=1.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:rtp
```

`npm run test:rtp` checks return to player. It samples the high-frequency wins
and computes the rare ones, because the Gold Rush pays 10000x at 1 in a million
and a sampled run sees it zero times or twice: five runs of the plain simulator
put the total anywhere between 95.6% and 98.3% while the ways and poker parts
barely moved. Current configuration returns **96.0%** against a 96% target, with
a hit rate of 37.9% and a bonus about 1 in 139.

This repository starts with the current version. Previous Git history, discarded art, unused asset revisions, work logs, generation experiments and local session data are excluded. `docs/runtime-assets.json` lists runtime media. Compatibility modules imported by the current engine remain necessary for replay and recovery.

## Development status

Playable prototype, not certified. Both women have their original morning animation coverage restored: five room idles and one win reaction each, four female feature performances, and four female poker-hand performances. These twenty native films and matching posters are unchanged from `e836ec3`; `docs/women-performance-restoration.json` records their hashes. No character uses motion transfer or added body fog, relighting, or displacement. The original films retain their source-baked supernatural details; restoring their performances does not claim new matte cleanup. Current layout, floor shadows, sound cues, and reduced-motion controls remain. Return to player is tuned and checked at 96.0% (`npm run test:rtp`); it was 94.9% before, which the plain simulator hid inside its jackpot variance. Remaining work includes visual refinement and sustained sound/device/accessibility evaluation.
