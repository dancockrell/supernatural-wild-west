import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';

for(const width of [600,688,1672]) test(`parlor controls stay in their rail at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 const rail=await page.locator('.controls').boundingBox();
 for(const selector of ['.balance','.bet-control','.spin-cluster','.win','#history']) {
  const box=await page.locator(`.controls ${selector}`).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(rail!.x-1);
  expect(box!.x+box!.width).toBeLessThanOrEqual(rail!.x+rail!.width+1);
  expect(box!.y+box!.height).toBeLessThanOrEqual(rail!.y+rail!.height+1);
 }
 const phase=await page.locator('#phase').boundingBox(),pay=await page.locator('#paytable').boundingBox();
 expect(phase!.x+phase!.width).toBeLessThan(pay!.x);
 await page.screenshot({path:`docs/parlor-jank-layout-${width}.png`});
});

test('sample resident presentation readiness through native handoffs',async({page})=>{
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.waitForTimeout(1500);
 const result=await page.evaluate(()=>new Promise(resolve=>{
  const start=performance.now();const gaps:any[]=[];let frames=0;
  const tick=()=>{frames++;for(const side of ['left','right']) {const v=document.querySelector(`.ghost-porch.${side} video`) as HTMLVideoElement;if(!v||v.readyState<2) gaps.push({side,at:performance.now()-start,ready:v?.readyState,seeking:v?.seeking});}
   if(performance.now()-start<21000) requestAnimationFrame(tick);else resolve({frames,gaps});};tick();
 }));
 writeFileSync('docs/parlor-handoff-readiness.json',JSON.stringify(result,null,2));
 expect((result as any).gaps).toEqual([]);
});
