import {test,expect} from '@playwright/test';
for(const [name,selector] of [['queen-fringe','.ghost-porch.left video'],['queen-shiver','.ghost-porch.left video'],['medium-turn','.ghost-porch.right video'],['medium-neck','.ghost-porch.right video']] as const){
 test(`${name} has native detail and continuous playback at 4K`,async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
  const v=page.locator(selector);await expect.poll(()=>v.getAttribute('src'),{timeout:65000}).toContain(name);
  await expect.poll(()=>v.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.5);
  const before=await v.evaluate((v:HTMLVideoElement)=>({src:v.src,t:v.currentTime,native:v.videoHeight,display:v.getBoundingClientRect().height,q:{total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}}));
  expect(before.native).toBeGreaterThanOrEqual(before.display);await page.waitForTimeout(2500);
  const after=await v.evaluate((v:HTMLVideoElement)=>({t:v.currentTime,q:{total:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}}));
  expect(after.t-before.t).toBeGreaterThan(1.8);
  const total=after.q.total-before.q.total,dropped=after.q.dropped-before.q.dropped;
  expect(dropped/Math.max(1,total)).toBeLessThan(.15);
  await page.screenshot({path:`docs/${name}-4k-runtime.png`});
  console.log(name,JSON.stringify({before,after}));
 });
}
