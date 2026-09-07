import { ExteriorResidents } from './exterior-residents';
import { NarrativeGambler } from './narrative-gambler';
import { ResidentFog } from './resident-fog';
/** Geometry-locked films: live overlays share the source image coordinates. */
export class ParlorScene {
  private movies: HTMLVideoElement[] = [];
  private reduced = false;
  private disposed = false;
  private fog = document.createElement('video');
  private night = false;
  private shown = 0;
  private phaseAnimation?: Animation;
  private incoming?: number;
  private gambler: NarrativeGambler;
  private exterior: ExteriorResidents;
  private residentFog: ResidentFog;
  constructor(canvas: HTMLCanvasElement) {
    document.documentElement.classList.add('unified-parlor');
    for(const name of ['environment-color','environment-color-night']) {
      const v=document.createElement('video');
      v.className='parlor-environment'; v.src=`/video/unified-parlor-loop-v2/${name}.mp4`;
      v.poster=`/video/unified-parlor-loop-v2/${name}.png`;
      v.muted=true; v.loop=true; v.playsInline=true; v.preload='auto';
      v.addEventListener('loadeddata', this.sync);
      v.setAttribute('aria-hidden','true'); canvas.before(v); this.movies.push(v);
    }
    const floorRepair=document.createElement('img');
    floorRepair.className='parlor-floor-repair';
    floorRepair.src='/art/parlor-clear-left-floor.png';
    floorRepair.alt='';
    canvas.before(floorRepair);
    canvas.remove();
    document.addEventListener('visibilitychange',this.sync);
    this.exterior=new ExteriorResidents(); this.gambler=new NarrativeGambler();
    this.fog.className='parlor-foreground-fog'; this.fog.src='/video/parlor-fog-v1/foreground-fog.webm';
    this.fog.poster='/video/parlor-fog-v1/foreground-fog.png';
    this.fog.muted=true; this.fog.loop=true; this.fog.playsInline=true; this.fog.setAttribute('aria-hidden','true');
    document.body.append(this.fog);
    const app=document.getElementById('app')!;
    const stage=document.createElement('div'); stage.className='parlor-stage';
    stage.append(...Array.from(app.childNodes)); app.append(stage);
    for(const layer of document.querySelectorAll('.narrative-gambler,.parlor-foreground-fog')) stage.append(layer);
    this.residentFog = new ResidentFog(stage, '/video/parlor-resident-fog-spectral-v3/resident-fog.webm');
    this.sync();
  }
  private sync=()=>{
    if(this.disposed) return;
    if(document.hidden||this.reduced) this.fog.pause(); else void this.fog.play().catch(()=>{});
    const target = Number(this.night);
    if (document.hidden || this.reduced) {
      this.phaseAnimation?.cancel(); this.phaseAnimation=undefined; this.incoming=undefined;
      this.movies.forEach(v=>v.style.removeProperty('z-index'));
      if(document.hidden || this.reduced) this.shown=target;
    }
    if(this.phaseAnimation && this.incoming!==undefined) {
      const direction=target===this.incoming ? 1 : -1;
      if(Math.sign(this.phaseAnimation.playbackRate)!==direction) this.phaseAnimation.reverse();
    }
    if(target!==this.shown && this.incoming===undefined && this.movies[target].readyState>=2) {
      const movie=this.movies[target];
      this.incoming=target; movie.hidden=false; movie.style.zIndex='1';
      const animation=movie.animate([{opacity:0},{opacity:1}],{duration:600,easing:'ease-in-out',fill:'forwards'});
      this.phaseAnimation=animation;
      void animation.finished.then(()=>{
        if(this.disposed || this.phaseAnimation!==animation) return;
        this.shown=Number(this.night); this.incoming=undefined; this.phaseAnimation=undefined;
        movie.style.removeProperty('z-index'); animation.cancel(); this.sync();
      }).catch(()=>{});
    }
    this.movies.forEach((v,i)=>{
      v.hidden=i!==this.shown && i!==this.incoming;
      if(v.hidden||document.hidden||this.reduced) v.pause();
      else void v.play().catch(()=>{});
    });
  };
  setPhase(night:boolean) { this.night=night; this.sync(); }
  setReducedMotion(value:boolean) { this.reduced=value; this.gambler.setReduced(value); this.exterior.setReduced(value); this.residentFog.setReduced(value); this.sync(); }
  pulse() {}
  noticeRound() { this.gambler.noticeRound(); }
  noticeHand(complete:boolean, paid:boolean) { this.gambler.noticeHand(complete,paid); }
  noticePayout(payout:number) { this.exterior.noticePayout(payout); }
  dispose() {
    if(this.disposed) return;
    this.disposed=true;
    this.phaseAnimation?.cancel();
    document.removeEventListener('visibilitychange',this.sync);
    this.gambler.dispose(); this.exterior.dispose(); this.residentFog.dispose();
    for(const v of [this.fog,...this.movies]) {v.removeEventListener('loadeddata',this.sync);v.pause();v.removeAttribute('src');v.load();v.remove();}
  }
}




