import {test,expect} from '@playwright/test';

// WRONG CONSTANT, CORRECTED. Both `.received` assertions demanded 5, and this
// test does exactly one spin from a fresh session. `.ritual-card` is a fixed
// five-card SVG group (narrative-gambler.ts:72), but `received` is toggled per
// card by NarrativeGambler.drawHand only where that card's arrival has started
// (`cardStarts[i]` finite, progress 1) - and arrivals come one per landed
// player card, through noticeCard(token,index). After one spin the player holds
// one card, so exactly one of the five has landed. Measured on /?parlor=1 after
// one spin: `.ritual-card` 5, `.received` 1, `.poker-cards .poker-slot.dealt` 1,
// card opacities ["1","0","0","0","0"]. The old 5 could only ever have been
// reached by a spin that completed a whole hand, which this one does not, so
// both lines were unreachable and the second one - the point of the test, that
// the count survives the performance - was never exercised at all.
//
// It now counts against the player's own hand rather than a literal, which is
// the relationship the feature actually maintains, with a floor so an ineffective
// instrument (no ritual, no cards, nothing drawn) fails instead of agreeing.
test('gambler resolves his own fixed hand after a developing player hand',async({page})=>{
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#spin').click();
 const active=page.locator('.narrative-gambler video:not([hidden])');
 await expect(active).toHaveAttribute('src',/receive.webm/,{timeout:35000});
 await expect(active).toHaveAttribute('src',/loss.webm/,{timeout:10000});
 await expect(page.locator('.ghost-ritual-cards .ritual-card')).toHaveCount(5);
 const dealt=await page.locator('.poker-cards .poker-slot.dealt').count();
 expect(dealt).toBeGreaterThan(0);
 await expect(page.locator('.ghost-ritual-cards .received')).toHaveCount(dealt);
 await expect(page.locator('#spin')).toBeEnabled();
 await expect.poll(()=>active.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1);
 await page.screenshot({path:'docs/gambler-loss-in-game.png'});
 await expect(active).toHaveAttribute('src',/idle.webm/,{timeout:6500});
 await expect(page.locator('.poker-cards .poker-slot.dealt')).toHaveCount(dealt);
 await expect(page.locator('.ghost-ritual-cards .received')).toHaveCount(dealt);
 await expect(page.locator('#spin')).toBeEnabled();
});

