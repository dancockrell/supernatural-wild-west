import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('quiet arrivals and tab return preserve fixed hand prefixes',async({page})=>{
 await page.setContent('<main></main>');
 const source=readFileSync('src/client/ghost-hand.ts','utf8').replace(/export /g,'')+'\n'+readFileSync('src/client/narrative-gambler.ts','utf8').replace(/^import .*$/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(source+';Object.assign(window,{NarrativeGambler});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(()=>{
  HTMLMediaElement.prototype.play=function(){return Promise.resolve()};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  let now=1000;Object.defineProperty(performance,'now',{value:()=>now});
  const cues:number[]=[];const g=new (window as any).NarrativeGambler((_c:string,d:number)=>cues.push(d));
  const prefix=()=>[...document.querySelectorAll('.ritual-card')].map(c=>Number((c as HTMLElement).style.opacity)>0?c.textContent?.replace(/\s/g,''):null).filter(Boolean);
  const counts:number[]=[];
  for(let i=0;i<5;i++){g.noticeCard(`live:${i}`,i);const starts=[...g.cardStarts];g.noticeCard(`live:${i}`,i);if(JSON.stringify(starts)!==JSON.stringify(g.cardStarts))throw Error('duplicate changed starts');now+=3000;g.drawHand((now-g.ritualStarted)/1000);counts.push(prefix().length);}
  g.noticeCard('next:0',0);g.drawHand(.3);
  const fogAtClear=g.cards.querySelectorAll('.desk-hand-fog ellipse').length;
  now+=3000;g.drawHand((now-g.ritualStarted)/1000);
  const fogSettled=g.cards.querySelectorAll('.desk-hand-fog ellipse').length;
  Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
  const beforeQuiet=cues.length;g.noticeCard('next:1',1,false);const hiddenOpacity=g.cards.style.opacity;
  Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));const resumed=prefix();
  g.setReduced(true);g.noticeCard('next:2',2,false);g.setReduced(false);const reduced=prefix();
  const quiet=cues.length===beforeQuiet;
  g.dispose();return {counts,hiddenOpacity,resumed,reduced,quiet,fogAtClear,fogSettled};
 });
 expect(result).toEqual({counts:[1,2,3,4,5],hiddenOpacity:'0',resumed:['A♠A','K♠K'],reduced:['A♠A','K♠K','Q♠Q'],quiet:true,fogAtClear:45,fogSettled:0});
});
test('cancelled player flights cannot notify the ghost and feature score owns foley priority',async({page})=>{
 await page.setContent('<div class="cabinet"></div><div class="controls"></div><div class="symbol"></div>');
 const poker=readFileSync('src/client/poker-table.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class','class');
 const sound=readFileSync('src/client/audio.ts','utf8').replace(/export /g,'');
 await page.addScriptTag({content:ts.transpileModule(`const cardFace=()=>'';const handChoreographyIndices=()=>[];const handMotion=()=>({name:'none'});${poker};${sound};Object.assign(window,{PokerTable,SoundBus});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(async()=>{
  let finish:()=>void=()=>{};HTMLElement.prototype.animate=function(){return {finished:new Promise<void>(r=>finish=r)} as unknown as Animation};
  const arrivals:string[]=[];const table=new (window as any).PokerTable(document.querySelector('.cabinet'),()=>{},(token:string)=>arrivals.push(token));
  const task=table.show({id:'stale',configVersion:'dd-1.4.0',poker:{cards:[0],cell:0,complete:false},state:{}},true);
  await new Promise(r=>setTimeout(r,30));table.restore([]);finish();await task;
  const bus=new (window as any).SoundBus();bus.active=true;bus.prepare=()=>{};bus.context={currentTime:0,resume:()=>Promise.resolve()};bus.duckMusic=()=>{};
  let calls=0;for(const n of ['tone','noise','swell','pluck'])bus[n]=()=>calls++;
  bus.feature('witch');const featureCalls=calls;bus.play('ghost-deck',1);const muted=calls===featureCalls;bus.stopFeature();bus.play('ghost-deck',1);const resumed=calls>featureCalls;
  return {arrivals,muted,resumed};
 });
 expect(result).toEqual({arrivals:[],muted:true,resumed:true});
});


test('complete unpaid High card starts a reaction without paid-hand sound or matching celebration',async({page})=>{
 await page.setContent('<div class="cabinet"></div><div class="controls"></div>');
 const source=readFileSync('src/client/poker-table.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(`const cardFace=()=>'';const handChoreographyIndices=()=>[];const handMotion=()=>({name:'high-card'});${source};Object.assign(window,{PokerTable});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(async()=>{
   HTMLElement.prototype.animate=function(){return {finished:Promise.resolve()} as unknown as Animation;};
   const sounds:string[]=[],events:string[]=[];const table=new (window as any).PokerTable(document.querySelector('.cabinet'),(s:string)=>sounds.push(s));
   document.querySelector('.player-play-space')!.addEventListener('hand-award',e=>events.push((e as CustomEvent).detail));
   const result={id:'no-pay',configVersion:'dd-1.4.0',poker:{cards:[0,2,5,7,11],cell:0,complete:true,rank:'High card',amount:0},state:{}};
   await table.show(result,true);await table.show({...result,poker:{...result.poker,complete:false}},true);
   return{events,handSound:sounds.includes('hand'),matched:document.querySelectorAll('.poker-matching').length};
 });
 expect(result).toEqual({events:['High card'],handSound:false,matched:0});
});
