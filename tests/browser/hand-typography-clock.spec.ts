import {test,expect} from '@playwright/test';

test('paid typography freezes with the film and reconstructs on seek; busted hand remains independent',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});
 let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 const balance=await page.locator('#balance').textContent();
 const start=async(rank:string,amount:number)=>page.evaluate(({rank,amount})=>{
  document.querySelector<HTMLElement>('.poker-award')!.dataset.amount=String(amount);
  document.querySelector('.player-play-space')!.dispatchEvent(new CustomEvent('hand-award',{detail:rank}));
 },{rank,amount});
 const video=page.locator('.poker-guest video');
 const seek=async(time:number)=>{
  await video.evaluate(async(v:HTMLVideoElement,time)=>{v.pause();await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=time;});},time);
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.seeking)).toBe(false);
 };
 const appearance=()=>page.locator('.hand-marquee').evaluate(e=>{
  const payout=e.querySelector('.hand-marquee-payout')!;
  return {vars:e.getAttribute('style'),title:getComputedStyle(e).transform,payout:getComputedStyle(payout).transform,opacity:getComputedStyle(payout).opacity,sheen:getComputedStyle(payout,'::after').left};
 });
 await start('Three of a kind',123456);
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:18000}).toBeGreaterThan(.5);
 await seek(1.7);const held=await appearance();await page.waitForTimeout(850);expect(await appearance()).toEqual(held);
 await expect(page.locator('.hand-marquee-payout')).toHaveText('1,234.56 CR');
 await seek(3);expect(await appearance()).not.toEqual(held);
 await seek(1.7);expect(await appearance()).toEqual(held);
 await page.screenshot({path:'docs/hand-award-native-stamp-4k.png'});
 await page.evaluate(()=>document.querySelector('.player-play-space')!.dispatchEvent(new Event('hand-reset')));
 await start('High card',0);await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:18000}).toBeGreaterThan(.5);
 await seek(3);await expect(page.locator('.busted-royal')).toHaveCount(1);
 await expect(page.locator('.hand-marquee-payout')).toHaveText('NO PAYOUT · NEXT HAND AWAITS');
 expect(await page.locator('.hand-marquee').evaluate(e=>getComputedStyle(e,'::after').content)).toBe('none');
 const cards=await page.locator('.busted-royal').evaluate(e=>e.innerHTML),unpaid=await appearance();
 await page.waitForTimeout(500);expect(await appearance()).toEqual(unpaid);expect(await page.locator('.busted-royal').evaluate(e=>e.innerHTML)).toBe(cards);
 await page.screenshot({path:'docs/hand-award-busted-typography-4k.png'});
 await page.evaluate(()=>document.querySelector('.player-play-space')!.dispatchEvent(new Event('hand-reset')));
 await expect(page.locator('.hand-marquee,.busted-royal')).toHaveCount(0);
 expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
});
