import {test,expect} from '@playwright/test';
import {preview} from './preview';

for (const [kind,name,seconds] of [['fortune','fortune',7],['awaken-0','graveyard',8],['ride','ride',8]] as const) {
 test(`recovered ${name} runs its complete native performance`,async({page})=>{
  await page.setViewportSize({width:3840,height:2160});
  let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
  await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
  const balance=await page.locator('#balance').textContent();
  await preview(page,kind);
  const clip=page.locator('.feature-stage video');
  await expect(clip).toHaveAttribute('src',`/video/rare-features-v4/${name}.webm`);
  await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.5);
  const before=await clip.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
  await page.waitForTimeout(1800);
  const after=await clip.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames,h:v.getBoundingClientRect().height,native:v.videoHeight,duration:v.duration}));
  expect(after.t-before.t).toBeGreaterThan(1.3);
  expect((after.dropped-before.dropped)/Math.max(1,after.total-before.total)).toBeLessThan(.15);
  expect(after.h).toBeLessThanOrEqual(after.native);expect(after.duration).toBeGreaterThanOrEqual(seconds);
  await page.screenshot({path:`docs/rare-repaired-${name}-4k.png`});
  await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:12000}).toBeGreaterThan(seconds-.5);
  await expect(page.locator('#spectacle')).toBeHidden({timeout:3000});
  expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
  console.log(name,JSON.stringify({before,after}));
 });
}

test('brazier reaction review uses high resolution and the scene lighting',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
 await page.locator('#help').click();await page.locator('#rare-animation-gallery').click();
 await page.locator('[data-character-preview="1"]').click();
 const clip=page.locator('.reaction-review');
 await expect(clip).toHaveAttribute('src','/video/rare-features-v4/medium-reaction.webm');
 await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(2);
 expect(await clip.evaluate((v:HTMLVideoElement)=>v.videoHeight)).toBe(1920);
 expect(await clip.evaluate(v=>getComputedStyle(v).filter)).toContain('resident-soft-rim');
 expect(await clip.evaluate(v=>getComputedStyle(v).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 expect(await clip.evaluate(v=>getComputedStyle(v).backgroundImage)).toBe('none');
 await page.screenshot({path:'docs/rare-repaired-medium-4k.png'});
 await page.locator('#back-to-rare-animations').click();await expect(clip).toHaveCount(0);
});
