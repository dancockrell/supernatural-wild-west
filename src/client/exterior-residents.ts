import { createVideo } from './media-element';
import { ResidentSequence } from './resident-sequence';
import { exteriorNoticesPayout } from './resident-reactions';
/** Independent observers of the hanging; only extraordinary payouts distract them. */
export class ExteriorResidents {
 private host=document.createElement('aside');
 private residents:ResidentSequence[]=[];
 private clips:HTMLVideoElement[]=[];
 private reduced=false;
 private disposed=false;
 private events=new AbortController();
 constructor(){
  this.host.className='parlor-exterior-residents';this.host.setAttribute('aria-hidden','true');
  // Diffuse only the silhouette fringe. The interior retains its native detail.
  this.host.insertAdjacentHTML('beforeend', `<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
   <filter id="exterior-mist-blend" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
    <feMorphology in="SourceAlpha" operator="erode" radius=".004 .003" result="interior"/>
    <feComposite in="SourceGraphic" in2="interior" operator="in" result="body"/>
    <feComposite in="SourceGraphic" in2="interior" operator="out" result="fringe"/>
    <feComponentTransfer in="fringe" result="quietFringe"><feFuncR type="linear" slope=".85"/><feFuncG type="linear" slope=".85"/><feFuncB type="linear" slope=".85"/><feFuncA type="linear" slope=".65"/></feComponentTransfer>
    <feGaussianBlur in="quietFringe" stdDeviation=".003 .002" result="mist"/>
    <feMerge><feMergeNode in="mist"/><feMergeNode in="body"/></feMerge>
   </filter>
  </defs></svg>`);
  for(const [name,offset] of [['condemned',1.3],['rider',4.2]] as const){
   const slot=document.createElement('div');slot.className=name;
   const film=(action:string,start=0)=>{
    const v=createVideo();
    v.src=['palms','cold','pat','snort'].includes(action) ? `/video/parlor-idles-v2/${name}-${action}.webm` : action==='idle' ? `/video/parlor-exterior-actors-v2/${name}.webm` : `/video/parlor-exterior-stories-v1/${name}-${action}.webm`;
    v.poster=v.src.replace('.webm','.png');v.muted=true;v.playsInline=true;v.preload='auto';
    v.addEventListener('loadedmetadata',()=>{if(start&&Number.isFinite(v.duration)&&v.duration>0)v.currentTime=start%v.duration;},{once:true,signal:this.events.signal});
    this.clips.push(v);return v;
   };
   const idle=film('idle',offset);slot.append(idle);this.host.append(slot);
   this.residents.push(new ResidentSequence(slot,idle,film('jackpot'),()=>true,()=>{},[film('watch'),film(name==='rider'?'settle':'wait'),...(name==='condemned'?[film('palms'),film('cold')]:[film('pat'),film('snort')])]));
  }
  document.querySelector('.boundary-cast')?.before(this.host);
  document.addEventListener('visibilitychange',this.sync,{signal:this.events.signal});this.sync();
 }
 noticePayout(payout:number){if(this.disposed||this.reduced||document.hidden||!exteriorNoticesPayout(payout))return;for(const r of this.residents)r.enqueue(10);}
 private sync=()=>{for(const r of this.residents){if(document.hidden)r.reset();r.setPaused(document.hidden||this.disposed);}};
 setReduced(value:boolean){this.reduced=value;for(const r of this.residents)r.setReduced(value);this.sync();}
 dispose(){if(this.disposed)return;this.disposed=true;this.events.abort();for(const r of this.residents)r.setPaused(true);for(const v of this.clips){v.pause();v.removeAttribute('src');v.load();}this.host.remove();}
}
