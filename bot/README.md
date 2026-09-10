# playbot

A bot that plays Supernatural Wild West in a real browser, measures what it
sees, and files complaints and praise. It exists because it can sweep the game
far faster than a person can, and because a measurement beats an impression.

```bash
PY="$LOCALAPPDATA/Programs/Python/Python313/python.exe"

"$PY" bot/run.py --selftest      # prove the instruments can fail
"$PY" bot/run.py                 # play and evaluate
"$PY" bot/run.py --only seams    # focus one check
"$PY" bot/run.py --headed        # watch it play
```

The dev server must be up (`npm run dev`, port 5180).

## The interface

Two files, and that is the whole protocol:

- **`directives.json`** — Claude writes this. Viewports, which checks run,
  thresholds, how many spins to warm up with.
- **`out/complaints.jsonl`** — the bot writes this. One JSON finding per line,
  each with `evidence` (the numbers), `repro` (how to see it again) and often a
  `shot` (a PNG of the moment).

## Run the self-test first, always

`--selftest` breaks the game on purpose — shoves the spin button off screen,
lifts the contact shadows off the boots, hard-clips the fog — and requires the
matching check to report something new. A check that stays quiet during its own
sabotage is decoration, and the run says `BLIND`.

This matters more than it sounds. The first version of the seam check passed a
silent run while being unable to see the very bug it was written for, four
different ways in a row:

1. its crop included the poker cards, so it measured a card edge and called it
   a seam in the artwork;
2. it only sampled floor to the left of the controls, and the seam was at 38%;
3. it treated screen-reader-hidden elements as if they painted, which blocked
   the only clean patch left;
4. it reported just the strongest edge, so a new seam displaced an old one and
   the complaint count never moved.

Every one of those looked like a clean bill of health.

## What it checks

| check | what it will not let pass |
| --- | --- |
| `spin_responds` | pressing spin does nothing, or never re-enables |
| `ledger` | balance not moving by exactly win minus stake |
| `offscreen` | any control running past the window edge |
| `overlap` | controls drawn on top of each other |
| `panels` | a panel that will not open, fit, or close on Escape |
| `grounding` | a contact shadow not under the feet, read from the clip's alpha |
| `seams` | hard straight edges in clean floor, attributed by hiding layers |
| `sprite_motion` | unpainted frames during a clip handoff |
| `reduced_motion` | the room still moving when the preference is set |
| `letterbox` | the stage wasting most of the window |
| `assets` | a mounted img or video that never loaded, or a src the server does not have |
| `resilience` | a server fault leaving the game bricked, or failing with nothing said |
| `backgrounding` | a clip that never resumes after the tab comes back |
| `health` | console errors, failed requests |

## Rules the checks follow

**File a measurement, not an impression.** Every complaint carries the numbers
that justify it.

**Prove the cause before naming it.** `seams` finds an edge, then hides each
candidate layer and re-measures. Whatever makes the edge vanish owns it. This
is the only method that survived a long hand investigation where three separate
scans blamed the wrong element.

**Say where you did not look.** When the interface covers the floor there is no
clean patch to read, and the check reports "could not measure" rather than
"clean". Silence and absence must not look the same. Every check must be able
to say three things — pass, fail, and *I could not determine this* — so
`undetermined()` files a `note`, the selftest refuses to let a note count as
catching anything, and a check that files one never also files praise.

**Count the fragile thing, and print the count.** `assets` records how many
mounted media elements it examined and how many URLs it verified, and refuses
to praise the game if the census came in under a floor: an empty census and a
healthy game produce exactly the same silence. `resilience` counts how many
times the injected fault actually fired; if the route never ran, the check
says so rather than crediting the game with surviving a fault it never met.
`backgrounding` counts only the clips that were *playing before* the tab was
hidden, so the one sprite that is legitimately parked cannot pad the
denominator, and it proves the hide reached the app before judging the restore.

**A sabotage has to reach the branch it was aimed at.** Cases now carry
`expect_title`, and the new complaint has to name the thing that was broken. A
sabotage that goes red for some unrelated reason reports `WRONG-DEFECT`, not
`OK` — which caught a real mistake immediately: the backgrounding case pinned
"the shown room plate" and asserted the *day* file, and after an earlier case
had pushed the game into night the check was right and the assertion was wrong.

## Two traps these checks had to be built around

**A missing media file answers 200.** Vite's dev server falls back to the SPA
index for anything it cannot find, so `GET /video/does-not-exist.webm` returns
`200 Content-Type: text/html`. A status-only existence check would have called
every missing clip in the game healthy. `assets` reads the content type, and
treats a clip served as `text/html` as a file that is not there.

**`requestfailed` never fires for a 404.** A refused asset is a perfectly
successful HTTP conversation, so the session now records responses with a
status of 400 or worse separately. Faults the bot injects itself are recorded
apart from the game's own failures, so `health` does not report the bot's
sabotage as a defect.

**CDP cannot hide a tab here.** `Emulation.setPageVisibilityOverride` answers
"wasn't found" on this Chromium, so `backgrounding` overrides
`document.hidden`/`visibilityState` and dispatches the event. The mechanism it
actually used is reported in the finding rather than assumed, and playback is
proved by `currentTime` advancing between two samples — a video can be
unpaused and still frozen, which is exactly what its sabotage produces.
