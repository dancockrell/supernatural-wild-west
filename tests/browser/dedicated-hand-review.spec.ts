import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const admitted=readFileSync('src/client/poker-guests.ts','utf8').match(/ADMITTED_V3_HANDS = new Set<string>\(\[([^\]]*)\]/)?.[1]||'';
for(const [rank,name] of [['Pair','pair'],['Two pair','two-pair'],['Full house','full-house']] as const){
 test(`${rank} uses a distinct native performance`,async({page})=>{
  await page.setViewportSize({width:3840,height:2160});
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  await page.locator('.player-play-space').evaluate((host,rank)=>host.dispatchEvent(new CustomEvent('hand-award',{detail:rank})),rank);
  const video=page.locator('.poker-guest video');
  await expect(video).toHaveCount(1);
  const v3=admitted.includes(`'${name}'`);
  await expect(video).toHaveAttribute('src',`/video/hand-performances-${v3?'v3':'v2'}/${name}.webm`);
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.2);
  const size=await video.evaluate((v:HTMLVideoElement)=>({native:v.videoHeight,display:v.getBoundingClientRect().height,frames:v.getVideoPlaybackQuality().totalVideoFrames}));
  expect(size.native).toBeGreaterThanOrEqual(size.display);expect(size.frames).toBeGreaterThan(8);
  const duration=await video.evaluate((v:HTMLVideoElement)=>v.duration);
  expect(duration).toBeGreaterThanOrEqual(v3?7:rank==='Full house'?6:5);
  const before=await video.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
  await page.waitForTimeout(1800);
  const after=await video.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
  expect(after.t-before.t).toBeGreaterThan(1.3);
  expect((after.dropped-before.dropped)/Math.max(1,after.total-before.total)).toBeLessThan(.15);
  await page.screenshot({path:`docs/hand-${name}-runtime-review.png`});
  await expect(page.locator('.poker-guest')).toHaveCount(0,{timeout:10000});
 });
}
