import {test,expect} from '@playwright/test';

test('a real card arrival queues a seven-second native gambler receive at its idle boundary',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:3840,height:2160});
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  // Observe genuine media endings without seeking or dispatching artificial boundaries.
  await page.evaluate(()=>{
    const endings:Array<{src:string;time:number;duration:number;trusted:boolean;at:number}>=[];
    Object.assign(window,{gamblerNativeEndings:endings});
    document.addEventListener('ended',event=>{
      const v=event.target;
      if(v instanceof HTMLVideoElement && v.closest('.narrative-gambler'))
        endings.push({src:v.src,time:v.currentTime,duration:v.duration,trusted:event.isTrusted,at:performance.now()});
    },true);
  });
  const cards=page.locator('.ghost-ritual-cards');
  // No forced outcome: a fresh fixture session normally yields a card on its first spin.
  // A no-card spin may be followed by another, until the actual arrival path runs.
  let sawCard=false;
  for(let attempt=0;attempt<3 && !sawCard;attempt++){
    const response=page.waitForResponse(r=>r.url().endsWith('/api/spin')&&r.request().method()==='POST');
    await page.locator('#spin').click();
    expect((await response).ok()).toBe(true);
    try { await expect(cards).toHaveAttribute('data-arrival',/.+/,{timeout:12000});sawCard=true; }
    catch { await expect(page.locator('#spin')).toBeEnabled(); }
  }
  expect(sawCard,'an actual player-card flight must notify the gambler').toBe(true);
  const receive=page.locator('.narrative-gambler video[src="/video/parlor-gambler-native-v2/receive.webm"]');
  await expect(receive).toHaveCount(1);
  await expect(receive).toBeVisible({timeout:25000});
  await expect.poll(()=>receive.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.3);
  const before=await receive.evaluate((v:HTMLVideoElement)=>({
    t:v.currentTime,duration:v.duration,nativeWidth:v.videoWidth,nativeHeight:v.videoHeight,
    displayWidth:v.getBoundingClientRect().width,displayHeight:v.getBoundingClientRect().height,
    total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames,
    endings:(window as any).gamblerNativeEndings,
  }));
  expect(before.duration).toBeGreaterThanOrEqual(7);
  expect(before.duration).toBeLessThan(7.2);
  expect(before.nativeWidth).toBeGreaterThanOrEqual(before.displayWidth);
  expect(before.nativeHeight).toBeGreaterThanOrEqual(before.displayHeight);
  expect(before.endings.some((e:{trusted:boolean;src:string;time:number;duration:number})=>
    e.trusted && /(?:idle|gambler-brim|gambler-knuckle)\.webm$/.test(e.src) && e.time>=e.duration-.05,
  )).toBe(true);
  await page.waitForTimeout(2500);
  const after=await receive.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,hidden:v.hidden,total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}));
  expect(after.hidden).toBe(false);
  expect(after.t-before.t).toBeGreaterThan(1.8);
  expect(after.total-before.total).toBeGreaterThan(35);
  expect((after.dropped-before.dropped)/Math.max(1,after.total-before.total)).toBeLessThan(.15);
  await page.screenshot({path:'docs/gambler-native-receive-4k-runtime.png'});
  await expect(receive).toBeHidden({timeout:7000});
  console.log('gambler native receive',JSON.stringify({before,after}));
});
