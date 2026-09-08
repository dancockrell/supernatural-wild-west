import { test, expect } from '@playwright/test';

test('lantern acting keeps its stage placement through a full native idle cycle', async ({page}) => {
  test.setTimeout(65000);
  await page.setViewportSize({width:3840,height:2160});
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  const actor = page.locator('.ghost-porch.left video[data-movie="queen"]');
  const original = await actor.boundingBox();
  for (const name of ['alternate','character-idle','idle']) {
    await expect(actor).toHaveAttribute('src',new RegExp(`queen-${name}\\.webm$`),{timeout:20000});
    await expect.poll(()=>actor.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:5000}).toBeGreaterThan(1.4);
    expect(await actor.boundingBox()).toEqual(original);
    await expect(page.locator('.ghost-porch.left canvas')).toHaveCount(0);
    await page.screenshot({path:`docs/lantern-native-${name}-4k.png`});
  }
  await expect(page.locator('.brazier-plume')).toHaveCount(0);
});


test('brazier acting completes its three-action cycle without changing stage size', async ({page}) => {
  test.setTimeout(65000);
  await page.setViewportSize({width:3840,height:2160});
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  const actor = page.locator('.ghost-porch.right video[data-movie="medium"]');
  const original = await actor.boundingBox();
  for (const name of ['alternate','character-idle','idle']) {
    await expect(actor).toHaveAttribute('src',new RegExp(`medium-${name}\\.webm$`),{timeout:25000});
    await expect.poll(()=>actor.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:5000}).toBeGreaterThan(2);
    expect(await actor.boundingBox()).toEqual(original);
    await expect(page.locator('.ghost-porch.right canvas')).toHaveCount(0);
    await page.screenshot({path:`docs/brazier-native-${name}-4k.png`});
  }
});
