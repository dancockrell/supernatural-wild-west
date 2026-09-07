import {test,expect} from '@playwright/test';
import {preview} from './preview';
test('native event stays visible past three seconds and closes on completion',async({page})=>{
 await page.goto('/?parlor=1');await preview(page,'witch');
 const clip=page.locator('.feature-stage video');
 await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:12000}).toBeGreaterThan(3.1);
 await expect(page.locator('#spectacle')).toBeVisible();
 await expect(page.locator('#spectacle')).toBeHidden({timeout:3000});
});
test('enabling reduced motion dismisses an ongoing native event',async({page})=>{
 await page.goto('/?parlor=1');await preview(page,'witch');
 await expect(page.locator('#spectacle')).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('#spectacle')).toBeHidden({timeout:1500});
});
