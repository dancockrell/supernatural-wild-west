import { test, expect } from '@playwright/test';
import {writeFileSync} from 'node:fs';
import { initialState } from '../../src/engine/engine';

for (const night of [false, true]) test(`sky plays three native wraps: ${night ? 'night' : 'noon'}`, async ({page}) => {
  test.setTimeout(65000);
  await page.setViewportSize({width:1672,height:941});
  if(night) await page.route('**/api/session',r=>r.fulfill({json:{state:{...initialState(),phase:'witching',witchSpins:6},lastResult:null}}));
  await page.goto('/?parlor=1');
  const movie=page.locator('.parlor-environment:not([hidden])');
  await expect.poll(()=>movie.evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  const result=await movie.evaluate(async node=>{
    const v=node as HTMLVideoElement;
    const canvas=document.createElement('canvas');canvas.width=418;canvas.height=235;
    const ctx=canvas.getContext('2d')!;
    return await new Promise<{wraps:number;rate:number;error:number|null;gaps:number[];seams:{before:string;after:string;gapMs:number}[];quality:{total:number;dropped:number}}>(resolve=>{
      let previous=v.currentTime,previousNow=performance.now(),wraps=0,previousImage='';
      const gaps:number[]=[];const seams:{before:string;after:string;gapMs:number}[]=[];
      const tick:VideoFrameRequestCallback=(now,metadata)=>{
        const gap=now-previousNow;gaps.push(gap);
        const nearWrap=metadata.mediaTime>v.duration-.15||metadata.mediaTime<.15;
        let image='';if(nearWrap){ctx.drawImage(v,0,0,418,235);image=canvas.toDataURL('image/png');}
        if(metadata.mediaTime<previous-1){wraps++;seams.push({before:previousImage,after:image,gapMs:gap});}
        if(image)previousImage=image;
        previous=metadata.mediaTime;previousNow=now;
        if(wraps===3){const q=v.getVideoPlaybackQuality();resolve({wraps,rate:v.playbackRate,error:v.error?.code??null,gaps,seams,quality:{total:q.totalVideoFrames,dropped:q.droppedVideoFrames}});}
        else v.requestVideoFrameCallback(tick);
      };
      v.requestVideoFrameCallback(tick);
    });
  });
  expect(result.wraps).toBe(3);expect(result.rate).toBe(1);expect(result.error).toBeNull();
  const sorted=result.gaps.slice(1).sort((a,b)=>a-b);
  writeFileSync(`docs/sky-runtime-${night?'night':'noon'}.json`,JSON.stringify({wraps:result.wraps,rate:result.rate,error:result.error,quality:result.quality,frameGapMedianMs:sorted[Math.floor(sorted.length*.5)],frameGapP99Ms:sorted[Math.floor(sorted.length*.99)],wrapGapsMs:result.seams.map(s=>s.gapMs)},null,2));
  await expect(page.locator('#spin')).toBeEnabled();
  await page.screenshot({path:`docs/sky-three-wraps-${night?'night':'noon'}.png`});
  await page.setContent(`<style>body{margin:0;background:#101821;color:white;font:14px sans-serif}.row{display:flex}img{width:418px;height:235px}</style>${result.seams.map((s,i)=>`<div>Wrap ${i+1}: last decoded frame / first decoded frame</div><div class="row"><img src="${s.before}"><img src="${s.after}"></div>`).join('')}`);
  await page.setViewportSize({width:836,height:780});
  await page.screenshot({path:`docs/sky-runtime-wraps-${night?'night':'noon'}.png`});
});

