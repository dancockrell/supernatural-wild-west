import {test, expect} from '@playwright/test';

test('colored residents alternate complete native films independently', async ({page}) => {
  await page.addInitScript(() => {
    (window as any).__residentEnds=[];
    document.addEventListener('ended',event=>{
      const film=event.target as HTMLVideoElement;
      if(film.closest('.ghost-porch')) (window as any).__residentEnds.push({time:film.currentTime,duration:film.duration});
    },true);
  });
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  await Promise.all(['left','right'].map(async side => {
    const video = page.locator(`.ghost-porch.${side} video`);

    await expect(video).toHaveAttribute('src', /-alternate.webm$/, {timeout:16000});
    await expect.poll(() => video.evaluate(v => {
      const film = v as HTMLVideoElement;
      return !film.paused && film.currentTime > .1 && film.playbackRate === 1;
    })).toBe(true);
    await expect(video).toHaveAttribute('src', /-(listen|whisper).webm$/, {timeout:15000});
    await expect(video).toHaveAttribute('src', /\/[^/]+-idle.webm$/, {timeout:7000});
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  }));
  const boundaries=await page.evaluate(()=>(window as any).__residentEnds as {time:number;duration:number}[]);
  expect(boundaries.length).toBeGreaterThan(0);
  for(const boundary of boundaries) expect(Math.abs(boundary.time-boundary.duration)).toBeLessThan(.1);
  await expect(page.locator('#spin')).toBeEnabled();
});
