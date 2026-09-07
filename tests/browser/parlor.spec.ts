import {initialState} from '../../src/engine/engine';
import { test, expect } from '@playwright/test';
test('parlor film leaves reels and player hand independent of the background ritual',async({page})=>{
 await page.setViewportSize({width:1672,height:941});
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 const board=await page.locator('.cabinet').boundingBox();
 expect(Math.abs(board!.x-543)).toBeLessThan(1);
 expect(Math.abs(board!.width-585)).toBeLessThan(1);
 const cells=await page.locator('.reels').boundingBox();
 expect(Math.abs(cells!.y-190)).toBeLessThan(2);
 expect(Math.abs(cells!.height-535)).toBeLessThan(2);
 await expect(page.locator('.ghost-porch.right video').first()).toHaveAttribute('src',/parlor-maidens-v1/);
 const ghost=page.locator('.narrative-gambler');
 const gb=await ghost.boundingBox();
 expect(gb!.x).toBeGreaterThan(board!.x+board!.width);
 await page.locator('#spin').click();
 await expect(page.locator('#spin-label')).toHaveText('SPIN');
 await expect(page.locator('.player-play-space .dealt')).toHaveCount(1);
 const hand=await page.locator('.player-play-space').boundingBox();
 const controls=await page.locator('.controls').boundingBox();
 expect(hand!.y).toBeGreaterThan(controls!.y+controls!.height);
 await expect(page.locator('#spectacle')).toBeHidden({timeout:15000});
 await page.screenshot({path:'docs/parlor-assembled-review.png',fullPage:true});
});




for(const viewport of [{width:1440,height:1000},{width:1920,height:900},{width:800,height:1000}]) {
 test(`parlor preserves reference aspect at ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport); await page.goto('/?parlor=1');
  const stage=await page.locator('.parlor-stage').boundingBox();
  const board=await page.locator('.reels').boundingBox();
  expect(Math.abs(stage!.width/stage!.height-1672/941)).toBeLessThan(.002);
  expect(Math.abs((board!.x-stage!.x)/stage!.width-543/1672)).toBeLessThan(.003);
  expect(Math.abs((board!.y-stage!.y)/stage!.width-190/1672)).toBeLessThan(.003);
  expect(stage!.width).toBeLessThanOrEqual(viewport.width);
  expect(stage!.height).toBeLessThanOrEqual(viewport.height);
 });
}

test('parlor residents keep independent native clocks and reveal the quiet hand',async({page})=>{
 await page.setViewportSize({width:1672,height:941});
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 const clips=page.locator('.ghost-porch video,.parlor-exterior-residents video,.parlor-foreground-fog');
 await expect.poll(()=>clips.evaluateAll(es=>es.every(e=>(e as HTMLVideoElement).readyState>=2))).toBe(true);
 const first=await clips.evaluateAll(es=>es.map(e=>(e as HTMLVideoElement).currentTime));
 await page.waitForTimeout(1200);
 const next=await clips.evaluateAll(es=>es.map(e=>(e as HTMLVideoElement).currentTime));
 expect(next.every((t,i)=>t!==first[i])).toBe(true);
 await expect(page.locator('.ghost-ritual-cards')).toHaveClass(/visible/,{timeout:35000});
 await expect(page.locator('.ritual-card.received')).toHaveCount(5);
 await expect(page.locator('#spin')).toBeEnabled();
 await page.screenshot({path:'docs/parlor-ritual-review.png'});
});


test('Witching Hour uses the matching colored room without moving the board',async({page})=>{
 await page.setViewportSize({width:1672,height:941});
 await page.route('**/api/session',r=>r.fulfill({json:{state:{...initialState(),phase:'witching',witchSpins:6},lastResult:null}}));
 await page.goto('/?parlor=1');
 await expect(page.locator('#phase')).toContainText('Witching');
 const film=page.locator('.parlor-environment:not([hidden])');
 await expect(film).toHaveAttribute('src',/environment-color-night.mp4/);
 await expect.poll(()=>film.evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(1);
 const board=await page.locator('.reels').boundingBox();
 expect(Math.abs(board!.y-190)).toBeLessThan(2);
 await page.screenshot({path:'docs/parlor-night-review.png'});
});





