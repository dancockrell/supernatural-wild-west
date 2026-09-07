import {test,expect} from '@playwright/test';
for(const width of [3840,1440,390])test(`hand typography shows exact awards and stays inside stage at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===3840?2160:1000});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 const balance=await page.locator('#balance').textContent();
 await page.evaluate(()=>{document.querySelector<HTMLElement>('.poker-award')!.dataset.amount='100000000';document.querySelector('.player-play-space')!.dispatchEvent(new CustomEvent('hand-award',{detail:'Three of a kind'}));});
 const title=page.locator('.hand-marquee');await expect(title).toHaveClass(/paid-reveal/,{timeout:15000});
 await expect(title.locator('.hand-marquee-name')).toHaveText('Three of a kind');await expect(title.locator('.hand-marquee-payout')).toHaveText('1,000,000.00 CR');
 const bounds=await title.evaluate(e=>{const r=e.getBoundingClientRect(),c=document.querySelector('.controls')!.getBoundingClientRect();return {bottom:r.bottom,controls:c.top,clipped:[...e.children].some(x=>x.scrollWidth>x.clientWidth+1),width:r.width};});expect(bounds.bottom).toBeLessThan(bounds.controls);expect(bounds.clipped).toBe(false);
 await page.screenshot({path:`docs/hand-typography-${width}.png`});
 await page.evaluate(()=>document.querySelector('.player-play-space')!.dispatchEvent(new Event('hand-reset')));await expect(title).toHaveCount(0);
 await page.evaluate(()=>{document.querySelector<HTMLElement>('.poker-award')!.dataset.amount='0';document.querySelector('.player-play-space')!.dispatchEvent(new CustomEvent('hand-award',{detail:'High card'}));});
 await expect(title.locator('.hand-marquee-payout')).toHaveText('NO PAYOUT · NEXT HAND AWAITS');await expect(title).toHaveAttribute('data-result','unpaid');
 expect(await page.locator('#balance').textContent()).toBe(balance);
});
test('gallery typography never reuses a paid hand amount',async({page})=>{
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();await page.evaluate(()=>document.querySelector<HTMLElement>('.poker-award')!.dataset.amount='100000000');
 await page.locator('#settings').click();await page.locator('.developer-tools summary').click();await page.locator('#animation-preview').click();await page.locator('[data-hand-preview="Royal flush"]').click();
 await expect(page.locator('.hand-marquee-payout')).toHaveText('PERFORMANCE PREVIEW');
});
