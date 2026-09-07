import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { ResidentSequence } from '../src/client/resident-sequence';
class Clip extends EventTarget {
 loop=true; dataset:Record<string,string>={}; preload=''; currentTime=0; readyState=2; ended=false; error=null; paused=true;
 load() {} pause(){this.paused=true;} play(){this.paused=false;this.ended=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();}
 finish(){this.ended=true;this.dispatchEvent(new Event('ended'));}
 remove() {}
}
function setup(){
 const idle=new Clip(),alt=new Clip(),reaction=new Clip();
 let shown:Clip=idle;
 const slot={prepend:(clip:Clip)=>{shown=clip;}};
 const sequence=new ResidentSequence(slot as unknown as HTMLElement,idle as unknown as HTMLVideoElement,reaction as unknown as HTMLVideoElement,()=>true,()=>{},[alt as unknown as HTMLVideoElement]);
 sequence.setPaused(false);
 return {idle,alt,reaction,sequence,shown:()=>shown};
}
describe('native idle repertoire',()=>{
 beforeEach(()=>vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 1;}));
 afterEach(()=>vi.unstubAllGlobals());
 it('changes idle only at the endpoint and gives a queued reaction priority',()=>{
  const s=setup(); expect(s.shown()).toBe(s.idle);
  s.idle.finish(); expect(s.shown()).toBe(s.alt);
  s.sequence.enqueue(); expect(s.shown()).toBe(s.alt);
  s.alt.finish(); expect(s.shown()).toBe(s.reaction);
  s.reaction.finish(); expect(s.shown()).toBe(s.idle);
 });
 it('repeats decoded idle rather than freezing for an unavailable alternate',()=>{
  const s=setup(); s.alt.readyState=0;s.idle.finish();
  expect(s.shown()).toBe(s.idle);expect(s.idle.paused).toBe(false);
  s.alt.readyState=2;s.idle.finish();expect(s.shown()).toBe(s.alt);
 });
});
