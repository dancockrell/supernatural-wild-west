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
 // This used to assert `.narrative-gambler`'s BOUNDING BOX started right of the
 // board. That stopped being the design on 7 Sep 2026: afc505c ("Stage both
 // women left and give gambler full right-side space") moved him from
 // left:80cqw/width:22.25cqw to left:65cqw/width:38cqw (now 64.7cqw), which
 // makes the box 635px wide starting at x=1081.8 while the board's right edge
 // is 1128.1 - a 46px overlap of *empty box*, and the test has failed on it
 // ever since. Measured in the running build: the opaque pixels of his active
 // clip start at frame x=154/960 (page x 1183.7) and the table plate's at
 // 304/1920 (page x 1182.4), so everything he draws still clears the reels by
 // ~55px. So assert the property the test is named for - the ritual never lands
 // on the reel board - against the ink rather than the box. Scanning the whole
 // video frame ignores the clip-path that hides its bottom half, which is
 // conservative: it can only over-report how far left his ink reaches.
 const ghost=page.locator('.narrative-gambler');
 await expect.poll(()=>ghost.evaluate(h=>[...h.querySelectorAll('video')].some(v=>!(v as HTMLVideoElement).hidden&&(v as HTMLVideoElement).readyState>=2))).toBe(true);
 const ink=await ghost.evaluate(host=>{
  let left=Infinity,right=-Infinity,opaque=0;
  const scan=(src:CanvasImageSource,iw:number,ih:number,rect:DOMRect)=>{
   const canvas=document.createElement('canvas');canvas.width=iw;canvas.height=ih;
   const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,iw,ih);ctx.drawImage(src,0,0,iw,ih);
   const data=ctx.getImageData(0,0,iw,ih).data;
   // object-fit:contain letterboxes the source inside the element rect.
   const scale=Math.min(rect.width/iw,rect.height/ih),originX=rect.x+(rect.width-iw*scale)/2;
   for(let y=0;y<ih;y++) for(let x=0;x<iw;x++) if(data[(y*iw+x)*4+3]>24){
    opaque++;
    left=Math.min(left,originX+x*scale);right=Math.max(right,originX+(x+1)*scale);
   }
  };
  for(const video of [...host.querySelectorAll('video')] as HTMLVideoElement[])
   if(!video.hidden && video.readyState>=2) scan(video,video.videoWidth,video.videoHeight,video.getBoundingClientRect());
  const plate=host.querySelector('img.gambler-table-plate') as HTMLImageElement|null;
  if(plate && plate.complete && plate.naturalWidth && getComputedStyle(plate).opacity!=='0')
   scan(plate,plate.naturalWidth,plate.naturalHeight,plate.getBoundingClientRect());
  return {left,right,opaque};
 });
 // Count the fragile thing: an undecoded or fully transparent frame would make
 // the edge test pass vacuously, so require that real ink was sampled first.
 expect(ink.opaque,'opaque gambler pixels sampled').toBeGreaterThan(50000);
 expect(ink.left,'gambler ink left edge vs board right edge').toBeGreaterThan(board!.x+board!.width);
 // He may overscan the stage, but nothing he draws may leave the window.
 expect(ink.right,'gambler ink right edge').toBeLessThanOrEqual(1672);
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
  // The stage used to be required to fit entirely inside the viewport, which
  // is what made it letterbox to half the screen on an aspect-mismatched
  // window (49.8% black at 1390x1558, measured). It may now overscan and let
  // #app crop the outer art; what has to stay true is that it never shrinks
  // below the old fit-inside size, never overscans past the 1.2x cap, and
  // never pushes the game column or its controls off screen.
  const contain=Math.min(viewport.width,viewport.height*1672/941);
  expect(stage!.width).toBeGreaterThanOrEqual(contain-1);
  expect(stage!.width).toBeLessThanOrEqual(contain*1.2+1);
  // Overscan is horizontal only: cropping top or bottom cuts the title and the
  // player's hand, so the stage must always fit the viewport vertically.
  expect(stage!.height).toBeLessThanOrEqual(viewport.height+1);
  for(const selector of ['.game','.controls','.player-play-space','#help']) {
   const box=await page.locator(selector).boundingBox();
   expect(box!.x,`${selector} left edge`).toBeGreaterThanOrEqual(-1);
   expect(box!.x+box!.width,`${selector} right edge`).toBeLessThanOrEqual(viewport.width+1);
   expect(box!.y,`${selector} top edge`).toBeGreaterThanOrEqual(-1);
   expect(box!.y+box!.height,`${selector} bottom edge`).toBeLessThanOrEqual(viewport.height+1);
  }
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
 // The quiet hand used to deal itself: the gambler played his `receive` clip on
 // every third idle cycle and drawHand() ran off that clip's own mediaTime,
 // revealing all five cards at t>=3.25s with nobody touching the game. That is
 // why this test waited 35s without spinning. It is no longer the design -
 // e836ec3 ("Polish character blending and synchronize hand reactions and
 // awards") rewired the ritual to mirror the player's own poker hand, so it is
 // driven entirely by PokerTable -> scene.noticeCard(), one card per arrival,
 // and a page that is never spun reveals nothing. Waiting was therefore waiting
 // for something that can no longer happen. Play the hand out instead: measured
 // in the running build, `visible` appears with the first card and the fifth
 // `received` lands when the player's hand fills, at spin 10 / 23s (a card
 // arrives only on a spin that lands a dust symbol, so the spin count varies).
 test.setTimeout(120000);
 for(let spin=1;spin<=30;spin++){
  await page.locator('#spin').click();
  await expect(page.locator('#spin')).toBeEnabled({timeout:30000});
  if(await page.locator('.player-play-space .dealt').count()===5) break;
 }
 await expect(page.locator('.player-play-space .dealt'),'the player hand filled').toHaveCount(5);
 await expect(page.locator('.ghost-ritual-cards')).toHaveClass(/visible/,{timeout:15000});
 await expect(page.locator('.ritual-card.received')).toHaveCount(5,{timeout:15000});
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





