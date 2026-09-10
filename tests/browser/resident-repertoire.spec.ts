import {test, expect} from '@playwright/test';

// The quiet variants each resident rotates through, in the order
// parlorResidentMedia() lists them (src/client/resident-media.ts) and
// ResidentSequence.nextIdle() steps them.
const quiet={left:['queen-fringe','queen-shiver'],right:['medium-turn','medium-neck']} as const;

test('colored residents alternate complete native films independently', async ({page}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    (window as any).__residentEnds=[];
    document.addEventListener('ended',event=>{
      const film=event.target as HTMLVideoElement;
      if(film.closest('.ghost-porch')) (window as any).__residentEnds.push({time:film.currentTime,duration:film.duration});
    },true);
  });
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  await Promise.all((['left','right'] as const).map(async side => {
    const video = page.locator(`.ghost-porch.${side} video`);

    await expect(video).toHaveAttribute('src', /-alternate.webm$/, {timeout:16000});
    await expect.poll(() => video.evaluate(v => {
      const film = v as HTMLVideoElement;
      return !film.paused && film.currentTime > .1 && film.playbackRate === 1;
    })).toBe(true);
    await expect(video).toHaveAttribute('src', /-(listen|whisper).webm$/, {timeout:15000});
    // STALE TIMEOUT, CORRECTED - and the rotation this walks is now asserted
    // rather than assumed. ResidentSequence.nextIdle() steps
    // [idle, alternate, character idle, ...quiet variants] in order, and 138a1b5
    // ("Restore both maidens full original animation repertoire") put two quiet
    // variants back into that list. So the film after listen/whisper is a
    // parlor-idles-v2 clip, not the idle: measured, the two quiet variants run
    // 7.125s each, so the return to idle lands about 14.3s after this point and
    // could not arrive inside the 7000ms this used to allow. Checking that the
    // quiet variants are visited on the way is what stops the budget below from
    // being a bare wait that a shortened repertoire would satisfy by accident.
    for(const variant of quiet[side])
      await expect(video).toHaveAttribute('src', `/video/parlor-idles-v2/${variant}.webm`, {timeout:20000});
    await expect(video).toHaveAttribute('src', /\/[^/]+-idle.webm$/, {timeout:20000});
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  }));
  const boundaries=await page.evaluate(()=>(window as any).__residentEnds as {time:number;duration:number}[]);
  expect(boundaries.length).toBeGreaterThan(0);
  for(const boundary of boundaries) expect(Math.abs(boundary.time-boundary.duration)).toBeLessThan(.1);
  await expect(page.locator('#spin')).toBeEnabled();
});
