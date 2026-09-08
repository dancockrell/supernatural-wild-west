import { movie } from './movie-loops';
import type { SpinResult } from '../engine/types';
import { ResidentSequence } from './resident-sequence';
import { parlorResidentMedia } from './resident-media';

/** Background residents notice gameplay at their own native segment boundaries. */
export class BoundaryCast {
  private host = document.createElement('aside');
  private residents = new Map<'queen' | 'medium', ResidentSequence>();
  private plume?: HTMLVideoElement;
  private reduced = false;
  constructor(shell: Element, sound: (cue: 'lantern' | 'breath') => void) {
    this.host.className = 'boundary-cast';
    this.host.setAttribute('aria-hidden', 'true');
    // Keep admitted spill removal, then soften only the pale silhouette light.
    this.host.insertAdjacentHTML('beforeend', `<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs><filter id="resident-soft-rim" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="erode" radius=".012 .006" result="interior"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 -5 10 0 -.25" result="rim"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values=".117 .394 .039 0 0 .125 .420 .042 0 0 .122 .410 .041 0 0 0 0 0 .22 0" result="soft"/>
      <feComposite in="soft" in2="rim" operator="in" result="softRim"/>
      <feComposite in="SourceGraphic" in2="rim" operator="out" result="body"/>
      <feComposite in="body" in2="softRim" operator="arithmetic" k2="1" k3="1" result="clean"/>
      <feComposite in="SourceAlpha" in2="interior" operator="out" result="rawEdge"/>
      <feGaussianBlur in="rawEdge" stdDeviation=".0015 .00075" result="featheredEdge"/>
      <feComponentTransfer in="featheredEdge" result="edge"><feFuncA type="linear" slope="4" intercept="0"/></feComponentTransfer>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3 2 3 0 -1" result="coldLight"/>
      <feComposite in="coldLight" in2="edge" operator="in" result="litEdge"/>
      <feComponentTransfer in="clean" result="edgeShade"><feFuncR type="linear" slope=".55"/><feFuncG type="linear" slope=".55"/><feFuncB type="linear" slope=".55"/></feComponentTransfer>
      <feComposite in="edgeShade" in2="litEdge" operator="in" result="softEdge"/>
      <feComposite in="clean" in2="litEdge" operator="out" result="face"/>
      <feComposite in="face" in2="softEdge" operator="arithmetic" k2="1" k3="1" result="balanced"/>
      <feComponentTransfer in="balanced" result="litBody"><feFuncR type="table" tableValues="0 .112 .221 .321 .419 .514 .607 .704 .801 .9 1"/><feFuncG type="table" tableValues="0 .112 .221 .321 .419 .514 .607 .704 .801 .9 1"/><feFuncB type="table" tableValues="0 .112 .221 .321 .419 .514 .607 .704 .801 .9 1"/></feComponentTransfer>
      <feMerge><feMergeNode in="litBody"/></feMerge>
    </filter><filter id="mounted-fog-light" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values=".35"/>
      <feComponentTransfer><feFuncR type="linear" slope=".85"/><feFuncG type="linear" slope=".85"/><feFuncB type="linear" slope=".82"/></feComponentTransfer>
    </filter><filter id="resident-fog-color" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .678 0 0 0 0 .765 0 0 0 0 .737 0 0 0 1 0"/></filter></defs></svg>`);
    const parlor = new URLSearchParams(location.search).has('parlor');
    for (const [key, side, offset] of [['queen','left',.35],['medium','right',2.1]] as const) {
      const slot = document.createElement('div');
      slot.className = `ghost-porch ${side}`;
      const media = parlorResidentMedia(key);
      const idle = movie(key, offset, media.idle);
      const reaction = movie(key, 0, media.reaction);
      const alternateIdles = parlor && key === 'queen'
        ? [movie(key, 0, media.alternate), movie(key, 0, media.characterIdle),
           ...media.quietVariants.map(src => movie(key, 0, src))]
        : [];
      slot.append(idle); this.host.append(slot);
      if (parlor && key === 'medium') {
        const plume = document.createElement('video');
        plume.className = 'brazier-plume';
        plume.src = '/video/parlor-women-authored-v1/brazier-smoke.webm';
        plume.poster = plume.src.replace('.webm', '.png');
        plume.muted = true; plume.loop = true; plume.playsInline = true;
        plume.preload = 'auto';
        slot.append(plume); this.plume = plume;
      }
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
    if (this.plume) {
      if (document.hidden || this.reduced) this.plume.pause();
      else void this.plume.play().catch(() => {});
    }
    for (const resident of this.residents.values())
      resident.setPaused(document.hidden || (!new URLSearchParams(location.search).has('parlor') && matchMedia('(max-width: 900px)').matches));
  };
  setReduced(value: boolean) {
    this.reduced = value;
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
