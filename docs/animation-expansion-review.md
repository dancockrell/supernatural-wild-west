# Animation expansion: current admission and remaining work

Reviewed local build, 7 September 2026. Publication is recorded by the associated Git commit; this document does not imply a remote deployment or CI result.

## Admitted performances

Ten additional idles now cover the five staged characters: two each for the lantern maiden, brazier maiden, skeleton, condemned and mounted rider. The new idle durations range from five to just over seven seconds. Existing repertoire remains available.

The four new or upgraded female idles retain 1440-pixel native RGB height. Queen-fringe, queen-shiver, medium-turn and medium-neck have passed assembled 3840x2160 playback checks in Chrome using the local NVIDIA GPU. These checks are hardware-specific, not a claim about every device. The shiver measured two dropped frames among 46 in its sampled interval; the other three measured zero in their reviewed intervals.

Dedicated Pair (5.042 seconds), Full House (6.042 seconds) and Mine (7.042 seconds) performances use native source RGB and real refined alpha at 1442x1600. The critic reviewed gestures, prop contact, moving edges and native details over contrasting backgrounds. Assembled 4K browser checks verify pixel density and native completion; Pair and Full House also verify continuous playback and dropped-frame proportion.

Admission dimensions, duration, source identifiers and hashes are in animation-expansion-admission.json. The shipping inventory is runtime-assets.json. No signed source URLs belong in this repository.

## Timing and card choreography

Native film completion owns feature timing. The ride fallback cannot overwrite a native performance's completion timer. Ordinary poker presentation updates no longer remove a hand guest; the current guest finishes before the newest queued award starts. Explicit reset, hidden-tab handling, reduced motion and feature takeover can still dismiss presentations deliberately. Stale queued awards are discarded on explicit cancellation.

The skeleton receives one fixed ghost card for each actual player-card arrival. His hand is always A-spades, K-spades, Q-spades, J-spades, 2-hearts. Curved flights, pale trails and a late final off-suit card play independently from his body loop. Duplicated arrivals, cancelled player flights, hidden-tab arrivals and reduced motion preserve the known hand prefix. Deck foley yields to feature audio; an audible mix review is still outstanding.

## Validation

- Build and all 54 unit tests pass.
- Three focused guest/deck lifecycle browser tests pass.
- Four female idle native-GPU 4K checks pass (separate runs).
- Pair, Full House and Mine assembled 4K checks pass.
- Critic media gates distinguish sampled frames from uninterrupted playback; screenshots alone are not motion approval.

## Still unfinished

The remaining seven dedicated hand performances have completed generation at five to eight seconds, but have not been admitted. Most long feature and higher-resolution skeleton sources are also still awaiting extraction and native-stage review. Some older resident and reaction clips remain lower-resolution or shorter than the new target; this build does not claim that every animation has been replaced. The new skeleton loss source requires stronger acting. Church and rider sources require edge-clipping review. Broader theatrical effects and listening-based sound-mix review remain outstanding.

Keep unapproved source experiments out of the shipping inventory. Do not pad short clips by repeated playback or count reused clips as new performances.
