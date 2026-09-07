import {test,expect} from '@playwright/test';
for(const kind of ['noon','brand'] as const) test(`rare ${kind} has an intentional visible performance and can return safely`,async({page})=>{
 await page.setViewportSize({width:3840,height:2160});let wagers=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 const balance=await page.locator('#balance').textContent();
 await page.locator('#help').click();await page.getByRole('button',{name:'Review rare animations'}).click();
 await page.locator(`[data-feature-preview="${kind}"]`).click();
 const glyph=page.locator(`.rare-glyph-${kind}`);await expect(glyph).toBeVisible();
 await page.waitForTimeout(3900);await expect(page.locator('#spectacle')).toBeVisible();
 const bounds=await glyph.boundingBox(),controls=await page.locator('.controls').boundingBox();
 expect(bounds!.y+bounds!.height).toBeLessThan(controls!.y);
 await page.screenshot({path:`docs/rare-glyph-${kind}-4k.png`});
 await page.locator('#return-animation-gallery').click();await expect(page.locator('#spectacle')).toBeHidden();
 await expect.poll(()=>glyph.evaluate(e=>e.getAnimations({subtree:true}).every(a=>a.playState==='paused'||a.playState==='finished'))).toBe(true);
 expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
});
