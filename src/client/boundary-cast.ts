import { movie } from './movie-loops';
import type { SpinResult } from '../engine/types';
import { ResidentSequence } from './resident-sequence';
import { parlorResidentMedia } from './resident-media';

/** Background residents notice gameplay at their own native segment boundaries. */
export class BoundaryCast {
  private host = document.createElement('aside');
  private residents = new Map<'queen' | 'medium', ResidentSequence>();
  constructor(shell: Element, sound: (cue: 'lantern' | 'breath') => void) {
    this.host.className = 'boundary-cast';
    this.host.setAttribute('aria-hidden', 'true');
    const parlor = new URLSearchParams(location.search).has('parlor');
    for (const [key, side, offset] of [['queen','left',.35],['medium','right',2.1]] as const) {
      const slot = document.createElement('div');
      slot.className = `ghost-porch ${side}`;
      const media = parlorResidentMedia(key);
      const idle = movie(key, offset, media.idle);
      const reaction = movie(key, 0, media.reaction);
      const alternateIdles = parlor
        ? [movie(key, 0, media.alternate), movie(key, 0, media.characterIdle)]
        : [];
      slot.append(idle); this.host.append(slot);
      this.residents.set(key, new ResidentSequence(slot, idle, reaction,
        () => document.getElementById('spectacle')?.hidden !== false,
        () => sound(key === 'queen' ? 'lantern' : 'breath'), alternateIdles));
    }
    shell.before(this.host);
    document.addEventListener('visibilitychange', this.sync);
    window.addEventListener('resize', this.sync);
    this.sync();
  }
  private sync = () => {
    for (const resident of this.residents.values())
      resident.setPaused(document.hidden || (!new URLSearchParams(location.search).has('parlor') && matchMedia('(max-width: 900px)').matches));
  };
  setReduced(value: boolean) {
    for (const resident of this.residents.values()) resident.setReduced(value);
    this.sync();
  }
  spin() { for (const resident of this.residents.values()) resident.advanceTurn(); }
  reset() { for (const resident of this.residents.values()) resident.reset(); }
  react(result: SpinResult, reduced: boolean) {
    this.setReduced(reduced);
    if (reduced) return;
    const netWin = result.payout > result.bet;
    const excellent=netWin && result.payout >= result.bet * 10;
    if (excellent)
      this.residents.get('queen')!.enqueue(1);
    if (excellent || (netWin && result.poker?.complete && result.poker.amount >= result.bet * 5))
      this.residents.get('medium')!.enqueue(2);
  }
}



