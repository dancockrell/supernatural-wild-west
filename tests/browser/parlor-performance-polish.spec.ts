import {test,expect} from '@playwright/test';
import {preview} from './preview';

test('Witching Hour uses its three-second spirit action',async({page})=>{
 await page.goto('/?parlor=1');
 await preview(page,'witch');
 const clip=page.locator('.feature-stage video');
 await expect(clip).toHaveAttribute('src',/feature-performances-v1\/witch-summon.webm/);
 await expect.poll(()=>clip.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
 expect(await clip.evaluate((v:HTMLVideoElement)=>v.duration)).toBeCloseTo(3,1);
 await page.waitForTimeout(900);
 await page.screenshot({path:'docs/witch-summon-in-game.png'});
 await expect(page.locator('#spectacle')).toBeHidden({timeout:4000});
});

test('gambler never exposes a seeking frame across idle and receive',async({page})=>{
 await page.goto('/?parlor=1');
 await expect.poll(()=>page.locator('.narrative-gambler video').evaluateAll(vs=>vs.every(v=>(v as HTMLVideoElement).readyState>=2))).toBe(true);
 const sample=await page.evaluate(()=>new Promise<{gaps:number,receive:boolean,idles:number}>(resolve=>{
  const start=performance.now();let gaps=0,receive=false;const idles=new Set<Element>();
  const frame=()=>{
   const shown=[...document.querySelectorAll<HTMLVideoElement>('.narrative-gambler video')].filter(v=>!v.hidden);
   if(shown.length!==1||shown.some(v=>v.seeking||v.readyState<2))gaps++;
   for(const v of shown)if(v.src.includes('receive'))receive=true;else idles.add(v);
   if(performance.now()-start<30000)requestAnimationFrame(frame);else resolve({gaps,receive,idles:idles.size});
  };frame();
 }));
 expect(sample).toEqual({gaps:0,receive:true,idles:2});
 await expect(page.locator('#spin')).toBeEnabled();
});

test('gambler notices a completed round at the next idle boundary',async({page})=>{
 await page.goto('/?parlor=1');
 await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#spin').click();
 await expect(page.locator('#spin-label')).toHaveText('SPIN');
 const active=page.locator('.narrative-gambler video:not([hidden])');
 await expect(active).toHaveAttribute('src',/idle.webm/);
 await expect(active).toHaveAttribute('src',/notice.webm/,{timeout:12000});
 await expect(page.locator('#spin')).toBeEnabled();
 await page.screenshot({path:'docs/gambler-notice-in-game.png'});
 await expect(active).toHaveAttribute('src',/idle.webm/,{timeout:6000});
});
