import {test,expect} from '@playwright/test';
test('women have no added character fog or lighting filters',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await expect(page.locator('.resident-fog')).toHaveCount(0);
 const women=page.locator('.boundary-cast .ghost-porch video');
 await expect.poll(()=>women.evaluateAll(v=>v.every(e=>(e as HTMLVideoElement).readyState>=2))).toBe(true);
 expect(await women.evaluateAll(v=>v.every(e=>getComputedStyle(e).filter.includes('women-clean')))).toBe(true);
 await page.screenshot({path:'docs/women-no-added-effects.png'});
 await expect(page.locator('.resident-ground-shadows')).toHaveCount(1);
});
