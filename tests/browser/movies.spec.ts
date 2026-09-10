import {test,expect} from '@playwright/test';
import {initialState,resolveSpin} from '../../src/engine/engine';
import {SeededRng} from '../../src/engine/rng';

// NON-EXISTENT SELECTOR, DROPPED. Both tests here counted
// `.boundary-cast video,.dealer-stage video` and required 3, and asserted a
// `.dealer-stage video` carrying data-movie="gambler" from a `gambler-v1`
// source. `.dealer-stage` is never applied to anything: `git grep dealer-stage`
// over the whole history finds it only in player-ui.css and in test files, and
// measured at runtime it is 0 elements on both `/` and `/?parlor=1`. The
// ambient lead cast on `/` is the two boundary residents (queen and medium),
// which is what these tests can actually observe - the gambler exists only in
// the parlor scene, as `.narrative-gambler`, and is covered by
// parlor-performance-polish.spec.ts and the gambler-*.spec.ts files. Named for
// two rather than being quietly widened, so nobody reads a pass here as
// evidence a third lead is on screen.
test('two independently phased movie leads, moving mine and sky survive idle and a spin',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 const before=initialState();const result=resolveSpin(before,100,new SeededRng(12),'movie-spin');
 await page.route('**/api/session',r=>r.fulfill({json:{state:before,lastResult:null}}));
 await page.route('**/api/spin',r=>r.fulfill({json:result}));
 await page.goto('/');
 const cast=page.locator('.boundary-cast video');
 await expect(cast).toHaveCount(2);
 expect((await cast.evaluateAll(v=>v.map(el=>(el as HTMLVideoElement).dataset.movie))).sort()).toEqual(['medium','queen']);
 await expect.poll(()=>cast.evaluateAll(v=>v.every(el=>!(el as HTMLVideoElement).paused&&(el as HTMLVideoElement).readyState>=2))).toBe(true);
 const times=await cast.evaluateAll(v=>v.map(el=>(el as HTMLVideoElement).currentTime));
 expect(Math.max(...times)-Math.min(...times)).toBeGreaterThan(.5);
 expect(await page.locator('.boundary-cast .ghost-porch').first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(150);
 await expect(page.locator('.gold canvas[data-ready="true"]').first()).toBeVisible();
 // BLIND INSTRUMENT, REPLACED. This read `#frontier` with toDataURL(). That
 // canvas is WebGL, created without preserveDrawingBuffer
 // (src/client/frontier-framing.ts:26), so toDataURL() reads a cleared buffer:
 // measured, six samples a second apart were byte-identical 42,590-character
 // PNGs while the film was plainly running, so the old assertion was comparing
 // one blank image against another. A compositor screenshot of the same region
 // sees the real pixels - measured, 4 of 4 samples distinct - and is confirmed
 // sky-dependent by sabotage: with FrontierScene.paint disabled this clip stops
 // changing and this line reds.
 //
 // Polled rather than sampled once after a fixed wait, because the plate only
 // advances after the environment loop decodes (scene.ts:62 returns early below
 // readyState 2) and that video is never in the DOM, so there is nothing to
 // await on directly.
 const sky=async()=>(await page.screenshot({clip:{x:600,y:0,width:240,height:200}})).toString('base64');
 const first=await sky();
 await expect.poll(sky,{timeout:15000}).not.toBe(first);
 await page.screenshot({path:'docs/screenshots/living-cast-1440.png'});
 const start=Date.now();await page.locator('#spin').click();
 await expect(page.locator('#spin-label')).toHaveText('SPIN',{timeout:10000});
 expect(Date.now()-start).toBeGreaterThanOrEqual(2450);
 await expect.poll(()=>cast.evaluateAll(v=>v.every(el=>!(el as HTMLVideoElement).paused))).toBe(true);
});
test('reduced motion pauses movies while retaining both visible leads',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.locator('.boundary-cast video')).toHaveCount(2);
 await expect.poll(()=>page.locator('.boundary-cast video').evaluateAll(v=>v.length>0&&v.every(el=>(el as HTMLVideoElement).paused))).toBe(true);
});
