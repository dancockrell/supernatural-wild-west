import {test,expect} from '@playwright/test';
import {preview} from './preview';

// STALE CLIP, CORRECTED. This required Witching Hour to be the brazier maiden's
// short room reaction (parlor-maidens-v1/medium-reaction.webm, ~4s) and to be
// gone within 4s. Two separate decisions moved past that. a708b73 gave the
// scene its own dedicated film - cinematics.ts:110-115 sets
// /video/feature-performances-v2/witch.webm for kind 'witch', after and over
// the resident-media assignment above it - and the maiden's own win reaction
// itself moved to /video/rare-features-v4/medium-reaction.webm (resident-media.ts:8),
// so neither half of the old expectation names anything the product still has.
// Measured: feature-performances-v2/witch.webm, 8.084s.
//
// witch-feature-review.spec.ts owns the 4K upscaling and full-length review of
// this same film. What this keeps is the default-viewport in-game pass: the
// right film, framed inside the window, closing on its own.
test('Witching Hour uses the dedicated native performance',async({page})=>{
 await page.goto('/?parlor=1');
 await preview(page,'witch');
 const clip=page.locator('.feature-stage video');
 await expect(clip).toHaveAttribute('src','/video/feature-performances-v2/witch.webm');
 await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
 expect(await clip.evaluate((v:HTMLVideoElement)=>v.duration)).toBeCloseTo(8.08,1);
 const box=await clip.evaluate((v:HTMLVideoElement)=>{const r=v.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};});
 expect(box.w).toBeGreaterThan(100);
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(box.vw);
 expect(box.bottom).toBeLessThanOrEqual(box.vh+1);
 await page.waitForTimeout(900);
 await page.screenshot({path:'docs/witch-summon-in-game.png'});
 // 8.084s film; the overlay closes 250ms after `ended` (main.ts:301) and the
 // no-progress watchdog on the same path is 15000ms, so this still reds on a
 // performance that never finishes.
 await expect(page.locator('#spectacle')).toBeHidden({timeout:12000});
});

test('gambler never exposes a seeking frame across idle and receive',async({page})=>{
 await page.goto('/?parlor=1');
 await expect.poll(()=>page.locator('.narrative-gambler video').evaluateAll(vs=>vs.every(v=>(v as HTMLVideoElement).readyState>=2))).toBe(true);
 await page.locator('#spin').click();
 const sample=await page.evaluate(()=>new Promise<{gaps:number,receive:boolean,idles:number}>(resolve=>{
  const start=performance.now();let gaps=0,receive=false;const idles=new Set<Element>();
  const frame=()=>{
   const shown=[...document.querySelectorAll<HTMLVideoElement>('.narrative-gambler video')].filter(v=>!v.hidden);
   if(shown.length!==1||shown.some(v=>v.seeking||v.readyState<2))gaps++;
   for(const v of shown)if(v.src.includes('receive'))receive=true;else idles.add(v);
   if(performance.now()-start<30000)requestAnimationFrame(frame);else resolve({gaps,receive,idles:idles.size});
  };frame();
 }));
 // idles was pinned to exactly 2. The gambler advances his idle rotation on
 // each clip's own 'ended' event (src/client/narrative-gambler.ts), not a
 // fixed timer, so how many distinct idles land inside this 30s window
 // depends on how fast the page around him loads and buffers - which is
 // exactly what got faster on 10 Sep 2026 (scripts/reencode-video.mjs, 67%
 // smaller media). Measured: 3 idles now, consistently, on the exact same
 // gambler clip bytes (confirmed byte-identical against pre-reencode git
 // history) - a real timing shift from faster loading elsewhere on the
 // page, not a regression in the gambler himself. The properties that
 // actually matter are unchanged: no seeking frame ever shown, and the
 // receive clip plays. Asserting an exact idle count coupled this test to
 // how slowly the page used to load, which was never the point.
 expect(sample.gaps).toBe(0);
 expect(sample.receive).toBe(true);
 expect(sample.idles).toBeGreaterThanOrEqual(2);
 await expect(page.locator('#spin')).toBeEnabled();
});

test('gambler notices a developing hand at the next idle boundary',async({page})=>{
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#spin').click();
 await expect(page.locator('#spin-label')).toHaveText('SPIN');
 const active=page.locator('.narrative-gambler video:not([hidden])');
 await expect(active).toHaveAttribute('src',/idle.webm/);
 await expect(active).toHaveAttribute('src',/receive.webm/,{timeout:12000});
 await expect(page.locator('#spin')).toBeEnabled();
 await page.screenshot({path:'docs/gambler-notice-in-game.png'});
 await expect(active).toHaveAttribute('src',/idle.webm/,{timeout:16000});
});

