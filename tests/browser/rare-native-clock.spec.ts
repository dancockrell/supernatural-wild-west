import {test,expect} from '@playwright/test';

test('rare native film owns fog and caption through buffering, seeking and gallery replacement',async({page})=>{
 await page.addInitScript(()=>{
  const state={armed:[] as number[],cleared:[] as number[]};
  (window as unknown as {rareWatchdog:typeof state}).rareWatchdog=state;
  const arm=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
  window.setTimeout=((fn:TimerHandler,delay?:number,...args:unknown[])=>{const id=arm(fn,delay,...args);if(delay===15000)state.armed.push(id);return id;}) as typeof window.setTimeout;
  window.clearTimeout=((id?:number)=>{if(id!==undefined&&state.armed.includes(id))state.cleared.push(id);clear(id);}) as typeof window.clearTimeout;
 });
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 const balance=await page.locator('#balance').textContent();
 await page.locator('#help').click();await page.getByRole('button',{name:'Review rare animations'}).click();
 await page.locator('[data-feature-preview="fortune"]').click();
 const video=page.locator('.feature-stage video');
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:18000}).toBeGreaterThan(.3);
 const seek=async(time:number)=>video.evaluate(async(v:HTMLVideoElement,time)=>{v.pause();await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=time;});},time);
 const frame=()=>page.locator('.feature-stage').evaluate(e=>({
  video:(e.querySelector('video') as HTMLElement).style.opacity,
  fog:(e.querySelector('.performance-fog') as HTMLElement).getAttribute('style'),
  caption:document.querySelector('.spectacle-card')!.getAnimations().map(a=>({time:a.currentTime,state:a.playState})),
 }));
 await seek(.15);const entrance=await frame();expect(Number(entrance.video)).toBeGreaterThan(0);expect(Number(entrance.video)).toBeLessThan(1);
 expect(entrance.caption[0].state).toBe('paused');await page.waitForTimeout(650);expect(await frame()).toEqual(entrance);
 const timersBefore=await page.evaluate(()=>(window as unknown as {rareWatchdog:{armed:number[]}}).rareWatchdog.armed.slice());
 await seek(2);const settled=await frame();expect(Number(settled.video)).toBe(1);
 const timersAfter=await page.evaluate(()=>(window as unknown as {rareWatchdog:{armed:number[];cleared:number[]}}).rareWatchdog);
 expect(timersAfter.armed.length).toBeGreaterThan(timersBefore.length);
 expect(timersAfter.cleared).toContain(timersBefore[timersBefore.length-1]);
 await seek(.15);expect(await frame()).toEqual(entrance);
 const duration=await video.evaluate((v:HTMLVideoElement)=>v.duration);await seek(duration-.25);
 const departure=await frame();expect(Number(departure.video)).toBeGreaterThan(0);expect(Number(departure.video)).toBeLessThan(1);
 await page.locator('#return-animation-gallery').click();await expect(page.locator('#spectacle')).toBeHidden();
 await page.locator('[data-feature-preview="brand"]').click();await expect(page.locator('.rare-glyph-brand')).toBeVisible();await expect(video).toHaveCount(0);
 await page.locator('#return-animation-gallery').click();expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
});
