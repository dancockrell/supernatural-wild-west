import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('record assembled parlor playback timing',async({page})=>{
 await page.setViewportSize({width:1672,height:941});
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.waitForTimeout(2500);
 const metrics=await page.evaluate(async()=>{
  const samples:number[]=[];let last=0;
  await new Promise<void>(resolve=>{
   const start=performance.now();
   function tick(t:number){if(last)samples.push(t-last);last=t;if(t-start<15000)requestAnimationFrame(tick);else resolve();}
   requestAnimationFrame(tick);
  });
  samples.sort((a,b)=>a-b);
  return {durationSeconds:15,frames:samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],over50ms:samples.filter(n=>n>50).length,
   visibleMedia:[...document.querySelectorAll('video')].filter(v=>!v.hidden).map(v=>({src:v.getAttribute('src'),time:v.currentTime,paused:v.paused,readyState:v.readyState,quality:v.getVideoPlaybackQuality?{total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}:null}))};
 });
 writeFileSync('docs/parlor-playback-timing.json',JSON.stringify({scope:'Local headless desktop browser, 1672x941, idle scene; not a hardware certification or full-session benchmark',metrics},null,2));
 expect(metrics.frames).toBeGreaterThan(0);
});
