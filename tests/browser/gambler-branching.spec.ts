import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('round notices coalesce, respect ritual priority and expire when hidden',async({page})=>{
 await page.setContent('<main></main>');
 const source=readFileSync('src/client/narrative-gambler.ts','utf8').replace('export class','class');
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
  g.noticeRound();
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
  return {before,first,returned,noBacklog,ritual,afterRitual,afterLoss,deferred,afterHidden};
 });
 expect(result).toMatchObject({before:'idle.webm',first:'notice.webm',returned:'idle.webm',noBacklog:'idle.webm',ritual:'receive.webm',afterRitual:'loss.webm',afterLoss:'idle.webm',deferred:'notice.webm'});
 expect(result.afterHidden).not.toContain('notice.webm');
});

