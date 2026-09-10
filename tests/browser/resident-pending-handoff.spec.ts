import {test,expect} from '@playwright/test';
import {injectClient} from './client-module';

test('visibility changes hold the outgoing resident until the incoming frame is ready',async({page})=>{
 await page.setContent('<div id="slot"></div>');
 await injectClient(page,{modules:['character-sequence','resident-sequence'],expose:['ResidentSequence']});
 const result=await page.evaluate(()=>{
  HTMLMediaElement.prototype.load=function(){};
  const slot=document.getElementById('slot')!;
  const idle=document.createElement('video'),reaction=document.createElement('video');
  let ready=0,plays=0,reactionPlays=0;
  Object.defineProperty(reaction,'readyState',{get:()=>ready});
  Object.defineProperty(reaction,'seeking',{get:()=>false});
  idle.play=()=>{plays++;return Promise.resolve();};idle.pause=()=>{};
  reaction.play=()=>{reactionPlays++;return Promise.resolve();};reaction.pause=()=>{};
  slot.append(idle);
  const resident=new (window as any).ResidentSequence(slot,idle,reaction,()=>true,()=>{});
  // Exercise a slow incoming decode, followed by hide/show and repeated sync.
  resident.present(reaction);
  resident.setPaused(true);resident.setPaused(false);resident.setPaused(false);
  const waiting={plays,reactionPlays,outgoing:slot.firstChild===idle};
  ready=4;reaction.dispatchEvent(new Event('loadeddata'));
  const committed={plays,reactionPlays,incoming:slot.firstChild===reaction};
  // A superseded pending handoff must not resurrect itself on a late event.
  ready=0;resident.present(reaction);resident.reset();
  Object.defineProperty(idle,'readyState',{get:()=>4});
  Object.defineProperty(idle,'seeking',{get:()=>false});
  idle.dispatchEvent(new Event('loadeddata'));
  ready=4;reaction.dispatchEvent(new Event('loadeddata'));
  return {waiting,committed,resetHeld:slot.firstChild===idle};
 });
 expect(result).toEqual({waiting:{plays:0,reactionPlays:0,outgoing:true},committed:{plays:0,reactionPlays:1,incoming:true},resetHeld:true});
});
