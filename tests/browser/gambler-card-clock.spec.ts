import {test,expect} from '@playwright/test';

test('ghost hand materialization holds when the native gambler performance pauses',async({page})=>{
 await page.setViewportSize({width:1672,height:941});
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#spin').click();
 const receive=page.locator('.narrative-gambler video[src$="receive.webm"]');
 await expect(receive).toBeVisible({timeout:30000});
 await receive.evaluate(async node=>{
  const v=node as HTMLVideoElement;v.pause();
  await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=3.475;});
 });
 const coverage=()=>page.locator('.ritual-card').evaluateAll(cards=>cards.map(c=>Number(getComputedStyle(c).opacity)));
 await expect.poll(async()=> (await coverage())[0]).toBeGreaterThan(.2);
 const paused=await coverage();
 expect(paused[0]).toBeLessThan(.8);
 expect(paused[1]).toBeLessThan(paused[0]);
 expect(paused.slice(2)).toEqual([0,0,0]);
 await page.waitForTimeout(800);
 expect(await coverage()).toEqual(paused);
 await page.screenshot({path:'docs/gambler-hand-mid-materialization.png'});
 await receive.evaluate(v=>void (v as HTMLVideoElement).play());
 await expect.poll(coverage).toEqual([1,1,1,1,1]);
 await expect(page.locator('#spin')).toBeEnabled();
 await page.screenshot({path:'docs/gambler-hand-materialized.png'});
});

