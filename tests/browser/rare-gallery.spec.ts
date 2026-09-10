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
 await expect(page.locator('[data-hand-preview]')).toHaveCount(10);
 await expect(page.locator('[data-character-preview]')).toHaveCount(30);
 await page.screenshot({path:'docs/rare-animation-gallery.png'});
 await page.locator('[data-feature-preview="awaken-3"]').click();
 await expect(page.locator('.feature-stage video')).toHaveAttribute('src','/video/feature-performances-v2/mine.webm');
 await page.locator('#return-animation-gallery').click();
 await expect(page.locator('#spectacle')).toBeHidden();
 await page.locator('[data-hand-preview="Two pair"]').click();
 await expect(page.locator('.poker-guest video')).toHaveAttribute('src','/video/hand-performances-v3/two-pair.webm');
 await page.locator('#return-animation-gallery').click();
 await expect(page.locator('.poker-guest')).toHaveCount(0);
 // STALE POSITIONAL SELECTORS, CORRECTED (both here and at the condemned ghost
 // below). [data-character-preview="N"] is an index into the gallery's own
 // list, and that list has grown: slot 4 is now the mounted ghost's jackpot
 // Easter egg and the gambler's loss clip sits at 2. Same drift, same fix as
 // tests/browser/rare-repaired.spec.ts already took - every one of these
 // buttons has a stable name, so ask for it by name.
 await page.getByRole('button',{name:'Gambler · loses again',exact:true}).click();
 await expect(page.locator('.reaction-review')).toHaveAttribute('src','/video/parlor-gambler-native-v2/loss.webm');
 await page.locator('#back-to-rare-animations').click();
 // STALE LABEL, CORRECTED. There is no 'neck' button; the clip
 // parlor-idles-v2/medium-neck.webm is presented as 'inclines her head'
 // (src/client/main.ts:1035-1038 pairs the labels with the media list).
 await page.getByRole('button',{name:'Brazier maiden - inclines her head',exact:true}).click();
 await expect(page.locator('.reaction-review')).toHaveAttribute('src','/video/parlor-idles-v2/medium-neck.webm');
 // STALE ASSERTION, CORRECTED. This required `resident-soft-rim` on a maiden
 // preview. It cannot be there: showAnimationPreview() sets style.filter='none'
 // on exactly the Lantern and Brazier maiden previews (src/client/main.ts:1084)
 // - the deliberate "no added shading on the two women" decision that
 // women-no-effects.spec.ts exists to hold. Assert the decision instead.
 expect(await page.locator('.reaction-review').evaluate(e=>getComputedStyle(e).filter)).toBe('none');
 await page.locator('#back-to-rare-animations').click();
 await page.getByRole('button',{name:'Condemned ghost · $1,000 Easter egg',exact:true}).click();
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
