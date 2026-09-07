import {test,expect} from '@playwright/test';
import {preview} from './preview';
test('mine uses dedicated native performance without upscaling or early dismissal',async({page})=>{
 await page.goto('/?parlor=1'); await preview(page,'awaken-3');
 const clip=page.locator('.feature-stage video');
 await expect(clip).toHaveAttribute('src','/video/feature-performances-v2/mine.webm');
 await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.6);
 const bounds=await clip.evaluate((v:HTMLVideoElement)=>({h:v.getBoundingClientRect().height,native:v.videoHeight,frames:v.getVideoPlaybackQuality().totalVideoFrames}));
 expect(bounds.h).toBeLessThanOrEqual(bounds.native);expect(bounds.frames).toBeGreaterThan(3);
 await page.screenshot({path:'docs/mine-feature-runtime-review.png'});
 await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(3.1);
 await expect(page.locator('#spectacle')).toBeVisible();
 await expect(page.locator('#spectacle')).toBeHidden({timeout:4000});
});
