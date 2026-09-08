import { test, expect } from '@playwright/test';
import { parlorResidentMedia } from '../../src/client/resident-media';

for (const key of ['queen','medium'] as const) test(`${key} completes all five native idles at fixed stage placement`,async({page})=>{
 test.setTimeout(95000);
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 const actor=page.locator(`.ghost-porch video[data-movie="${key}"]`);
 const original=await actor.boundingBox();const media=parlorResidentMedia(key);
 for(const src of [media.alternate,media.characterIdle,...media.quietVariants,media.idle]){
  await expect(actor).toHaveAttribute('src',src,{timeout:22000});
  await expect.poll(()=>actor.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:5000}).toBeGreaterThan(.7);
  expect(await actor.boundingBox()).toEqual(original);
  await expect(page.locator('.ghost-porch canvas')).toHaveCount(0);
 }
 await page.screenshot({path:`docs/restored-${key}-room-4k.png`});
});
