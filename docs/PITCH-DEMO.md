# Supernatural Wild West — playable pitch demo

A haunted Western parlor combining a slot machine, a developing poker hand, authored character performances and event presentations. The pitch is the atmosphere and characters surrounding a coherent playable game.

[Play the parlor demo](https://dancockrell.github.io/supernatural-wild-west/?parlor=1)

## A three-minute demonstration

1. Open the parlor view on a desktop screen and allow the character films to load. Enable sound and set music/effects for the room.
2. Spin at the initial stake. Show cards joining the poker hand, the skeleton's reactions and the persistent character performances.
3. Open HELP → Review rare animations, or SETTINGS → Feature showcase, to inspect the authored presentations without waiting for a rare result. Previews are separate from the credit ledger.
4. Reload after a settled spin to demonstrate session recovery. SETTINGS offers a public-demo restart/refill between demonstrations; it is unavailable during active presentations and discards the current demo hand and bonus when used.
5. Show reduced motion and separate audio levels. These controls belong to the presentation; they do not change settled outcomes.

## Current presentation authority

README, current source and `women-performance-restoration.json` identify the restored native footage. Earlier replacement, masking and motion-transfer experiments in historical review notes are not instructions to reapply those treatments. Do not substitute still holds or warp the foreground characters. This release preserves all 20 restored women’s films and matching posters byte-for-byte.

The current build uses fictional browser-local credits. The server adapter is a separate path. Browser privacy settings that deny storage allow in-memory play; they cannot promise persistence after the page closes. Corrupt saves recover as fresh demos rather than loading a partial ledger. Public-demo pending requests are isolated from server-session pending requests.

## Delivery

Use Node 22.12 or later. `npm ci`, `npm test` and `npm run build` validate the source and ordinary client build. For the public demo, commit and publish the intended source revision before running `npm run build:demo`. Publish `demo-dist` to the existing GitHub Pages branch. `build.json` identifies the source and media revisions.

The public package deliberately loads art, audio and video from the source repository at the latest commit with the identical media tree. Code-only releases retain the cached media URLs. It requires network access; it is not a self-contained offline package. A licensing recipient needing private hosting or offline exhibition will need the complete runtime media listed in `runtime-assets.json` and adjusted hosting paths.

## Handoff inventory and remaining acceptance

The repository includes client/server source, deterministic math and replay tests, feature previews, runtime media, and asset provenance records. The current audit found all 202 runtime inventory files present, all 40 restored women’s media files matching preservation hashes, and all 18 event scores matching their manifests. These are integrity checks, not a rights grant.

For a licensing discussion, consolidate the existing source IDs, creation records and third-party notices into a recipient-facing rights packet. Agree which source, runtime assets and editable masters are included, along with exclusivity, support and permitted uses. No general source/art license is granted by this document.

The score manifest still records human listening approval as pending. Automated playback and audio-routing checks do not replace a final sound-to-picture audition. Native Safari/iOS and lower-powered device testing remain acceptance work; do not infer 4K playback quality from a successful desktop build. No new art generation or animation credits are needed for this reliability release.

## Verification

Unit tests cover the rules, idempotency, replay, saved-ledger validation and storage fallback. Focused browser checks cover storage denial, malformed pending state and presentation recovery. `scripts/review-public-demo.mjs` checks the packaged public path, native video loading and a settled spin in an isolated browser. Preserve the existing deterministic math and native-performance checks when making future presentation changes.
