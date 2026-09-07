# Event soundtrack pass

Eighteen separate recorded instrumental cues now cover ten poker hand types, including the no-win High Card, and eight major feature events. They are distinct generated compositions, not a shared cue transposed to different keys. All shipped candidate recordings are stereo 48 kHz / 192 kbps MP3, 8–10 seconds, totaling 4,217,688 bytes. The complete asset ledger, source creation references, exact prompts, trim windows, hashes, and measured levels are in event-score-assets.json. No signed delivery URLs are recorded in the repository.

## Listening status

Technical acceptance is complete; musical listening acceptance is pending. This agent's attempted audio inspection returned “audio content omitted because you do not support audio input.” It would be inaccurate to describe this as an ear-reviewed mix. The generated source cards provide native playback, and a local eighteen-cue audition reel plus order/timestamps is available under work/animation-expansion-v2/event-scores. Playback against the final accepted animations remains the final artistic gate.

## Distinct musical direction

| Hand | Musical direction | Current character/action |
|---|---|---|
| High Card | Dry brushes, bass clarinet, modest descending piano answer | Skeleton waits for luck, a spark fizzles, amused shrug |
| Pair | Acoustic guitar and celesta question/answer | Lantern maiden's answering lights |
| Two Pair | Guzheng, breathy flute, paired woodblock phrase | Brazier maiden's bow |
| Three of a Kind | Baritone-guitar triplet character and wry muted brass | Skeleton's knock and three ghost answers |
| Straight | Patient rising cello line and measured supporting harmony | Outlaw traces a path |
| Flush | Descending fiddle, deep cello, prepared-piano droplets, hopeful celesta | Lantern maiden's flood memory |
| Full House | Upright-piano, fiddle, clarinet chamber waltz | Preacher shelters a spirit with his book |
| Four of a Kind | Muted brass calls and low pulse | Outlaw's four cartridges |
| Straight Flush | Four complete bars of guzheng/harp spiral and flute answer | Brazier maiden's rising spiral |
| Royal Flush | Grand saloon piano, sweeping fiddle, muted brass, knowing pause | Skeleton's rare hat-off bow |

Some initial hand briefs predate the final casting. Their recorded instrumental music was retained where musically applicable; the Flush, Straight Flush, and Royal Flush tracks were recomposed for the new actions. High Card has a deliberately understated resolving phrase followed by a quiet decay, so the no-win shrug does not sound like a payment celebration. There are no spoken character references or literal recorded plot effects in these music stems. Exact original briefs remain in the ledger for honest provenance.

| Feature | Musical direction |
|---|---|
| Graveyard | Contrabass tension, wooden knocks, bowed-saw harmonics |
| Saloon | Detuned stride piano and plucked-string flourish |
| Jail | Steel-string ostinato, muted brass and tuned metallic rhythm |
| Mine | Tender violin, deep bass, prepared-piano droplets |
| Church | Antique organ, bass clarinet, bells and high violin |
| Witching Hour | Circular harp, flute, bowed vibraphone, ritual hand drum |
| Fortune | Hammered dulcimer, pizzicato runs, cheeky clarinet |
| Ghost Ride | Driving string triplets, baritone guitar and frontier horns |

## Delivery corrections

A requested ten-second generation did not guarantee a ten-second file. Sources contained long near-silent reverberant tails, and the first Pair and Straight Flush attempts were too short in musical substance. Several cues were regenerated. The Quads source delivered a longer performance; the ten-second latter phrase including its resolution was selected. These are exact documented editorial trims, not playback cuts guessed from the requested length. Every candidate retains a short final fade to avoid a digital discontinuity. The final Straight Flush revision specifies four full bars at 120 BPM and retains active music through roughly nine seconds rather than substituting a long tail for development.

Total generation spend for this audio pass: 5,400 credits (27 ten-second generation requests at 200 credits each). Rejected/superseded raw sources stay outside the runtime repository.

## Runtime contract

SoundBus.playEventScore(key, durationSeconds, offsetSeconds) starts from the actual film clock and returns a voice-specific stop closure. Call it when native media starts playing; stop on waiting/pause/end/cancellation; call again with currentTime on resumed playing. The complete mastered phrase fits a 7–10 second native film through pitch-preserving playback-rate adjustment. The audio stream also corrects its own buffering restart against the performance clock. No old closure can stop a replacement score.

Event music follows the music fader and reaches the compressor separately from sound effects. The background theme ducks to 18 percent during an active event score, then releases smoothly. Incidental game ducks retain their own lifetime, so an ending event cannot erase a newer win cue's duck. Music failure never changes results or media state. Mute and hidden-tab suspension synchronously cancel all pending, playing, and fading event voices. Resume does not replay a finished or cancelled event.

Added action effects: book-close, brazier, cloth, hoof, table-knock, cartridge, and ghost-chime. Chime detail 0/1/2 gives light inharmonic 659/784/988 Hz answers with actual left/centre/right stereo placement. These effects are meant to be triggered by reviewed native action beats, not guessed wall-clock timers. Existing deck foley is suppressed under a foreground event score.

## Validation

- 18 unique SHA-256 values and distinct runtime paths.
- All decoded durations at least seven seconds and no longer than 10.1 seconds.
- Two-pass -20 LUFS / -2 dBTP mastering; measured encoded loudness within -21 to -19 LUFS and true peak below -1.5 dBTP.
- Eight focused unit checks passed under the project's Vitest 3.2.7: native offset/pitch-preserving timing, replacement ownership, late play promise after mute, independent faders and restoration, hide/resume cancellation, late metadata rejection, audio-buffer resync, and overlapping incidental duck preservation.
- TypeScript check passed.
- Critic's initial read-only transport review found no blocking lifecycle defect and requested the audio-buffer resync, which was implemented and tested. Final read-only recheck found no further transport blocker; musical balance/content still needs listening.
- No browser harness, final sound-to-picture audition, or ear-based mix approval was performed by this agent. No commit or push was made by this agent.
