import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('busted royal hand follows native film timing and dissolves into fog',async({page})=>{
 test.setTimeout(70000);await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#help').click();await page.getByRole('button',{name:'Review rare animations'}).click();await page.locator('[data-hand-preview="High card"]').click();
 const v=page.locator('.poker-guest video'),cards=page.locator('.busted-royal');await expect(cards).toHaveCount(1);await expect.poll(()=>v.evaluate((e:HTMLVideoElement)=>e.currentTime),{timeout:18000}).toBeGreaterThan(.6);
 const read=()=>v.evaluate((e:HTMLVideoElement)=>{const q=e.getVideoPlaybackQuality();return{t:e.currentTime,frames:q.totalVideoFrames,drops:q.droppedVideoFrames};});const start=await read();
 await expect.poll(()=>v.evaluate((e:HTMLVideoElement)=>e.currentTime)).toBeGreaterThan(2.9);await v.evaluate((e:HTMLVideoElement)=>e.pause());const hand=await read();
 await expect(cards).toHaveAttribute('data-phase','hand');await expect(cards.locator('.busted-card')).toHaveCount(5);expect(await cards.locator('.busted-card').last().textContent()).toContain('2');expect(await cards.locator('.busted-card').last().textContent()).toContain('♥');
 const vb=await v.boundingBox(),cb=await cards.boundingBox();expect(Math.abs(vb!.width-cb!.width)).toBeLessThan(2);expect(Math.abs(vb!.height-cb!.height)).toBeLessThan(2);
 await page.screenshot({path:'docs/busted-royal-hand-4k.png'});await cards.screenshot({path:'docs/busted-royal-hand-detail.png'});
 await v.evaluate((e:HTMLVideoElement)=>e.play());await expect.poll(()=>v.evaluate((e:HTMLVideoElement)=>e.currentTime)).toBeGreaterThan(5.3);await v.evaluate((e:HTMLVideoElement)=>e.pause());const fog=await read();await expect(cards).toHaveAttribute('data-phase','fog');expect(await cards.locator('.busted-fog ellipse').count()).toBeGreaterThan(0);
 await page.screenshot({path:'docs/busted-royal-fog-4k.png'});await cards.screenshot({path:'docs/busted-royal-fog-detail.png'});
 await v.evaluate((e:HTMLVideoElement)=>e.play());await expect(cards).toHaveAttribute('data-phase','gone',{timeout:6000});expect(await cards.locator('.busted-fog ellipse').count()).toBe(0);expect((fog.drops-start.drops)/Math.max(1,fog.frames-start.frames)).toBeLessThan(.15);
 await expect(v).toHaveCount(0,{timeout:10000});writeFileSync('docs/busted-royal-native-review.json',JSON.stringify({start,hand,fog,vb,cb},null,2));
});

