import {test,expect} from '@playwright/test';

test('How to Play exposes rare performances without wagering and supports quick return',async({page})=>{
 let wagers=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 const cards=await page.locator('.poker-felt').innerHTML();
 const balance=await page.locator('#balance').textContent();
 await page.locator('#help').click();
 await page.getByRole('button',{name:'Review rare animations'}).click();
 await expect(page.locator('[data-feature-preview]')).toHaveCount(10);
 await expect(page.locator('[data-hand-preview]')).toHaveCount(9);
 await expect(page.locator('[data-character-preview]')).toHaveCount(7);
 await page.screenshot({path:'docs/rare-animation-gallery.png'});
 await page.locator('[data-feature-preview="awaken-3"]').click();
 await expect(page.locator('.feature-stage video')).toHaveAttribute('src','/video/feature-performances-v2/mine.webm');
 await page.locator('#return-animation-gallery').click();
 await expect(page.locator('#spectacle')).toBeHidden();
 await page.locator('[data-hand-preview="Two pair"]').click();
 await expect(page.locator('.poker-guest video')).toHaveAttribute('src','/video/hand-performances-v2/two-pair.webm');
 await page.locator('#return-animation-gallery').click();
 await expect(page.locator('.poker-guest')).toHaveCount(0);
 await page.locator('[data-character-preview="5"]').click();
 await expect(page.locator('.reaction-review')).toHaveAttribute('src','/video/parlor-exterior-stories-v1/condemned-jackpot.webm');
 await expect.poll(()=>page.locator('.reaction-review').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.1);
 await page.locator('#close-modal').click();
 await expect.poll(()=>page.locator('.reaction-review').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
 expect(await page.locator('.poker-felt').innerHTML()).toBe(cards);
 expect(wagers).toBe(0);
 expect(await page.locator('#balance').textContent()).toBe(balance);
});

for(const action of ['close','character'] as const) test(`late feature response cannot override ${action}`,async({page})=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/feature-gallery',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#help').click();await page.locator('#rare-animation-gallery').click();
 const requested=page.waitForRequest('**/api/feature-gallery');
 await page.locator('[data-feature-preview="awaken-3"]').click();await requested;
 if(action==='close')await page.locator('#close-modal').click();
 else await page.locator('[data-character-preview="5"]').click();
 const responded=page.waitForResponse('**/api/feature-gallery');release();await responded;
 await page.waitForTimeout(150);
 await expect(page.locator('#spectacle')).toBeHidden();
 if(action==='character') await expect(page.locator('.reaction-review')).toBeVisible();
 else await expect(page.locator('#modal')).not.toBeVisible();
});
