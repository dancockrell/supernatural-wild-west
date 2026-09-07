import {test,expect} from '@playwright/test';
test('resident rim treatment preserves full-stage playback and transition filter',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
 const video=page.locator('.ghost-porch.left video');
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.5);
 expect(await video.evaluate(v=>getComputedStyle(v).filter)).toContain('resident-soft-rim');
 await video.evaluate((v:HTMLVideoElement)=>new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=.5;}));
 const before=await video.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
 await page.waitForTimeout(1800);
 const after=await video.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
 expect(after.t-before.t).toBeGreaterThan(1.3);
 expect((after.dropped-before.dropped)/Math.max(1,after.total-before.total)).toBeLessThan(.15);
 await page.evaluate(()=>document.querySelectorAll('video').forEach(v=>v.pause()));
 await page.screenshot({path:'docs/resident-rim-after.png'});
 await page.addStyleTag({content:'.ghost-porch video,.ghost-porch canvas{filter:none!important}'});
 await page.screenshot({path:'docs/resident-rim-before.png'});
 console.log('rim playback',JSON.stringify({before,after}));
});
