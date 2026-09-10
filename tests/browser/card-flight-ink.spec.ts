import {test,expect} from '@playwright/test';
import {injectClient} from './client-module';
test('flying card ink matches its landing geometry',async({page})=>{
 await page.goto('/?parlor=1');
 await injectClient(page,{modules:['card-face','poker-motion','poker-table'],expose:{ReviewPokerTable:'PokerTable'}});
 await page.evaluate(()=>{
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){const a=animate.call(this,frames,options);if(this.classList.contains('poker-flying-card')){a.pause();a.currentTime=219;Object.assign(window,{flight:a});}return a;};
  const t=new (window as any).ReviewPokerTable(document.querySelector('.cabinet'),()=>{});
  Object.assign(window,{reviewTable:t});
  void t.show({id:'flight-review',configVersion:'dd-1.4.0',state:{},poker:{cards:[12],cells:[0],complete:false}},true);
 });
 await expect(page.locator('.poker-flying-card')).toHaveCount(1);
 const comparison=await page.evaluate(()=>{
  const target=(window as any).reviewTable.table.querySelector('.poker-slot');
  const flyer=document.querySelector('.poker-flying-card')!;
  return ['.playing-card-ink b','.playing-card-ink i','.playing-card-ink small'].map(selector=>{
   const a=getComputedStyle(target.querySelector(selector)),b=getComputedStyle(flyer.querySelector(selector)!);
   return {target:[a.fontSize,a.fontWeight,a.width,a.height,a.left,a.top],flight:[b.fontSize,b.fontWeight,b.width,b.height,b.left,b.top]};
  });
 });
 for(const c of comparison)c.flight.forEach((value,i)=>expect(Math.abs(parseFloat(value)-parseFloat(c.target[i]))).toBeLessThan(.05));
 await page.evaluate(()=>(window as any).flight.finish());
 await expect(page.locator('.poker-flying-card')).toHaveCount(0);
});
