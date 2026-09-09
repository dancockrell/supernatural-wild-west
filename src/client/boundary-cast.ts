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
    </filter><filter id="resident-fog-color" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .678 0 0 0 0 .765 0 0 0 0 .737 0 0 0 1 0"/></filter><filter id="ghost-wisp-fade" color-interpolation-filters="sRGB">
      <!-- Fades the spectral ribbons without thinning the women themselves.
           It works because of where the two live in the alpha channel: her
           body is solid (alpha above 230, about 88k pixels of this frame) and
           the wisps are the partially transparent fringe (41k pixels). Bending
           the alpha curve down in the middle takes the effect and leaves her.
           The last table value stays 1 so nothing opaque is touched. -->
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.12 0.30 0.58 0.85 1"/></feComponentTransfer>
    </filter></defs></svg>`);
    const parlor = new URLSearchParams(location.search).has('parlor');
    for (const [key, side, offset] of [['queen','left',.35],['medium','right',2.1]] as const) {
      const slot = document.createElement('div');
      slot.className = `ghost-porch ${side}`;
      const media = parlorResidentMedia(key);
      const idle = movie(key, offset, media.idle);
      const reaction = movie(key, 0, media.reaction);
      const alternateIdles = parlor
        ? [movie(key, 0, media.alternate), movie(key, 0, media.characterIdle),
           ...media.quietVariants.map(src => movie(key, 0, src))]
        : [];
      // Contact shadow. The gambler has had one since narrative-gambler.ts,
      // and without it these two read as pasted onto the floor rather than
      // standing on it. Placed against the boots in the running scene, not
      // against the frame: the clips carry a spectral trail below the feet,
      // so the lowest opaque pixel is well under where the figure touches.
      const contact = document.createElement('div');
      contact.className = 'resident-contact-shadow';
      contact.setAttribute('aria-hidden', 'true');
      slot.append(contact);
      slot.append(idle);

      // The practical each one carries, throwing light. Both women hold a lit
      // thing - a lantern, a burning bowl - and neither was lit by it: the
      // footage has them lit flat from the front, so a bright source sat in
      // frame emitting nothing and they read as pasted over the room.
      //
      // Deliberately not clipped to her silhouette. A lantern lights the wall
      // and the balustrade behind it too, and letting the pool fall on the
      // room is both cheaper and more correct than masking it to her edge.
      //
      // This lives here rather than being baked into the clips because the
      // alpha round trip through ffmpeg destroys the cutout - measured, the
      // transparent share fell from 72% to 48% and the magenta test field
      // showed straight through her. Compositing in the browser is free,
      // lossless, and leaves the strength a number somebody can tune.
      const glow = document.createElement('div');
      glow.className = `resident-practical-light ${key}`;
      glow.setAttribute('aria-hidden', 'true');
      slot.append(glow);

      this.host.append(slot);
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
