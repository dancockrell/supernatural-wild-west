import {test,expect} from '@playwright/test';
test('gambler resolves his own fixed hand without a player spin',async({page})=>{
 await page.goto('/?parlor=1');
 const active=page.locator('.narrative-gambler video:not([hidden])');
 await expect(active).toHaveAttribute('src',/receive.webm/,{timeout:35000});
 await expect(active).toHaveAttribute('src',/loss.webm/,{timeout:10000});
 await expect(page.locator('.ghost-ritual-cards .received')).toHaveCount(5);
 await expect(page.locator('#spin')).toBeEnabled();
 await expect.poll(()=>active.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1);
 await page.screenshot({path:'docs/gambler-loss-in-game.png'});
 await expect(active).toHaveAttribute('src',/idle.webm/,{timeout:6500});
 await expect(page.locator('.ghost-ritual-cards .received')).toHaveCount(5);
 await expect(page.locator('#spin')).toBeEnabled();
});
