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
"clean". Silence and absence must not look the same.
