import {test,expect} from '@playwright/test';
import {initialState} from '../../src/engine/engine';

for (const width of [688,1672]) test(`player cards remain inside their slots at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:941});
 await page.route('**/api/session',r=>r.fulfill({json:{state:{...initialState(),poker:{cards:[36,25,32],bet:100}},lastResult:null}}));
 await page.goto('/?parlor=1');
 await expect(page.locator('.player-play-space .dealt')).toHaveCount(3);
 const rail=await page.locator('.controls').boundingBox();
 const cards=page.locator('.player-play-space .dealt .playing-card');
 let right=0;
 for(let i=0;i<3;i++) {
  const card=await cards.nth(i).boundingBox();
  const slot=await page.locator('.player-play-space .dealt').nth(i).boundingBox();
  expect(card!.y).toBeGreaterThan(rail!.y+rail!.height);
  expect(card!.x).toBeGreaterThan(right);
  expect(Math.abs(card!.width-slot!.width)).toBeLessThan(1);
  right=card!.x+card!.width;
 }
 await page.locator('.player-play-space').screenshot({path:`docs/player-hand-scale-${width}.png`});
});

