import {test,expect} from '@playwright/test';
test('resident rim treatment preserves full-stage playback and transition filter',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
 // The resident fog this used to wait for was removed on purpose by 68a0f0b
 // ("Remove added fog and relighting from both women"), and its clips deleted
 // by 21b0ce1. Waiting for it could never succeed, and it stood on the first
 // line, so nothing below it - the rim filter, the playback continuity, the
 // dropped-frame budget, the properties this test is named for - had run
 // since. See tests/browser/women-no-effects.spec.ts for the decision it
 // contradicted.
 const video=page.locator('.ghost-porch.left video');
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.5);
 // STALE ASSERTION, CORRECTED. This asked for `resident-soft-rim` on a resident.
 // That rim was taken off the two women by 68a0f0b ("Remove added fog and
 // relighting from both women") and now applies only to the preacher sprite
 // (parlor.css:364) and the full-house hand (cinematics.css:845). What a
 // resident carries instead, deliberately, is the alpha-only wisp fade added by
 // 7ceca5f - see parlor.css:353 and cinematics.css:940. Asserting the rim would
 // have meant re-shading the women, which women-no-effects.spec.ts exists to
 // forbid; so the filter this names is the wisp fade, and it is checked exactly
 // rather than by substring so an added body shader cannot slip past.
 // ResidentSequence.present() also copies this computed filter onto the canvas
 // that stands in while the next decoder starts, which is the "transition"
 // half of this test's name. That canvas exists only for a few frames at a
 // native boundary and is NOT checked here: any assertion over it that this
 // test could reach would pass just as happily when no canvas is present.
 expect(await video.evaluate(v=>getComputedStyle(v).filter)).toBe('url("#ghost-wisp-fade")');
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
