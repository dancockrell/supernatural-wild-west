import {test,expect} from '@playwright/test';
test('gambler advances through distinct native idles without a blank handoff',async({page})=>{
 await page.goto('/?parlor=1');
 const shown=page.locator('.narrative-gambler video:not([hidden])');
 await expect.poll(()=>shown.getAttribute('src'),{timeout:20000}).toContain('gambler-brim');
 await expect.poll(()=>shown.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.8);
 await page.screenshot({path:'docs/gambler-expanded-idle-review.png'});
 await expect.poll(()=>shown.getAttribute('src'),{timeout:16000}).toContain('gambler-knuckle');
 await expect.poll(()=>shown.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(2);
 expect(await shown.evaluate((v:HTMLVideoElement)=>v.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(8);
 await page.screenshot({path:'docs/gambler-knuckle-runtime-review.png'});
});
test('condemned reaches new palms idle on his independent cycle',async({page})=>{
 await page.goto('/?parlor=1');
 const shown=page.locator('.parlor-exterior-residents .condemned video');
 await expect.poll(()=>shown.getAttribute('src'),{timeout:35000}).toContain('condemned-palms');
 await expect.poll(()=>shown.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.5);
 expect(await shown.evaluate((v:HTMLVideoElement)=>v.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(8);
});

for(const [name,selector,clip] of [
 ['lantern fringe','.boundary-cast .ghost-porch.left video','queen-fringe'],
 ['condemned cold','.parlor-exterior-residents .condemned video','condemned-cold'],
 ['rider snort','.parlor-exterior-residents .rider video','rider-snort'],
 ['rider pat','.parlor-exterior-residents .rider video','rider-pat'],
] as const){
 test(`${name} plays its new native idle`,async({page})=>{
  await page.goto('/?parlor=1');
  const shown=page.locator(selector);
  await expect.poll(()=>shown.getAttribute('src'),{timeout:48000}).toContain(clip);
  await expect.poll(()=>shown.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.5);
  expect(await shown.evaluate((v:HTMLVideoElement)=>v.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(8);
  await page.screenshot({path:`docs/${clip}-runtime-review.png`});
 });
}
