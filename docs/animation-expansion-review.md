# Animation expansion: current admission and remaining work

Reviewed local build, 7 September 2026. Publication is recorded by the associated Git commit; this document does not imply a remote deployment or CI result.

## Admitted performances

Ten additional idles now cover the five staged characters: two each for the lantern maiden, brazier maiden, skeleton, condemned and mounted rider. The new idle durations range from five to just over seven seconds. Existing repertoire remains available.

The four new or upgraded female idles retain 1440-pixel native RGB height. Queen-fringe, queen-shiver, medium-turn and medium-neck have passed assembled 3840x2160 playback checks in Chrome using the local NVIDIA GPU. These checks are hardware-specific, not a claim about every device. The shiver measured two dropped frames among 46 in its sampled interval; the other three measured zero in their reviewed intervals.

Dedicated Pair (5.042 seconds), Full House (6.042 seconds) and Mine (7.042 seconds) performances use native source RGB and real refined alpha at 1442x1600. The critic reviewed gestures, prop contact, moving edges and native details over contrasting backgrounds. Assembled 4K browser checks verify pixel density and native completion; Pair and Full House also verify continuous playback and dropped-frame proportion.

Parallel source and extraction reviews added dedicated Saloon (7.042 seconds), Jail (7.042 seconds), Two Pair (5.042 seconds), and skeleton receiving (7.042 seconds). Saloon preserves its detached colored smoke during the offering; Jail uses every-frame masks without a stale hat-protection polygon; Two Pair keeps the supporting fingers above its lower fade. The skeleton receive uses native 1920x1440 RGB, with stale arm/hair backing removed. The source vendor's 4K label is not taken as proof of 3840-pixel width: actual source dimensions are checked before export.

Authored feature height now follows the stage up to the admitted 1600-pixel limit, replacing the obsolete 850-pixel cap. The assembled character, prop and control bounds were reviewed again at 3840x2160. A distinct Two Pair bow replaces the previously reused two-character overlay.

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

Five further dedicated hand sources pass the source gate but still need extraction and admission. Royal Flush and Church require reframed sources because their physical hat crowns are cropped. The proposed skeleton loss source is rejected for nearly static acting. Brim, knuckle and notice sources pass acting review but still need higher-resolution extraction. The rider's suspected tail clipping was cleared in native pixels; its action is a prance and settle. Graveyard, fortune, witch and ride event exports remain outstanding. Some older resident and reaction clips remain lower-resolution or shorter than the new target; this build does not claim that every animation has been replaced. Broader theatrical effects and listening-based sound-mix review remain outstanding.

Keep unapproved source experiments out of the shipping inventory. Do not pad short clips by repeated playback or count reused clips as new performances.
