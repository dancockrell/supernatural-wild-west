import {test,expect} from '@playwright/test';
import {initialState,resolveSpin} from '../../src/engine/engine';
import {SeededRng} from '../../src/engine/rng';

test('three independently phased movie leads, moving mine and sky survive idle and a spin',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 const before=initialState();const result=resolveSpin(before,100,new SeededRng(12),'movie-spin');
 await page.route('**/api/session',r=>r.fulfill({json:{state:before,lastResult:null}}));
 await page.route('**/api/spin',r=>r.fulfill({json:result}));
 await page.goto('/');
 const cast=page.locator('.boundary-cast video,.dealer-stage video');
 await expect(cast).toHaveCount(3);
 await expect.poll(()=>cast.evaluateAll(v=>v.every(el=>!(el as HTMLVideoElement).paused&&(el as HTMLVideoElement).readyState>=2))).toBe(true);
 const times=await cast.evaluateAll(v=>v.map(el=>(el as HTMLVideoElement).currentTime));
 expect(Math.max(...times)-Math.min(...times)).toBeGreaterThan(.5);
 await expect(page.locator('.dealer-stage video')).toHaveAttribute('data-movie', 'gambler');
 await expect(page.locator('.dealer-stage video')).toHaveAttribute('src', /gambler-v1/);
 expect(await page.locator('.dealer-stage').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(150);
 await expect(page.locator('.gold canvas[data-ready="true"]').first()).toBeVisible();
 const sky=()=>page.locator('#frontier').evaluate(c=>(c as HTMLCanvasElement).toDataURL());
 const first=await sky();await page.waitForTimeout(1200);expect(await sky()).not.toBe(first);
 await page.screenshot({path:'docs/screenshots/living-cast-1440.png'});
 const start=Date.now();await page.locator('#spin').click();
 await expect(page.locator('#spin-label')).toHaveText('SPIN',{timeout:10000});
 expect(Date.now()-start).toBeGreaterThanOrEqual(2450);
 await expect.poll(()=>cast.evaluateAll(v=>v.every(el=>!(el as HTMLVideoElement).paused))).toBe(true);
});
test('reduced motion pauses movies while retaining three visible leads',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.locator('.boundary-cast video,.dealer-stage video')).toHaveCount(3);
 await expect.poll(()=>page.locator('.boundary-cast video,.dealer-stage video').evaluateAll(v=>v.every(el=>(el as HTMLVideoElement).paused))).toBe(true);
});
