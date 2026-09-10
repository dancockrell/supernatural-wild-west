import {test,expect} from '@playwright/test';
import {injectClient} from './client-module';
test('exterior ghosts ignore ordinary payouts and independently branch for 1000 credits',async({page})=>{
 await page.setContent('<div class="boundary-cast"></div>');
 await injectClient(page,{modules:['character-sequence','resident-sequence','resident-reactions','exterior-residents'],expose:['ExteriorResidents']});
 const result=await page.evaluate(()=>{
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get:()=>4});
  Object.defineProperty(HTMLMediaElement.prototype,'seeking',{configurable:true,get:()=>false});
  Object.defineProperty(HTMLMediaElement.prototype,'ended',{configurable:true,get:()=>true});
  HTMLMediaElement.prototype.play=function(){this.dispatchEvent(new Event('playing'));return Promise.resolve();};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  const cast=new (window as any).ExteriorResidents();
  const clip=(who:string)=>document.querySelector<HTMLVideoElement>(`.parlor-exterior-residents .${who} video`)!;
  const name=(who:string)=>clip(who).src.split('/').pop();
  const finish=(who:string)=>clip(who).dispatchEvent(new Event('ended'));
  cast.noticePayout(99_999);finish('condemned');finish('rider');
  const ordinary=[name('condemned'),name('rider')];
  cast.noticePayout(100_000);const queued=[name('condemned'),name('rider')];
  finish('condemned');const staggered=[name('condemned'),name('rider')];
  finish('rider');const noticed=[name('condemned'),name('rider')];
  finish('condemned');finish('rider');const returned=[name('condemned'),name('rider')];
  cast.dispose();return {ordinary,queued,staggered,noticed,returned};
 });
 expect(result.ordinary).toEqual(['condemned-watch.webm','rider-watch.webm']);
 expect(result.queued).toEqual(result.ordinary);
 expect(result.staggered).toEqual(['condemned-jackpot.webm','rider-watch.webm']);
 expect(result.noticed).toEqual(['condemned-jackpot.webm','rider-jackpot.webm']);
 expect(result.returned).toEqual(['condemned.webm','rider.webm']);
});

