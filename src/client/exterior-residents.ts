/** Distant exterior residents preserve independent native clocks behind the parlor cast. */
export class ExteriorResidents {
 private host=document.createElement('aside');
 private clips:HTMLVideoElement[]=[];
 private reduced=false;
 private disposed=false;
 private events=new AbortController();
 constructor(){
  this.host.className='parlor-exterior-residents';this.host.setAttribute('aria-hidden','true');
  for(const [name,offset] of [['condemned',1.3],['rider',4.2]] as const){
   const v=document.createElement('video');v.className=name;
   v.src=`/video/parlor-exterior-actors-v2/${name}.webm`;
   v.poster=`/video/parlor-exterior-actors-v2/${name}.png`;
   v.muted=true;v.playsInline=true;v.loop=true;
   v.addEventListener('loadedmetadata',()=>{if(Number.isFinite(v.duration)&&v.duration>0) v.currentTime=offset%v.duration;},{once:true,signal:this.events.signal});
   this.clips.push(v);this.host.append(v);
  }
  document.querySelector('.boundary-cast')?.before(this.host);
  document.addEventListener('visibilitychange',this.sync,{signal:this.events.signal});window.addEventListener('resize',this.sync,{signal:this.events.signal});this.sync();
 }
 private sync=()=>{for(const v of this.clips){if(this.disposed||document.hidden||this.reduced)v.pause();else void v.play().catch(()=>{});}};
 setReduced(value:boolean){this.reduced=value;this.sync();}
 dispose(){
  if(this.disposed)return;
  this.disposed=true;this.events.abort();
  for(const v of this.clips){v.pause();v.removeAttribute('src');v.load();}
  this.host.remove();
 }
}

