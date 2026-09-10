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
barely moved. It gates on **ways + gold: 71.3%**, the part of the game with no
bet-sizing decision, unaffected by anything below.

### The poker hand and the bet swing

The poker hand is dealt one card per spin — four spins of build-up, then a
fifth that completes it — and the payout uses the bet on the COMPLETING spin,
not whatever the hand opened on. A player who watches four cards build up
knows the exact pool the fifth is drawn from (52 minus the fixed opponent
hand minus the four showing), so raising at that moment is pricing real
arithmetic, not exploiting an oversight. The bet is free to move at any time
(10 Sep 2026); the game does not lock it while a hand is in progress.

That is priced into the paytable rather than blocked, the way full-pay video
poker posts a return that assumes exact optimal play:

|                                        | RTP     |
|----------------------------------------|---------|
| Optimal strategy (raise exactly when the visible cards justify it) | **~99.5%** |
| Flat play (bet never adjusts)          | **~77%**  |

The gap is deliberate, not a bug. `src/engine/optimal-strategy.ts` computes
exactly when a raise is worth it, `src/engine/poker-completion.ts` is the
combinatorics underneath it, and `scripts/simulate-optimal.ts` measures the
real engine playing that strategy — the number to trust, since the fast
closed-form version in `scripts/poker-strategy.ts` doesn't model a witching
hour locking the wager mid-hand, and overstates the achievable edge by
several points as a result. Neither script runs on every `npm test`; both
are for tuning and are slow (millions of spins) on purpose, since the poker
share of RTP carries more sampling noise than the ways/gold share.

This repository starts with the current version. Previous Git history, discarded art, unused asset revisions, work logs, generation experiments and local session data are excluded. `docs/runtime-assets.json` lists runtime media. Compatibility modules imported by the current engine remain necessary for replay and recovery.

## Development status

Playable prototype, not certified. Both women have their original morning animation coverage restored: five room idles and one win reaction each, four female feature performances, and four female poker-hand performances. These twenty native films and matching posters are unchanged from `e836ec3`; `docs/women-performance-restoration.json` records their hashes. No character uses motion transfer or added body fog, relighting, or displacement. The original films retain their source-baked supernatural details; restoring their performances does not claim new matte cleanup. Current layout, floor shadows, sound cues, and reduced-motion controls remain. The base game (ways + gold) returns 71.3%, checked by `npm run test:rtp`; that number was 94.9% total before the poker hand's bet was ever priced for its own strategy, which the plain flat-bet simulator hid inside its jackpot variance regardless. Poker is a separate skill-priced feature since 10 Sep 2026: optimal-strategy RTP is tuned to ~99.5%, flat play sees ~77%, and the wager is free to move once a hand is showing — see "The poker hand and the bet swing" above. Remaining work includes visual refinement and sustained sound/device/accessibility evaluation.
