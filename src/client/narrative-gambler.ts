/** A quiet independent ritual, never an opponent or a gate on the spin lifecycle. */
export class NarrativeGambler {
  private host = document.createElement('aside');
  // Two idle buffers keep the last frame visible while the other rewinds.
  private clips = ['idle','receive','idle','notice','loss','brim','knuckle'].map(name => {
    const v = document.createElement('video');
    v.dataset.performance = name;
    const family = 'parlor-gambler-hair-v1';
    v.src = name === 'receive'
      ? '/video/parlor-gambler-native-v2/receive.webm'
      : name === 'brim' || name === 'knuckle'
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
  private oldCardCount = 0;
  private cardFrame?: number;
  private ritualStarted = 0;
  private ritualSeen = new Set<string>();
  private ritualSounds = new Set<number>();
  private cardStarts = Array<number>(5).fill(Infinity);
  constructor(private sound: (cue: 'ghost-deck', detail?: number) => void = () => {}) {
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
    this.cards.innerHTML = `<defs><filter id="ritual-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5"/></filter></defs><g class="ritual-trails" transform="matrix(1 .107 -.16 .40 288 331.2)"></g><g transform="matrix(1 .107 -.16 .40 288 331.2)">${['A','K','Q','J','2'].map((rank,i) => {
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
    // Keep the felt, front panel, and feet identical across independently generated films.
    // The plate begins below every reviewed hand silhouette; it contains no frozen fingers.
    const tablePlate = document.createElement('img');
    tablePlate.className = 'gambler-table-plate'; tablePlate.alt = '';
    tablePlate.addEventListener('load', () => this.host.classList.add('table-plate-ready'), {signal:this.events.signal});
    tablePlate.src = '/video/parlor-gambler-native-v2/receive.png';
    this.host.append(contact, ...this.clips, tablePlate, this.cards); document.body.append(this.host);
    const idleOrder = [0,5,2,6];
    for(const index of idleOrder) this.clips[index].addEventListener('ended', () => {
      if(this.disposed || this.reduced || document.hidden || this.active !== index) return;
      this.cycles++;
      if(this.pendingHand && this.clips[this.pendingHand.complete ? (this.pendingHand.paid ? 3 : 4) : 1].readyState >= 2) {
        const hand=this.pendingHand;
        this.pendingHand=undefined;
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
  /** Each actual player-card arrival gets a local card performance; body acting stays on its own clock. */
  noticeCard(token:string,index=0,animate=true) {
    if(this.disposed || this.ritualSeen.has(token)) return;
    this.ritualSeen.add(token);
    if(this.ritualSeen.size>40) this.ritualSeen.delete(this.ritualSeen.values().next().value!);
    index=Math.max(0,Math.min(4,index));
    const now=performance.now();
    if(index===0 || !this.ritualStarted){
      this.oldCardCount=this.cardStarts.filter(Number.isFinite).length;
      this.hadHand=this.oldCardCount>0;
      this.ritualStarted=now;this.ritualSounds.clear();this.cardStarts.fill(Infinity);
      for(let i=0;i<index;i++){this.cardStarts[i]=-10;this.ritualSounds.add(i+1);}
    }
    for(let i=0;i<index;i++) if(!Number.isFinite(this.cardStarts[i])){this.cardStarts[i]=-10;this.ritualSounds.add(i+1);}
    const elapsed=(now-this.ritualStarted)/1000;
    this.cardStarts[index]=Math.max(elapsed+.15,.65+index*.42+(index===4?.48:0));
    if(this.cardFrame!==undefined) cancelAnimationFrame(this.cardFrame);
    this.cards.dataset.arrival=token;
    if(!animate || this.reduced || document.hidden){this.settleCards();if(document.hidden)this.cards.style.opacity='0';return;}
    const tick=(now:number)=>{
      if(this.disposed || this.reduced || document.hidden) return;
      const time=(now-this.ritualStarted)/1000;
      this.drawHand(time);
      const end=Math.max(...this.cardStarts.filter(Number.isFinite))+3.3;
      if(time<end) this.cardFrame=requestAnimationFrame(tick);
      else this.cardFrame=undefined;
    };
    this.cardFrame=requestAnimationFrame(tick);
  }
  private settleCards(){
    if(this.cardFrame!==undefined)cancelAnimationFrame(this.cardFrame);this.cardFrame=undefined;
    this.cardStarts=this.cardStarts.map(t=>Number.isFinite(t)?-10:Infinity);this.drawHand(7,false);
  }
  private drawHand(time:number,foley=true) {
    const clamp=(t:number)=>Math.max(0,Math.min(1,t));
    const smooth=(t:number)=>{const x=clamp(t);return x*x*(3-2*x);};
    this.cards.classList.add('visible');this.cards.style.opacity='.94';
    const trails:string[]=[];
    this.cards.querySelectorAll<SVGGElement>('.ritual-card').forEach((card,i)=>{
      const start=this.cardStarts[i], progress=clamp((time-start)/1.3);
      const ease=1-Math.pow(1-progress,3),x=90+(i*66-90)*ease;
      const y=progress===1 ? 0 : -160*(1-ease)-Math.sin(progress*Math.PI)*95;
      const angle=(-75+i*12)*(1-ease)+Math.sin(progress*Math.PI*3)*4*(1-progress);
      const old=this.hadHand&&time<.6;
      const opacity=old ? (i<this.oldCardCount ? 1-smooth(time/.6) : 0) : smooth((time-start)/.22);
      card.style.opacity=String(opacity);
      card.setAttribute('transform',old ? `translate(${i*66} ${-smooth(time/.6)*35})` : `translate(${x} ${y}) rotate(${angle} 28 40)`);
      card.classList.toggle('received',progress===1);
      if(!old && progress>0 && progress<1) trails.push(`<path d="M118 -120 Q${x-30} ${y-70} ${x+28} ${y+40}" fill="none" stroke="${i===4?'#c1a4ed':'#c7eaff'}" stroke-width="${7*(1-progress)+1}" opacity="${.2*Math.sin(progress*Math.PI)}" filter="url(#ritual-glow)"/>`);
      const landed=start+1.3;
      if(time>=landed && !this.ritualSounds.has(i+1)){
        this.ritualSounds.add(i+1);if(foley && time-landed<.15)this.sound('ghost-deck',i+1);
      }
    });
    this.cards.querySelector('.ritual-trails')!.innerHTML=trails.join('');
    if(time>=.65&&!this.ritualSounds.has(0)){this.ritualSounds.add(0);if(foley && time-.65<.15)this.sound('ghost-deck',0);}
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
    if(document.hidden) { this.pendingNotice = false; this.pendingHand=undefined; if(this.cardFrame!==undefined)cancelAnimationFrame(this.cardFrame);this.cardFrame=undefined;this.settleCards();this.cards.style.opacity='0'; }
    else if(this.ritualStarted && this.cardFrame===undefined) this.settleCards();
    for(const [i,v] of this.clips.entries()) {
      if(this.disposed || this.awaitingFrame || i!==this.active || document.hidden || this.reduced) v.pause();
      else void v.play().catch(()=>{});
    }
  };
  setReduced(value:boolean) { if(value && this.cardFrame!==undefined){cancelAnimationFrame(this.cardFrame);this.cardFrame=undefined;this.settleCards();} this.reduced=value; if(value) {this.pendingNotice=false;this.pendingHand=undefined;} this.sync(); }
  dispose() {
    if(this.disposed) return;
    this.disposed=true; this.events.abort();
    if(this.cardFrame!==undefined) cancelAnimationFrame(this.cardFrame);
    for(const v of this.clips) { v.pause(); v.removeAttribute('src'); v.load(); }
    this.host.remove();
  }
}



