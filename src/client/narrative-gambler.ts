/** A quiet independent ritual, never an opponent or a gate on the spin lifecycle. */
export class NarrativeGambler {
  private host = document.createElement('aside');
  // Two idle buffers keep the last frame visible while the other rewinds.
  private clips = ['idle','receive','idle','notice','loss','brim','knuckle'].map(name => {
    const v = document.createElement('video');
    const family = 'parlor-gambler-hair-v1';
    v.src = name === 'brim' || name === 'knuckle'
      ? `/video/parlor-idles-v2/gambler-${name}.webm`
      : `/video/${family}/${name}.webm`;
    v.poster = v.src.replace('.webm', '.png');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    return v;
  });
  private active = 0;
  private cycles = 0;
  private pendingNotice = false;
  private pendingHand: {complete:boolean; paid:boolean} | undefined;
  private lastNoticeCycle = -2;
  private reduced = false;
  private disposed = false;
  private transition = 0;
  private awaitingFrame = false;
  private events = new AbortController();
  private cards: SVGSVGElement;
  private hadHand = false;
  private cardFrame?: number;
  constructor() {
    this.host.className = 'narrative-gambler'; this.host.setAttribute('aria-hidden','true');
    const contact = document.createElementNS('http://www.w3.org/2000/svg','svg');
    contact.setAttribute('viewBox','0 0 960 720');
    contact.classList.add('gambler-contact-shadow');
    // Foot positions come from the same authored silhouette used in video extraction.
    // This lies behind the table, above the floor/dress, with no actor-wide dark halo.
    contact.innerHTML = `<defs><filter id="gambler-contact-soften" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="5"/></filter></defs>
      <g fill="#08090c" filter="url(#gambler-contact-soften)">
        <path d="M210 576 L537 672 L786 606 L802 622 L555 707 L199 593 Z" opacity=".16"/>
        <ellipse cx="221" cy="589" rx="39" ry="10" transform="rotate(17 221 589)" opacity=".48"/>
        <ellipse cx="552" cy="692" rx="47" ry="11" transform="rotate(-8 552 692)" opacity=".48"/>
        <ellipse cx="787" cy="616" rx="25" ry="8" transform="rotate(-18 787 616)" opacity=".4"/>
      </g>`;
    this.cards = document.createElementNS('http://www.w3.org/2000/svg','svg');
    this.cards.setAttribute('viewBox','0 0 960 720');
    // Standard card proportions projected together onto the authored felt plane.
    // Rank and suit occupy separate areas; no stretched two-glyph label can spill over.
    this.cards.innerHTML = `<g transform="matrix(1 .107 -.16 .40 288 331.2)">${['A','K','Q','J','2'].map((rank,i) => {
      const suit = i === 4 ? '♥' : '♠';
      const ink = i === 4 ? '#dc969a' : '#c7def0';
      return `<g class="ritual-card" transform="translate(${i*66} 0)">
        <rect width="56" height="80" rx="4" fill="#ece5d4" fill-opacity=".13" stroke="#c7def0" stroke-opacity=".75" stroke-width="1.2"/>
        <rect x="3" y="3" width="50" height="74" rx="3" fill="none" stroke="#ece5d4" stroke-opacity=".28" stroke-width=".6"/>
        <text x="8" y="21" font-size="18" font-family="Georgia" fill="${ink}">${rank}</text>
        <text x="28" y="57" text-anchor="middle" font-size="31" font-family="Georgia" fill="${ink}" fill-opacity=".85">${suit}</text>
        <text transform="translate(48 59) rotate(180)" font-size="12" font-family="Georgia" fill="${ink}">${rank}</text>
      </g>`;
    }).join('')}</g>`;
    this.cards.classList.add('ghost-ritual-cards');
    this.clips.forEach((clip, index) => clip.hidden = index !== 0);
    this.host.append(contact, ...this.clips, this.cards); document.body.append(this.host);
    const idleOrder = [0,5,2,6];
    for(const index of idleOrder) this.clips[index].addEventListener('ended', () => {
      if(this.disposed || this.reduced || document.hidden || this.active !== index) return;
      this.cycles++;
      if(this.pendingHand && this.clips[this.pendingHand.complete ? (this.pendingHand.paid ? 3 : 4) : 1].readyState >= 2) {
        const hand=this.pendingHand;
        this.pendingHand=undefined;
        this.hadHand = this.cards.classList.contains('visible');
        this.switchTo(hand.complete ? (hand.paid ? 3 : 4) : 1);
      } else if(this.pendingNotice && this.cycles - this.lastNoticeCycle >= 2 && this.clips[3].readyState >= 2) {
        this.pendingNotice = false;
        this.lastNoticeCycle = this.cycles;
        this.switchTo(3);
      } else {
        const next = idleOrder[(idleOrder.indexOf(index) + 1) % idleOrder.length];
        this.switchTo(this.clips[next].readyState >= 2 ? next : index === 0 ? 2 : 0);
      }
    }, {signal:this.events.signal});
    if (typeof this.clips[1].requestVideoFrameCallback === 'function') {
      const frame: VideoFrameRequestCallback = (_now, metadata) => {
        if(this.disposed) return;
        this.drawHand(metadata.mediaTime);
        this.cardFrame=this.clips[1].requestVideoFrameCallback(frame);
      };
      this.cardFrame=this.clips[1].requestVideoFrameCallback(frame);
    } else this.clips[1].addEventListener('timeupdate', () => this.drawHand(this.clips[1].currentTime), {signal:this.events.signal});
    for(const index of [1,3,4]) this.clips[index].addEventListener('ended', () => {
      if(!this.disposed && !this.reduced && !document.hidden && this.active === index) {
        this.switchTo(index===1 && this.clips[4].readyState>=2 ? 4 : 0);
      }
    }, {signal:this.events.signal});
    document.addEventListener('visibilitychange',this.sync,{signal:this.events.signal});
    window.addEventListener('resize',this.sync,{signal:this.events.signal}); this.sync();
  }
  /** Coalesce nearby rounds; never interrupt a native performance or accumulate a backlog. */
  noticeRound() { if(!this.disposed && !this.reduced && !document.hidden) this.pendingNotice = true; }
  /** A resolution takes precedence over unplayed card arrivals; native clips are never interrupted. */
  noticeHand(complete:boolean, paid:boolean) {
    if(this.disposed || this.reduced || document.hidden) return;
    if(!complete && this.pendingHand?.complete) return;
    this.pendingHand={complete,paid};
  }
  /** Both appearance and clearing follow decoded performance time, including stalls. */
  private drawHand(time:number) {
    if(this.disposed || this.reduced || document.hidden || this.active!==1) return;
    const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
    const clearing=this.hadHand && time<.6;
    this.cards.classList.toggle('visible',clearing || time>=3.25);
    this.cards.style.opacity=String(clearing ? .8*(1-smooth(time/.6)) : time>=3.25 ? .8 : 0);
    this.cards.querySelectorAll<SVGGElement>('.ritual-card').forEach((card,i)=>{
      const coverage=clearing ? 1 : smooth((time-3.25-i*.2)/.45);
      card.style.opacity=String(coverage);
      card.classList.toggle('received',coverage>0);
    });
  }
  private switchTo(index:number) {
    if(this.disposed) return;
    const serial = ++this.transition;
    this.awaitingFrame = true;
    const outgoing = this.clips[this.active], incoming = this.clips[index];
    outgoing.pause();
    const present = () => {
      if(this.disposed || serial !== this.transition) { cleanup(); return; }
      if(incoming.seeking || incoming.readyState < 2) return;
      cleanup();
      outgoing.hidden = true;
      this.active = index;
      this.awaitingFrame = false;
      incoming.hidden = false;
      this.sync();
    };
    const cleanup = () => {
      incoming.removeEventListener('seeked',present);
      incoming.removeEventListener('loadeddata',present);
    };
    incoming.addEventListener('seeked',present,{signal:this.events.signal});
    incoming.addEventListener('loadeddata',present,{signal:this.events.signal});
    if(incoming.currentTime !== 0) incoming.currentTime = 0;
    present();
  }
  private sync = () => {
    if(document.hidden) { this.pendingNotice = false; this.pendingHand=undefined; }
    for(const [i,v] of this.clips.entries()) {
      if(this.disposed || this.awaitingFrame || i!==this.active || document.hidden || this.reduced) v.pause();
      else void v.play().catch(()=>{});
    }
  };
  setReduced(value:boolean) { this.reduced=value; if(value) {this.pendingNotice=false;this.pendingHand=undefined;} this.sync(); }
  dispose() {
    if(this.disposed) return;
    this.disposed=true; this.events.abort();
    if(this.cardFrame!==undefined) this.clips[1].cancelVideoFrameCallback(this.cardFrame);
    for(const v of this.clips) { v.pause(); v.removeAttribute('src'); v.load(); }
    this.host.remove();
  }
}



