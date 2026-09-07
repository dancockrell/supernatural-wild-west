import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('each unique player card starts a fixed-hand ritual without interrupting body acting',async({page})=>{
 await page.setContent('<main></main>');
 const source=readFileSync('src/client/ghost-hand.ts','utf8').replace(/export /g,'')+'\n'+readFileSync('src/client/narrative-gambler.ts','utf8').replace(/^import .*$/gm,'').replace('export class','class');
 await page.addScriptTag({content:ts.transpileModule(source+';Object.assign(window,{NarrativeGambler});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText});
 const result=await page.evaluate(()=>{
  HTMLMediaElement.prototype.play=function(){return Promise.resolve()};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
  const cues:number[]=[];const g=new (window as any).NarrativeGambler((_c:string,d:number)=>cues.push(d));
  const body=document.querySelector('.narrative-gambler video:not([hidden])');let starts=0;
  for(let count=1;count<=5;count++){
   g.noticeCard(`round-${count}:${count-1}`,count-1);const stamp=g.ritualStarted;starts++;
   g.noticeCard(`round-${count}:${count-1}`,count-1);if(g.ritualStarted!==stamp)throw Error('duplicate restarted');
   for(const time of [.66,1.96,2.38,2.8,3.22,4.12,6.4])g.drawHand(time);
  }
  g.noticeHand(true,true);const resolution=g.pendingHand;
  const cards=[...document.querySelectorAll('.ritual-card')].map(c=>({text:c.textContent?.replace(/\s/g,''),transform:c.getAttribute('transform')}));
  const sameBody=body===document.querySelector('.narrative-gambler video:not([hidden])');g.noticeCard('next-hand:0');starts++;
  Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
  const hiddenOpacity=g.cards.style.opacity,cleared=g.cardFrame===undefined;g.dispose();return{starts,cues,cards,sameBody,resolution,hiddenOpacity,cleared};
 });
 expect(result.starts).toBe(6);expect(result.sameBody).toBe(true);expect(result.resolution).toEqual({complete:true,paid:true});
 expect(result.cards.map(c=>c.text)).toEqual(['A♠A','K♠K','Q♠Q','J♠J','2♥2']);
 expect(result.cards.map(c=>c.transform)).toEqual([0,66,132,198,264].map(x=>`translate(${x} 0) rotate(0 28 40)`));
 expect(result.cues).toHaveLength(6);expect(result.hiddenOpacity).toBe('0');expect(result.cleared).toBe(true);
});
test('spectral deck remains crisp and on its table at 4K',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();await page.locator('#spin').click();
 const cards=page.locator('.ghost-ritual-cards');await expect(cards).toHaveAttribute('data-arrival',/.+/,{timeout:25000});
 await page.waitForTimeout(1700);await page.screenshot({path:'docs/gambler-deck-flight-4k.png'});
 const arrived=await page.locator('.poker-slot.dealt').count();
 expect(arrived).toBeGreaterThan(0);
 await expect(page.locator('.ritual-card.received')).toHaveCount(arrived,{timeout:7000});await page.screenshot({path:'docs/gambler-deck-settled-4k.png'});
 const inside=await cards.evaluate(svg=>{const host=svg.getBoundingClientRect();return [...svg.querySelectorAll('.ritual-card.received')].every(c=>{const b=c.getBoundingClientRect();return b.left>=host.left&&b.right<=host.right&&b.top>=host.top&&b.bottom<=host.bottom})});expect(inside).toBe(true);
});
