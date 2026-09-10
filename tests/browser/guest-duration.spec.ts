import {test,expect} from '@playwright/test';
import {injectClient} from './client-module';

test('hand guests finish before the newest queued reaction starts',async({page})=>{
 await page.setContent('<main></main>');
 await injectClient(page,{
  modules:['ghost-hand','poker-guests'],
  stubs:{ghostSprite:"()=>document.createElement('video')",parlorResidentMedia:"()=>({reaction:'/unused.webm'})"},
  expose:['PokerGuests'],
 });
 const result=await page.evaluate(()=>{
  HTMLMediaElement.prototype.play=function(){return Promise.resolve()};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  document.documentElement.classList.add('unified-parlor');
  const host=document.querySelector('main')!;
  const guest=new (window as any).PokerGuests(host,()=>{});
  guest.play('Pair');const first=host.querySelector('video')!;
  guest.play('Straight');guest.play('Full house');
  const uninterrupted=host.querySelector('video')===first;
  first.dispatchEvent(new Event('ended'));
  const next=(host.querySelector('.poker-guests') as HTMLElement).dataset.reaction;
  guest.play('Straight');host.dispatchEvent(new Event('hand-reset'));
  const cleared=host.querySelectorAll('video').length===0;
  guest.dispose();return {uninterrupted,next,cleared};
 });
 expect(result).toEqual({uninterrupted:true,next:'Full house',cleared:true});
});
