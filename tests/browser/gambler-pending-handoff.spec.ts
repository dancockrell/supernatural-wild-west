import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('gambler holds outgoing pose while the next clip decodes',async({page})=>{
 await page.setContent('<main></main>');
 const source=readFileSync('src/client/ghost-hand.ts','utf8').replace(/export /g,'')+'\n'+readFileSync('src/client/narrative-gambler.ts','utf8').replace(/^import .*$/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(source+'\nObject.assign(window,{NarrativeGambler});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(()=>{
  HTMLMediaElement.prototype.load=function(){};
  const plays=new Map<HTMLMediaElement,number>();
  HTMLMediaElement.prototype.play=function(){plays.set(this,(plays.get(this)||0)+1);return Promise.resolve();};
  HTMLMediaElement.prototype.pause=function(){};
  const g=new (window as any).NarrativeGambler();
  const [idle,receive]=[...document.querySelectorAll<HTMLVideoElement>('.narrative-gambler video')];
  let ready=0;Object.defineProperty(receive,'readyState',{get:()=>ready});Object.defineProperty(receive,'seeking',{get:()=>false});
  g.switchTo(1);
  window.dispatchEvent(new Event('resize'));g.setReduced(true);g.setReduced(false);
  const held={plays:plays.get(idle),visible:!idle.hidden,incomingPlays:plays.get(receive)||0};
  ready=4;receive.dispatchEvent(new Event('loadeddata'));
  const committed={visible:!receive.hidden,plays:plays.get(receive)};
  g.dispose();receive.dispatchEvent(new Event('loadeddata'));
  return {held,committed};
 });
 expect(result).toEqual({held:{plays:1,visible:true,incomingPlays:0},committed:{visible:true,plays:1}});
});
