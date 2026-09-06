import {test, expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {initialState, resolveSpin} from '../../src/engine/engine';
import {SeededRng} from '../../src/engine/rng';

test('record active parlor timing through five fixture spins and a poker completion', async ({page}) => {
  const initial = initialState();
  let state = initial;
  const results = [100,19,21,37,52].map((seed,i) => {
    const result = resolveSpin(state,100,new SeededRng(seed),`timing-${i}`);
    state = result.state;
    return result;
  });
  let calls=0;
  await page.route('**/api/session',r=>r.fulfill({json:{state:initial,lastResult:null}}));
  await page.route('**/api/spin',r=>r.fulfill({json:results[calls++]}));
  await page.setViewportSize({width:1672,height:941});
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const samples:number[]=[];
    const started=performance.now();
    let previous=0,frame=0;
    const tick=(time:number)=>{
      if(previous)samples.push(time-previous);
      previous=time;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    (window as any).finishParlorSample=()=>{
      cancelAnimationFrame(frame);samples.sort((a,b)=>a-b);
      return {durationMs:performance.now()-started,frames:samples.length,
        medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],
        longestMs:samples.at(-1),over50ms:samples.filter(n=>n>50).length};
    };
  });
  for(let i=0;i<results.length;i++) {
    await page.locator('#spin').click();
    await expect(page.locator('#spin-label')).toHaveText('SPIN',{timeout:20000});
    await expect(page.locator('#spectacle')).toBeHidden({timeout:20000});
  }
  await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>(window as any).finishParlorSample());
  expect(calls).toBe(5);
  expect(results.at(-1)?.poker?.complete).toBe(true);
  writeFileSync('docs/parlor-active-playback-timing.json',JSON.stringify({
    scope:'Local headless desktop 1672x941; five isolated deterministic fixture spins, audio disabled. Not physical-device, long-session or all-feature coverage.',
    fixture:results.map((r,i)=>({fixtureIndex:i,payout:r.payout,pokerComplete:r.poker?.complete,events:r.events.map(e=>e.type)})),metrics,
  },null,2));
  expect(metrics.frames).toBeGreaterThan(0);
});
