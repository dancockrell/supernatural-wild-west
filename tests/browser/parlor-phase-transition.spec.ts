import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('room phase waits for decoded footage, blends, and releases the outgoing movie',async({page})=>{
 await page.goto('/?parlor=1');
 await page.setViewportSize({width:1672,height:941});
 await page.setContent('<style>body{margin:0;background:#080b10}.parlor-environment{position:absolute;width:100%;inset:0}.parlor-environment[hidden]{display:none}</style><div id="app"><canvas></canvas></div>');
 const source=readFileSync('src/client/parlor-scene.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class','class');
 const stubs='class ExteriorResidents {setReduced(){} dispose(){}} class NarrativeGambler {setReduced(){} dispose(){} noticeRound(){}} class ResidentFog {setReduced(){} dispose(){}}';
 await page.addScriptTag({content:ts.transpileModule(stubs+source+'\nwindow.phaseScene=new ParlorScene(document.querySelector("canvas"));',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const films=page.locator('.parlor-environment');
 await expect.poll(()=>films.evaluateAll(vs=>vs.every(v=>(v as HTMLVideoElement).readyState>=2))).toBe(true);
 await page.evaluate(()=>{
  const scene=(window as any).phaseScene;
  const night=document.querySelectorAll<HTMLVideoElement>('.parlor-environment')[1];
  Object.defineProperty(night,'readyState',{configurable:true,get:()=>1});scene.setPhase(true);
 });
 await expect(page.locator('.parlor-environment:not([hidden])')).toHaveCount(1);
 await page.evaluate(()=>{
  const night=document.querySelectorAll<HTMLVideoElement>('.parlor-environment')[1];
  delete (night as any).readyState;night.dispatchEvent(new Event('loadeddata'));
  const animation=night.getAnimations()[0];animation.pause();animation.currentTime=300;
 });
 await expect(page.locator('.parlor-environment:not([hidden])')).toHaveCount(2);
 expect(await films.nth(1).evaluate(v=>Number(getComputedStyle(v).opacity))).toBeCloseTo(.5,1);
 await page.screenshot({path:'docs/parlor-phase-midpoint.png'});
 await films.nth(1).evaluate(v=>v.getAnimations()[0].finish());
 await expect(films.nth(0)).toBeHidden();
 expect(await films.nth(0).evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
 await page.evaluate(()=>{const s=(window as any).phaseScene;s.setPhase(false);s.setReducedMotion(true);});
 await expect(films.nth(1)).toBeHidden();
 expect(await films.evaluateAll(vs=>vs.every(v=>(v as HTMLVideoElement).paused&&v.getAnimations().length===0))).toBe(true);
 await page.evaluate(()=>(window as any).phaseScene.dispose());
 await expect(films).toHaveCount(0);
});

test('reversing a room transition preserves its displayed blend',async({page})=>{
 await page.setContent('<div id="app"><canvas></canvas></div>');
 const source=readFileSync('src/client/parlor-scene.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class','class');
 const stubs='class ExteriorResidents {setReduced(){} dispose(){}} class NarrativeGambler {setReduced(){} dispose(){} noticeRound(){}} class ResidentFog {setReduced(){} dispose(){}}';
 await page.addScriptTag({content:ts.transpileModule(stubs+source+'\nwindow.phaseScene=new ParlorScene(document.querySelector("canvas"));',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(()=>{
  const films=[...document.querySelectorAll<HTMLVideoElement>('.parlor-environment')];
  films.forEach(v=>Object.defineProperty(v,'readyState',{configurable:true,get:()=>2}));
  const s=(window as any).phaseScene;s.setPhase(true);
  const animation=films[1].getAnimations()[0];animation.pause();animation.currentTime=300;
  const before=Number(getComputedStyle(films[1]).opacity);
  s.setPhase(false);
  const after=Number(getComputedStyle(films[1]).opacity);
  const hidden=films[1].hidden;
  const same=films[1].getAnimations()[0]===animation;
  s.dispose();return {before,after,hidden,same};
 });
 expect(result.before).toBeCloseTo(.5,1);expect(result.after).toBeCloseTo(result.before,2);
 expect(result.hidden).toBe(false);expect(result.same).toBe(true);
});
