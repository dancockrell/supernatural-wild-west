import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('hand arrivals coalesce, resolutions take priority and hidden tabs clear reactions',async({page})=>{
 await page.setContent('<main></main>');
 const source=readFileSync('src/client/ghost-hand.ts','utf8').replace(/export /g,'')+'\n'+readFileSync('src/client/narrative-gambler.ts','utf8').replace(/^import .*$/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(source+'\nObject.assign(window,{NarrativeGambler});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(()=>{
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get:()=>4});
  Object.defineProperty(HTMLMediaElement.prototype,'seeking',{configurable:true,get:()=>false});
  HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
  HTMLMediaElement.prototype.pause=function(){};
  HTMLMediaElement.prototype.load=function(){};
  const C=(window as any).NarrativeGambler;
  const g=new C();
  const current=()=>document.querySelector<HTMLVideoElement>('.narrative-gambler video:not([hidden])')!;
  const name=()=>current().src.split('/').pop();
  const finish=()=>{current().dispatchEvent(new Event('ended'));return name();};
  for(let i=0;i<20;i++)g.noticeRound();
  const before=name();
  const first=finish(); // first idle boundary notices the coalesced batch
  const returned=finish();
  const noBacklog=finish(); // second idle boundary has no queued repetitions
  const idleOnly=[finish(),finish(),finish(),finish()];
  g.noticeRound();
  g.noticeHand(false,false);
  const ritual=finish(); // third idle boundary gives the ritual priority
  const afterRitual=finish();
  const afterLoss=finish();
  const deferred=finish(); // notice survives the ritual and next full idle
  finish();
  g.noticeRound();
  Object.defineProperty(document,'hidden',{configurable:true,value:true});
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  document.dispatchEvent(new Event('visibilitychange'));
  const afterHidden=[finish(),finish(),finish(),finish()];
  g.dispose();
  g.dispose();
  const h=new C();
  h.noticeHand(false,false);h.noticeHand(true,true);h.noticeHand(false,false);
  const pendingResolution=finish();
  h.dispose();
  return {before,first,returned,noBacklog,idleOnly,ritual,afterRitual,afterLoss,deferred,afterHidden,pendingResolution};
 });
 expect(result).toMatchObject({before:'idle.webm',first:'notice.webm',returned:'idle.webm',noBacklog:'gambler-brim.webm',ritual:'receive.webm',afterRitual:'loss.webm',afterLoss:'idle.webm',deferred:'notice.webm'});
 expect(result.afterHidden).not.toContain('notice.webm');
 expect(result.idleOnly).toEqual(['idle.webm','gambler-knuckle.webm','idle.webm','gambler-brim.webm']);
 expect(result.pendingResolution).toBe('notice.webm');
});

test('a hand resolving during the deal reacts at the native boundary without a duplicate loss',async({page})=>{
 await page.setContent('<main></main>');
 const source=readFileSync('src/client/ghost-hand.ts','utf8').replace(/export /g,'')+'\n'+readFileSync('src/client/narrative-gambler.ts','utf8').replace(/^import .*$/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(source+'\nObject.assign(window,{NarrativeGambler});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const results=await page.evaluate(()=>{
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get:()=>4});
  Object.defineProperty(HTMLMediaElement.prototype,'seeking',{configurable:true,get:()=>false});
  HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
  HTMLMediaElement.prototype.pause=function(){};
  HTMLMediaElement.prototype.load=function(){};
  return [true,false].map(paid=>{
   const g=new (window as any).NarrativeGambler();
   const current=()=>document.querySelector<HTMLVideoElement>('.narrative-gambler video:not([hidden])')!;
   const name=()=>current().dataset.performance;
   const finish=()=>{current().dispatchEvent(new Event('ended'));return name();};
   g.noticeHand(false,false);
   const deal=finish();
   g.noticeHand(true,paid);
   const uninterrupted=name();
   const reaction=finish();
   const queued=g.pendingHand;
   const returned=finish();
   const nextIdle=finish();
   g.dispose();
   return {paid,deal,uninterrupted,reaction,queued,returned,nextIdle};
  });
 });
 expect(results).toEqual([true,false].map(paid=>({paid,deal:'receive',uninterrupted:'receive',reaction:paid?'notice':'loss',queued:undefined,returned:'idle',nextIdle:'brim'})));
});


