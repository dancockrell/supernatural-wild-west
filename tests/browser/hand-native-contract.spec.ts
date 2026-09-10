import {test,expect} from '@playwright/test';
import {injectClient} from './client-module';
async function install(page:any){
  await page.setContent('<div id="host"></div>');
  await injectClient(page,{
    modules:['ghost-hand','poker-guests'],
    stubs:{ghostSprite:"()=>document.createElement('video')",parlorResidentMedia:"()=>({reaction:'test.webm'})"},
    expose:['PokerGuests','HAND_PERFORMANCES','ADMITTED_V3_HANDS'],
  });
}
test('ten unique staged performances require seven native seconds and preserve background ghost roles',async({page})=>{
  await install(page);
  const entries=await page.evaluate(()=>Object.values((window as any).HAND_PERFORMANCES) as any[]);
  expect(entries).toHaveLength(10);expect(new Set(entries.map(e=>e.src)).size).toBe(10);
  expect(entries.every(e=>e.minimumDuration>=7&&e.src.startsWith('/video/hand-performances-v3/'))).toBe(true);
  expect(entries.some(e=>['rider','condemned'].includes(e.character))).toBe(false);
});
test('short admitted media fails before playback; full performances queue and pause their own scores',async({page})=>{
  await install(page);
  const result=await page.evaluate(async()=>{
    document.documentElement.classList.add('unified-parlor');
    const w=window as any;for(const value of Object.values(w.HAND_PERFORMANCES) as any[])w.ADMITTED_V3_HANDS.add(value.id);
    let plays=0;const cues:any[]=[];
    HTMLMediaElement.prototype.load=function(){};HTMLMediaElement.prototype.pause=function(){};
    HTMLMediaElement.prototype.play=function(){plays++;this.dispatchEvent(new Event('playing'));return Promise.resolve();};
    const host=document.getElementById('host')!;const g=new w.PokerGuests(host,()=>{},(cue:any)=>cues.push({...cue}));
    const load=(duration:number)=>{
      const v=host.querySelector('video')!;
      Object.defineProperties(v,{duration:{configurable:true,value:duration},videoWidth:{configurable:true,value:1920},videoHeight:{configurable:true,value:1440},currentTime:{configurable:true,writable:true,value:0}});
      v.dispatchEvent(new Event('loadedmetadata'));v.dispatchEvent(new Event('loadeddata'));return v;
    };
    g.play('Pair');load(6.9);const rejected={plays,active:g.active,failure:host.querySelector('.poker-guests')!.getAttribute('data-failure')};
    g.play('Pair');const first=load(7.042);let completed=false;const done=g.whenIdle().then(()=>completed=true);
    const native={loop:first.loop,rate:first.playbackRate};
    first.currentTime=2;first.dispatchEvent(new Event('timeupdate'));first.dispatchEvent(new Event('waiting'));first.dispatchEvent(new Event('playing'));
    g.play('Royal flush');await Promise.resolve();const pendingBefore=completed;
    first.dispatchEvent(new Event('ended'));await Promise.resolve();const pendingBetween=completed;const second=load(8.042);
    second.dispatchEvent(new Event('ended'));await done;const completedAfter=completed;
    g.play('Flush');const stale=load(7.042);const cancelled=g.whenIdle();g.stop();await cancelled;const oldPlays=plays;
    stale.dispatchEvent(new Event('loadeddata'));stale.dispatchEvent(new Event('playing'));
    const latePlays=plays-oldPlays;g.dispose();return{rejected,native,pendingBefore,pendingBetween,completedAfter,cues,latePlays};
  });
  expect(result.rejected).toMatchObject({plays:0,active:false});expect(result.rejected.failure).toContain('rejected');
  expect(result.native).toEqual({loop:false,rate:1});expect(result.pendingBefore).toBe(false);expect(result.pendingBetween).toBe(false);expect(result.completedAfter).toBe(true);
  expect(result.cues.filter(c=>c.id==='pair'&&c.phase==='start').map(c=>c.currentTime)).toEqual([0,2]);
  expect(result.cues.filter(c=>c.id==='pair'&&c.phase==='stop').length).toBeGreaterThanOrEqual(2);
  expect(result.latePlays).toBe(0);
});
test('native progress keeps a longer film alive beyond the old fixed cutoff',async({page})=>{
  await page.clock.install();await install(page);
  await page.evaluate(()=>{
    const w=window as any;document.documentElement.classList.add('unified-parlor');w.ADMITTED_V3_HANDS.add('pair');
    HTMLMediaElement.prototype.load=function(){this.removeAttribute('src');};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
    const g=new w.PokerGuests(document.getElementById('host'),()=>{});g.play('Pair');const v=document.querySelector('video')!;
    Object.defineProperties(v,{duration:{value:20},videoWidth:{value:1920},videoHeight:{value:1440},currentTime:{writable:true,value:0}});
    v.dispatchEvent(new Event('loadeddata'));Object.assign(w,{progress:(t:number)=>{v.currentTime=t;v.dispatchEvent(new Event('timeupdate'));},film:g});
  });
  for(const t of [5,10,15]){await page.clock.runFor(5000);await page.evaluate(t=>(window as any).progress(t),t);expect(await page.evaluate(()=>(window as any).film.active)).toBe(true);}
  await page.clock.runFor(16000);expect(await page.evaluate(()=>(window as any).film.active)).toBe(false);
});



test('native frame callbacks advance effects smoothly and cancel across pause and stop',async({page})=>{
 await install(page);
 const result=await page.evaluate(()=>{
   const w=window as any;document.documentElement.classList.add('unified-parlor');w.ADMITTED_V3_HANDS.add('flush');
   HTMLMediaElement.prototype.load=function(){this.removeAttribute('src');};HTMLMediaElement.prototype.pause=function(){};
   HTMLMediaElement.prototype.play=function(){this.dispatchEvent(new Event('playing'));return Promise.resolve();};
   let callback:()=>void=()=>{},requests=0,cancels=0;
   HTMLVideoElement.prototype.requestVideoFrameCallback=function(cb:any){callback=cb;return ++requests;};
   HTMLVideoElement.prototype.cancelVideoFrameCallback=function(){cancels++;};
   const g=new w.PokerGuests(document.getElementById('host'),()=>{});g.play('Flush');const v=document.querySelector('video')!;
   Object.defineProperties(v,{duration:{value:10},videoWidth:{value:1442},videoHeight:{value:1600},currentTime:{writable:true,value:2},paused:{writable:true,value:false},ended:{value:false}});
   v.dispatchEvent(new Event('loadeddata'));const stage=document.querySelector('.poker-guests') as HTMLElement;
   const values:string[]=[];for(const t of [2.02,2.04,2.06]){v.currentTime=t;callback();values.push(stage.style.getPropertyValue('--hand-water'));}
   Object.defineProperty(v,'paused',{value:true});v.dispatchEvent(new Event('pause'));const frozen=stage.style.getPropertyValue('--hand-water');v.currentTime=3;callback();const still=stage.style.getPropertyValue('--hand-water');
   Object.defineProperty(v,'paused',{value:false});v.dispatchEvent(new Event('playing'));const stale=callback;g.stop();stale();
   return{values,frozen,still,cancels,requests,after:stage.style.getPropertyValue('--hand-water')};
 });
 expect(new Set(result.values).size).toBe(3);expect(result.frozen).toBe(result.still);expect(result.cancels).toBe(2);expect(result.requests).toBeGreaterThan(3);expect(result.after).toBe('');
});

