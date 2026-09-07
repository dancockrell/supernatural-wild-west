import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('src/client/main.ts','utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.ES2022,true);
const fn=(name:string)=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!.getText(ast);
test('a settled round awaits its hand film and then the feature chain before completing',async({page})=>{
  await page.setContent('<main></main>');
  await page.addScriptTag({content:ts.transpileModule(`
    let lastResult,state,presentationGeneration=0;const reduced=false;const scene=undefined;class ParlorScene{};
    const calls=[];const drawGrid=()=>{};const refresh=()=>{};const money=()=>'';const setStatus=()=>{};const el=()=>({});
    const audio={play(){}};const effects={finish(){}};
    let releaseHand,releaseFeature;const hand=new Promise(r=>releaseHand=r),feature=new Promise(r=>releaseFeature=r);
    const pokerTable={async show(){calls.push('cards')}};
    const pokerGuests={whenIdle(){calls.push('hand');return hand}};
    const presentEvents=()=>calls.push('feature');const waitForSpectacles=()=>feature;
    const boundary={react(){calls.push('boundary')}};
    ${fn('applyResult')}
    Object.assign(window,{calls,releaseHand,releaseFeature,run:()=>applyResult({grid:[],wins:[],state:{},payout:0,bet:100,events:[],configVersion:'dd-1.4.0'},true).then(()=>calls.push('done'))});
  `,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
  await page.evaluate(()=>{void (window as any).run();});
  expect(await page.evaluate(()=>(window as any).calls)).toEqual(['cards','hand']);
  await page.evaluate(()=>(window as any).releaseHand());
  expect(await page.evaluate(()=>(window as any).calls)).toEqual(['cards','hand','feature']);
  await page.evaluate(()=>(window as any).releaseFeature());
  expect(await page.evaluate(()=>(window as any).calls)).toEqual(['cards','hand','feature','boundary','done']);
});
test('a busy spin click cannot hide or stop a native presentation',async({page})=>{
  await page.setContent('<main></main>');
  await page.addScriptTag({content:ts.transpileModule(`
    let previewRequest=0;const autoplay={active:false};let busy=true,quick=false,finishAnimation;
    const spectacle={hidden:false};const el=()=>spectacle;
    ${fn('spin')}
    Object.assign(window,{run:()=>spin(),snapshot:()=>({hidden:spectacle.hidden,quick})});
  `,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
  await page.evaluate(()=>(window as any).run());
  expect(await page.evaluate(()=>(window as any).snapshot())).toEqual({hidden:false,quick:false});
});
test('shared feature finish preserves the next award and dismissal releases waiting rounds',async({page})=>{
  await page.setContent('<main></main>');
  await page.addScriptTag({content:ts.transpileModule(`
    const calls=[];let spectacleSequence=0,awardFrame=0,spectacleTimer,spectacleAudioEvents;let stopSpectacleScore=()=>{};
    const spectacle={hidden:false,querySelectorAll:()=>[{pause(){calls.push('pause')}}]};
    const el=()=>spectacle;const audio={stopFeature(){calls.push('audio-stop')}};const refresh=()=>{};
    const spectacleWaiters=new Set();let pendingAward=()=>{calls.push('next-award');spectacle.hidden=false;};
    ${fn('waitForSpectacles')} ${fn('finishSpectacle')}
    let resolved=false;waitForSpectacles().then(()=>resolved=true);
    Object.assign(window,{finishSpectacle,snapshot:()=>({calls,hidden:spectacle.hidden,resolved,waiters:spectacleWaiters.size})});
  `,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
  await page.evaluate(()=>(window as any).finishSpectacle(true));
  expect(await page.evaluate(()=>(window as any).snapshot())).toMatchObject({hidden:false,resolved:false,waiters:1});
  await page.evaluate(()=>(window as any).finishSpectacle(false));
  expect(await page.evaluate(()=>(window as any).snapshot())).toEqual({hidden:true,resolved:true,waiters:0,calls:['audio-stop','pause','next-award','audio-stop','pause']});
});
for(const cancellation of ['hidden','motion'] as const)test(`${cancellation} cancellation during a hand cannot reopen its pending feature`,async({page})=>{
  await page.setContent('<main></main>');
  await page.addScriptTag({content:ts.transpileModule(`
    let lastResult,state,presentationGeneration=0;const reduced=false;const scene=undefined;class ParlorScene{};
    const calls=[];const drawGrid=()=>{};const refresh=()=>{};const money=()=>'';const setStatus=()=>{};const el=()=>({});
    const audio={play(){}};const effects={finish(){}};let releaseHand;const hand=new Promise(r=>releaseHand=r);
    const pokerTable={async show(){calls.push('cards')}};const pokerGuests={whenIdle(){calls.push('hand');return hand}};
    const presentEvents=()=>calls.push('feature');const waitForSpectacles=()=>Promise.resolve();const boundary={react(){calls.push('boundary')}};
    ${fn('applyResult')}
    Object.assign(window,{calls,cancel:(mode)=>{if(mode==='hidden')Object.defineProperty(document,'hidden',{value:true});else presentationGeneration++;releaseHand();},run:()=>applyResult({grid:[],wins:[],state:{},payout:0,bet:100,events:[],configVersion:'dd-1.4.0'},true).then(()=>calls.push('done'))});
  `,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
  await page.evaluate(()=>{void (window as any).run();});
  expect(await page.evaluate(()=>(window as any).calls)).toEqual(['cards','hand']);
  await page.evaluate(mode=>(window as any).cancel(mode),cancellation);
  expect(await page.evaluate(()=>(window as any).calls)).toEqual(['cards','hand','done']);
});

test('initial-state refresh preserves an active preview and settled-state notification restores controls',async({page})=>{
 await page.setContent('<div class="cabinet"></div><div class="controls"></div>');
 const poker=readFileSync('src/client/poker-table.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class','class');
 const guest=readFileSync('src/client/poker-guests.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(`
 const cardFace=()=>'';const handChoreographyIndices=()=>[];const handMotion=()=>({name:'none'});const ghostSprite=()=>document.createElement('video');const parlorResidentMedia=()=>({});
 ${poker};${guest};
 const state={balance:1000,poker:{cards:[]},phase:'noon',awakened:[],sequence:0,configVersion:'test'},lastResult=undefined;
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{hidden:true,parentElement:{},style:{}});return elements.get(id)};
 const money=String,currentBet=()=>100,busy=false,autoplay={active:false},betIndex=0,CONFIG={bets:[100]},connected=true,finishAnimation=undefined,scene=undefined,audio={setNight(){}},effects={setPhase(){}},LOCATIONS=[];
 const pokerTable=new PokerTable(document.querySelector('.cabinet'),()=>{});
 const pokerGuests=new PokerGuests(document.querySelector('.player-play-space'),()=>{},()=>{},()=>queueMicrotask(refresh));
 ${fn('refresh')};Object.assign(window,{pokerGuests,refresh,el});
 `,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(async()=>{
   const w=window as any;document.documentElement.classList.add('unified-parlor');
   HTMLMediaElement.prototype.load=function(){this.removeAttribute('src');};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
   w.pokerGuests.play('High card');await Promise.resolve();w.refresh();const during={active:w.pokerGuests.active,disabled:w.el('spin').disabled};
   const v=document.querySelector('.poker-guest video')!;v.dispatchEvent(new Event('pause'));await Promise.resolve();v.dispatchEvent(new Event('ended'));await Promise.resolve();
   return{during,after:{active:w.pokerGuests.active,disabled:w.el('spin').disabled}};
 });
 expect(result).toEqual({during:{active:true,disabled:true},after:{active:false,disabled:false}});
});
