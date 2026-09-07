import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('registered daylight preserves native playback and phase presentation',async({page})=>{
 test.setTimeout(90000); await page.setViewportSize({width:3840,height:2160}); await page.goto('/?parlor=1');
 const light=page.locator('.parlor-light'); await expect(light).toHaveCount(1);
 const actors=page.locator('.ghost-porch video,.parlor-exterior-residents video,.narrative-gambler video:not([hidden])');
 await expect.poll(()=>actors.evaluateAll(v=>v.length>=5&&v.every(x=>(x as HTMLVideoElement).readyState>=2))).toBe(true);
 const read=()=>actors.evaluateAll(v=>v.map(x=>{const e=x as HTMLVideoElement,q=e.getVideoPlaybackQuality();return{src:e.currentSrc,t:e.currentTime,frames:q.totalVideoFrames,drops:q.droppedVideoFrames,filter:getComputedStyle(e).filter};}));
 const before=await read();await page.waitForTimeout(1800);const after=await read();
 for(let i=0;i<before.length;i++){if(before[i].src!==after[i]?.src)continue;const a=after[i],b=before[i];expect(a.t-b.t).toBeGreaterThan(1.2);expect((a.drops-b.drops)/Math.max(1,a.frames-b.frames)).toBeLessThan(.15);}
 await page.evaluate(()=>{document.querySelectorAll('video').forEach(v=>v.pause());document.getAnimations().forEach(a=>a.pause());});
 const sample=async(name:string)=>{await light.evaluate(e=>(e as SVGElement).style.visibility='hidden');await page.screenshot({path:`docs/daylight-${name}-before.png`});await light.evaluate(e=>(e as SVGElement).style.visibility='visible');await page.screenshot({path:`docs/daylight-${name}-after.png`});};
 await sample('noon');
 await page.evaluate(async()=>{document.body.classList.add('night');const v=[...document.querySelectorAll<HTMLVideoElement>('.parlor-environment')];await Promise.all(v.map(x=>x.readyState>=2?Promise.resolve():new Promise<void>(r=>x.addEventListener('loadeddata',()=>r(),{once:true}))));v.forEach((x,i)=>{x.pause();x.hidden=i===0;x.style.opacity=i===0?'0':'1';});});
 await page.waitForTimeout(1350);await sample('night');
 const nightOpacity=await page.locator('.parlor-light .daylight').evaluate(e=>getComputedStyle(e).opacity);expect(Number(nightOpacity)).toBe(0);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.daylight-shafts').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 writeFileSync('docs/daylight-native-review.json',JSON.stringify({before,after,nightOpacity},null,2));
});

