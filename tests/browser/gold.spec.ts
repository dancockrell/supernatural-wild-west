import { test, expect } from '@playwright/test';
import { initialState, resolveSpin } from '../../src/engine/engine';
import { CONFIG } from '../../src/engine/config';

test('gold row lights exactly its five mines and leaves spin controls on screen', async ({page})=>{
 const before=initialState();
 const stops=CONFIG.strips.flatMap(strip=>[strip.indexOf('gold'),...Array(4).fill(strip.indexOf('dust'))]);
 const result=resolveSpin(before,100,{nextInt:max=>stops.length?stops.shift()!:max-1},'gold-row');
 expect(result.gold?.amount).toBe(500);
 await page.route('**/api/session',r=>r.fulfill({json:{state:before,lastResult:null}}));
 await page.route('**/api/spin',r=>r.fulfill({json:result}));
 await page.goto('/');
 await expect(page.locator('#spin')).toBeEnabled();
 expect(await page.locator('#spin').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
 await page.locator('#spin').click();
 await expect(page.locator('.gold-strike')).toHaveCount(5);
 expect(await page.locator('.gold-strike').evaluateAll(els=>els.every(el=>el.classList.contains('gold')))).toBe(true);
 await expect(page.locator('#spin-label')).toHaveText('SPIN');
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'docs/screenshots/gold-frontier-1440.png'});
});
