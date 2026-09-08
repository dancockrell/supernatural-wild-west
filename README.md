# Supernatural Wild West

Current playable supernatural Western slot prototype: fixed-aspect parlor, independent animated ghosts, fog and storm sky, five-by-five reels, progressive poker hands and an authoritative TypeScript server. Demo credits only.

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
```

This repository starts with the current version. Previous Git history, discarded art, unused asset revisions, work logs, generation experiments and local session data are excluded. `docs/runtime-assets.json` lists runtime media. Compatibility modules imported by the current engine remain necessary for replay and recovery.

## Development status

Playable prototype, not certified. Both women have their original morning animation coverage restored: five room idles and one win reaction each, four female feature performances, and four female poker-hand performances. These twenty native films and matching posters are unchanged from `e836ec3`; `docs/women-performance-restoration.json` records their hashes. No character uses motion transfer or added body fog, relighting, or displacement. The original films retain their source-baked supernatural details; restoring their performances does not claim new matte cleanup. Current layout, floor shadows, sound cues, and reduced-motion controls remain. Remaining work includes visual refinement and sustained sound/device/accessibility evaluation.
