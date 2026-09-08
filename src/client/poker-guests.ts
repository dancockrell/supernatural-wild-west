import { ghostSprite, type GhostClip } from "./ghost-sprite";
import { parlorResidentMedia } from "./resident-media";
import { createGhostHand, drawGhostHand } from './ghost-hand';

type HandCue = 'breath'|'lantern'|'pages'|'book-close'|'brazier'|'cloth'|'chain-link'|'earth'|'table-knock'|'cartridge'|'ghost-chime';
type HandBeat = {at:number;cue:HandCue;detail?:number};
type HandPerformance = {
  id: string; character: string; action: string; src: string; minimumDuration: number; beats:HandBeat[];
};
// Staged beat times are finalized at admission against the corresponding native film.
const HAND_BEATS:Record<string,HandBeat[]>={
  'high-card':[{at:2.7,cue:'ghost-chime'},{at:4.8,cue:'cloth'}],
  pair:[{at:.65,cue:'lantern'},{at:2.6,cue:'lantern',detail:1}],
  'two-pair':[{at:1.1,cue:'cloth'},{at:3,cue:'brazier'},{at:5.6,cue:'cloth'}],
  'three-kind':[{at:2,cue:'table-knock'},{at:3,cue:'ghost-chime',detail:0},{at:4.25,cue:'ghost-chime',detail:1},{at:5.5,cue:'ghost-chime',detail:2}],
  straight:[{at:1,cue:'chain-link'},{at:3.2,cue:'breath'},{at:5.5,cue:'cloth'}],
  flush:[{at:.8,cue:'lantern'},{at:2.4,cue:'earth'},{at:4.4,cue:'breath'}],
  'full-house':[{at:1.3,cue:'pages'},{at:5.3,cue:'breath'},{at:7.5,cue:'book-close'}],
  'four-kind':[{at:1.2,cue:'cartridge'},{at:2.1,cue:'cartridge',detail:1},{at:3,cue:'cartridge',detail:2},{at:3.9,cue:'cartridge',detail:3}],
  'straight-flush':[{at:1.1,cue:'brazier'},{at:3.8,cue:'breath'},{at:5.9,cue:'brazier'}],
  'royal-flush':[{at:6,cue:'cloth'},{at:9,cue:'cloth'}],
};
const HAND_PERFORMANCES: Record<string,HandPerformance> = Object.fromEntries([
  ['High card','high-card','gambler','A rueful look at an unremarkable hand'],
  ['Pair','pair','queen','Two answering lights in her lantern'],
  ['Two pair','two-pair','medium','A greeting and answering bow'],
  ['Three of a kind','three-kind','gambler','One knock answered by three ghost bells'],
  ['Straight','straight','gunslinger','Tracing a spectral path'],
  ['Flush','flush','queen','Remembering the flood through her lantern'],
  ['Full house','full-house','preacher','Opening a book as shelter'],
  ['Four of a kind','four-kind','gunslinger','Four spectral cartridges presented in turn'],
  ['Straight flush','straight-flush','medium','A continuous spiral of fortunate smoke'],
  ['Royal flush','royal-flush','gambler','A grand hat bow and impossible royal flourish'],
].map(([rank,id,character,action])=>[rank,{id,character,action,src:`/video/hand-performances-v3/${id}.webm`,minimumDuration:7,beats:HAND_BEATS[id]}]));
// Admit only after native alpha, acting, duration, and stage review. Staged paths are never fetched.
const ADMITTED_V3_HANDS = new Set<string>(['high-card','pair','two-pair','three-kind','straight','flush','full-house','four-kind','straight-flush','royal-flush']);
const LEGACY_CASTS: Record<string,GhostClip[]> = {
  Pair:['queen-lantern'],'Two pair':['medium-seance'],'Three of a kind':['medium-seance'],
  Straight:['preacher-book'],Flush:['medium-seance'],'Full house':['queen-lantern'],
  'Four of a kind':['queen-lantern'],'Straight flush':['medium-seance','preacher-book'],
  'Royal flush':['queen-lantern','preacher-book'],
};
type HandPlayback = {rank:string;id:string;phase:'start'|'stop';duration:number;currentTime:number};

/** Native hand-award guests. They never participate in outcome evaluation. */
export class PokerGuests {
  private stage=document.createElement('div');
  private events=new AbortController();
  private performance?:AbortController;
  private reduced=false;
  private disposed=false;
  private pendingRank?:string;
  private pendingAmount?:number;
  private timer?:ReturnType<typeof setTimeout>;
  private waiters=new Set<()=>void>();
  private sounding?:HandPlayback;
  constructor(host:HTMLElement,private cue:(sound:HandCue,detail?:number)=>void,
    private playback:(event:HandPlayback)=>void=()=>{},private changed:()=>void=()=>{}) {
    this.stage.className='poker-guests';this.stage.setAttribute('aria-hidden','true');host.append(this.stage);
    host.addEventListener('hand-award',e=>this.play((e as CustomEvent<string>).detail,Number(host.querySelector<HTMLElement>('.poker-award')?.dataset.amount || 0)),{signal:this.events.signal});
    host.addEventListener('hand-reset',()=>this.stop(),{signal:this.events.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();},{signal:this.events.signal});
  }
  get active(){return !!this.stage.querySelector('video');}
  whenIdle():Promise<void>{return this.active ? new Promise(resolve=>this.waiters.add(resolve)) : Promise.resolve();}
  setReduced(value:boolean){this.reduced=value;if(value)this.stop();}
  private silence(){if(this.sounding){this.playback({...this.sounding,phase:'stop'});this.sounding=undefined;}}
  private clearCurrent(){
    clearTimeout(this.timer);this.performance?.abort();this.performance=undefined;this.silence();
    for(const v of this.stage.querySelectorAll('video')){v.pause();v.removeAttribute('src');v.load();}
    this.stage.replaceChildren();this.stage.classList.remove('large-hand-stage');this.stage.style.removeProperty('--hand-rise');delete this.stage.dataset.reaction;delete this.stage.dataset.performance;for(const side of ['left','center','right','water'])this.stage.style.removeProperty(`--hand-${side}`);
  }
  private settle(){for(const resolve of this.waiters)resolve();this.waiters.clear();this.changed();}
  stop(){this.pendingRank=undefined;this.pendingAmount=undefined;this.clearCurrent();this.settle();}
  private finish(){
    const next=this.pendingRank,amount=this.pendingAmount;this.pendingRank=undefined;this.pendingAmount=undefined;this.clearCurrent();
    if(next && !this.disposed && !this.reduced && !document.hidden)this.play(next,amount);
    if(!this.active)this.settle();
  }
  play(rank:string,amount?:number){
    const definition=HAND_PERFORMANCES[rank];if(!definition)return;
    if(this.active&&!this.reduced&&!document.hidden){this.pendingRank=rank;this.pendingAmount=amount;return;}
    this.clearCurrent();
    if(this.disposed||this.reduced||document.hidden||!document.documentElement.classList.contains('unified-parlor')){this.settle();return;}
    const authored=ADMITTED_V3_HANDS.has(definition.id);
    const clips=authored?[definition.character]:LEGACY_CASTS[rank];
    if(!clips){this.settle();return;}
    this.performance=new AbortController();const signal=this.performance.signal;
    this.stage.dataset.reaction=rank;this.stage.dataset.performance=definition.id;this.stage.classList.toggle('large-hand-stage',authored);
    // A stalled decoder can fail, but a healthy long performance has no fixed cutoff.
    const armWatchdog=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.finish(),15000);};
    armWatchdog();
    const title=document.createElement('div');title.className='hand-marquee';
    title.dataset.result=amount===undefined?'preview':amount>0?'paid':'unpaid';
    const name=document.createElement('strong');name.className='hand-marquee-name';name.textContent=rank;
    const reward=document.createElement('span');reward.className='hand-marquee-payout';
    reward.textContent=amount===undefined?'PERFORMANCE PREVIEW':amount>0?`${(amount/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} CR`:'NO PAYOUT · NEXT HAND AWAITS';
    title.append(name,reward);this.stage.append(title);
    clips.forEach((clip,index)=>{
      const seat=document.createElement('div');seat.className=`poker-guest guest-${index}`;seat.dataset.cast=clip;
      const video=authored?document.createElement('video'):ghostSprite(clip as GhostClip);
      if (['Pair','Two pair','Flush','Straight flush'].includes(rank)) video.dataset.femalePerformance='true';
      if(authored){
        seat.classList.add('authored-hand-v3');if(definition.character==='queen'||definition.character==='medium')seat.classList.add('resident-guest');video.className='ghost-sprite';video.src=definition.src;
      }else{
        if(clip==='queen-lantern'||clip==='medium-seance'){
          video.src=parlorResidentMedia(clip==='queen-lantern'?'queen':'medium').reaction;seat.classList.add('resident-guest');
        }
        const dedicated:Record<string,string>={Pair:'pair','Two pair':'two-pair','Full house':'full-house'};
        if(dedicated[rank]){video.src=`/video/hand-performances-v2/${dedicated[rank]}.webm`;seat.classList.add('authored-hand');}
      }
      video.poster=video.src.replace(/\.webm$/,'.png');video.preload='auto';video.muted=true;video.playsInline=true;video.loop=false;
      video.playbackRate=1;seat.append(video);this.stage.append(seat);
      const ghostHand=authored&&definition.id==='high-card'?createGhostHand():undefined;
      if(ghostHand){seat.append(ghostHand);drawGhostHand(ghostHand,0);}
      let sounded=false,accepted=!authored,lastProgress=-1;const beatSeen=new Set<number>();
      let frameRequest:number|undefined,frameUsesVideo=false;
      const cancelFrame=()=>{
        if(frameRequest===undefined)return;
        if(frameUsesVideo)video.cancelVideoFrameCallback(frameRequest);else cancelAnimationFrame(frameRequest);
        frameRequest=undefined;
      };
      const scheduleFrame=()=>{
        if(signal.aborted||video.paused||video.ended||document.hidden||frameRequest!==undefined)return;
        frameUsesVideo=typeof video.requestVideoFrameCallback==='function';
        const draw=()=>{frameRequest=undefined;if(signal.aborted||video.paused||video.ended||document.hidden)return;updateNativeFrame();scheduleFrame();};
        frameRequest=frameUsesVideo?video.requestVideoFrameCallback(draw):requestAnimationFrame(draw);
      };
      signal.addEventListener('abort',cancelFrame,{once:true});
      const fail=()=>{if(!signal.aborted)this.finish();};
      const fitNative=()=>{
        if(!authored||!video.videoWidth||!video.videoHeight)return;
        const box=seat.getBoundingClientRect();
        const scale=Math.min(1/(window.devicePixelRatio||1),box.width/video.videoWidth,box.height/video.videoHeight);
        video.style.width=`${video.videoWidth*scale}px`;video.style.height=`${video.videoHeight*scale}px`;
        if(ghostHand){ghostHand.style.width=video.style.width;ghostHand.style.height=video.style.height;}
      };
      const validate=()=>{
        if(signal.aborted)return;
        if(authored){
          accepted=Number.isFinite(video.duration)&&video.duration>=definition.minimumDuration&&video.videoWidth>0&&video.videoHeight>0;
          if(!accepted){this.stage.dataset.failure=`${definition.id}: native duration or dimensions rejected`;fail();return;}
          fitNative();
        }
      };
      let requestedPlayback=false;
      const startPlayback=()=>{
        validate();if(!signal.aborted&&accepted&&!requestedPlayback){requestedPlayback=true;void video.play().catch(fail);}
      };
      video.addEventListener('loadedmetadata',startPlayback,{once:true,signal});
      window.addEventListener('resize',fitNative,{signal});
      video.addEventListener('loadeddata',startPlayback,{once:true,signal});
      video.addEventListener('playing',()=>{
        if(signal.aborted||!accepted)return;
        seat.classList.add('arrived');armWatchdog();
        scheduleFrame();
        if(index===0){this.silence();this.sounding={rank,id:definition.id,phase:'start',duration:video.duration,currentTime:video.currentTime};this.playback(this.sounding);}
      },{signal});
      const pauseScore=()=>{cancelFrame();if(!signal.aborted&&index===0)this.silence();};
      video.addEventListener('waiting',pauseScore,{signal});video.addEventListener('pause',pauseScore,{signal});
      const updateNativeFrame=()=>{
        if(ghostHand)drawGhostHand(ghostHand,video.currentTime);
        if(signal.aborted)return;
        if(index===0){
          const t=video.currentTime;
          const ramp=(start:number,length:number)=>Math.max(0,Math.min(1,(t-start)/length));
          const ease=(x:number)=>1-Math.pow(1-x,3);
          const entry=ease(ramp(.3,.6)),paid=ease(ramp(1,.55));
          const exit=Number.isFinite(video.duration)?ease(ramp(video.duration-.45,.45)):0;
          // Film time owns typography as well as the acting: a paused or sought
          // frame holds the exact award and reconstructs its brief flourish.
          title.style.setProperty('--title-opacity',String(entry*(1-exit)));
          title.style.setProperty('--title-y',`${(1-entry)*.6-exit*.3}cqw`);
          title.style.setProperty('--payout-opacity',String(paid));
          title.style.setProperty('--payout-y',`${(1-paid)*.4}cqw`);
          const stamp=amount!==undefined&&amount>0 ? Math.sin(Math.PI*ramp(1,.8))*.065 : 0;
          title.style.setProperty('--payout-scale',String(.94+.06*paid+stamp));
          title.style.setProperty('--rule-reveal',String(ease(ramp(1.15,.9))));
          title.style.setProperty('--award-sheen-x',`${-35+170*ramp(1.5,1.05)}%`);
          title.style.setProperty('--award-sheen-opacity',String(Math.sin(Math.PI*ramp(1.5,1.05))*.65));
          title.classList.toggle('revealed',t>=.3);title.classList.toggle('paid-reveal',t>=1);title.classList.toggle('leaving',video.duration-t<.45);
        }
        if(video.currentTime>lastProgress){lastProgress=video.currentTime;armWatchdog();}
        if(this.sounding&&index===0)this.sounding.currentTime=video.currentTime;
        if(authored&&index===0&&Number.isFinite(video.duration))this.stage.style.setProperty('--hand-rise',String(Math.sin(Math.PI*Math.min(1,video.currentTime/video.duration))));
        if(Number.isFinite(video.duration)&&video.duration-video.currentTime<.45)seat.classList.add('departing');
        if(authored&&index===0)definition.beats.forEach((beat,i)=>{
          if(video.currentTime>=beat.at&&!beatSeen.has(i)){
            beatSeen.add(i);
            if(!video.paused&&!document.hidden&&video.currentTime-beat.at<.4)this.cue(beat.cue,beat.detail);
          }
        });
        if(authored&&definition.id==='three-kind'){
          [3,4.25,5.5].forEach((at,i)=>this.stage.style.setProperty(`--hand-${['left','center','right'][i]}`,String(Math.max(0,1-Math.abs(video.currentTime-at)/.65))));
        }
        if(authored&&definition.id==='flush')this.stage.style.setProperty('--hand-water',String(Math.max(0,Math.sin(Math.PI*Math.max(0,Math.min(1,(video.currentTime-2)/4))))));
        // Legacy foley remains separate from each V3 film's explicitly authored beats.
        const at=clip==='preacher-book'?1.8:.65;
        if(!authored&&!sounded&&video.currentTime>=at){
          sounded=true;if(index===0&&!video.paused&&!document.hidden&&video.currentTime-at<.4)
            this.cue(clip==='preacher-book'?'pages':clip==='queen-lantern'?'lantern':'breath');
        }
      };
      // Decoder callbacks provide smooth native-time effects. timeupdate also
      // handles seek/progress bookkeeping when a decoder has no frame callback.
      video.addEventListener('timeupdate',updateNativeFrame,{signal});
      video.addEventListener('error',fail,{once:true,signal});
      video.addEventListener('ended',()=>{
        if(signal.aborted)return;
        cancelFrame();if(index===0)this.silence();video.pause();seat.remove();video.removeAttribute('src');video.load();
        if(!this.active)this.finish();
      },{once:true,signal});
      video.load();
    });
    this.changed();
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.stop();this.events.abort();this.stage.remove();}
}
