import {test, expect} from '@playwright/test';

test('colored residents alternate complete native films independently', async ({page}) => {
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  await Promise.all(['left','right'].map(async side => {
    const video = page.locator(`.ghost-porch.${side} video`);
    const original = await video.elementHandle();
    await expect(video).toHaveAttribute('src', /-alternate.webm$/, {timeout:16000});
    const boundary = await original!.evaluate(v => {
      const film = v as HTMLVideoElement;
      return {time:film.currentTime, duration:film.duration};
    });
    expect(Math.abs(boundary.time-boundary.duration)).toBeLessThan(.1);
    await expect.poll(() => video.evaluate(v => {
      const film = v as HTMLVideoElement;
      return !film.paused && film.currentTime > .1 && film.playbackRate === 1;
    })).toBe(true);
    await expect(video).toHaveAttribute('src', /\/[^/]+-idle.webm$/, {timeout:15000});
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  }));
  await expect(page.locator('#spin')).toBeEnabled();
});
