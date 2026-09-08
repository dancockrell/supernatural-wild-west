import {test,expect} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
const ranks=[['High card','high-card'],['Pair','pair'],['Two pair','two-pair'],['Three of a kind','three-kind'],['Straight','straight'],['Flush','flush'],['Full house','full-house'],['Four of a kind','four-kind'],['Straight flush','straight-flush'],['Royal flush','royal-flush']] as const;
const runtime=readFileSync('src/client/poker-guests.ts','utf8');
const admission=runtime.match(/ADMITTED_V3_HANDS = new Set<string>\(\[([^\]]*)\]/)?.[1]||'';
for(const [rank,id] of ranks)test(`4K no-wager ${rank} plays its entire native film and score`,async({page})=>{
 test.skip(process.env.NATIVE_GPU_REVIEW!=='1','Native GPU slot is required for a 4K motion claim');
 test.skip(!admission.includes(`'${id}'`)||!existsSync(`public/video/hand-performances-v3/${id}.webm`),'Not yet admitted');
 page.on('pageerror',e=>console.log('PAGEERROR',e.message)); await page.setViewportSize({width:3840,height:2160});
 await page.addInitScript(()=>{
   const play=HTMLMediaElement.prototype.play;
   (window as any).eventScores=[];
   HTMLMediaElement.prototype.play=function(){if(this instanceof HTMLAudioElement&&this.src.includes('/event-scores-'))(window as any).eventScores.push(this);return play.call(this);};
 });
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 if(await page.locator('#audio').getAttribute('aria-pressed')!=='true')await page.locator('#audio').click();
 const balance=await page.locator('#balance').textContent();
 await page.locator('#settings').click();await page.locator('.developer-tools summary').click();await page.locator('#animation-preview').click();
 await page.locator(`[data-hand-preview="${rank}"]`).click();
 const v=page.locator('.poker-guest video');await expect(v).toHaveAttribute('src',`/video/hand-performances-v3/${id}.webm`);
 await expect.poll(()=>v.evaluate((e:HTMLVideoElement)=>e.currentTime),{timeout:14000}).toBeGreaterThan(.5);
 const native=await v.evaluate((e:HTMLVideoElement)=>{
   const box=e.getBoundingClientRect();const report={duration:e.duration,width:e.videoWidth,height:e.videoHeight,displayW:box.width*devicePixelRatio,displayH:box.height*devicePixelRatio,loop:e.loop,rate:e.playbackRate};
   (window as any).handEnded=false;document.addEventListener('ended',function captureEnd(event){if(event.target!==e)return;document.removeEventListener('ended',captureEnd,true);(window as any).handEnded=true;const q=e.getVideoPlaybackQuality();(window as any).handFinal={time:e.currentTime,quality:{droppedVideoFrames:q.droppedVideoFrames,totalVideoFrames:q.totalVideoFrames}};},true);return report;
 });
 expect(native.duration).toBeGreaterThanOrEqual(7);expect(native.width+.5).toBeGreaterThanOrEqual(native.displayW);expect(native.height+.5).toBeGreaterThanOrEqual(native.displayH);expect(native.loop).toBe(false);expect(native.rate).toBe(1);
 const actor=(await v.boundingBox())!,controls=(await page.locator('.controls').boundingBox())!;expect(actor.y+actor.height).toBeLessThanOrEqual(controls.y+1);
 const cards=await page.locator('.poker-slot').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};}));
 for(const c of cards)expect(actor.y+actor.height<=c.y+1||actor.x+actor.width<=c.x||actor.x>=c.x+c.width).toBe(true);
 await expect(page.locator('#spin')).toBeDisabled();
 const scoreId=id==='three-kind'?'trips':id==='four-kind'?'quads':id;
 await expect.poll(()=>page.evaluate(scoreId=>{const a=(window as any).eventScores as HTMLAudioElement[];return a.some(e=>e.src.endsWith(`/audio/event-scores-v1/hand-${scoreId}.mp3`)&&!e.paused&&e.currentTime>0);},scoreId)).toBe(true);
 if(['pair','two-pair','flush','straight-flush'].includes(id)){
   // A timestamp advancing through a repeated still is not restored acting.
   // Compare opaque picture interiors, excluding transparent smoke and the stage.
   const sample=()=>v.evaluate((e:HTMLVideoElement)=>{
     const c=document.createElement('canvas');c.width=144;c.height=160;
     const ctx=c.getContext('2d')!;ctx.drawImage(e,0,0,c.width,c.height);
     return Array.from(ctx.getImageData(0,0,c.width,c.height).data);
   });
   const before=await sample();
   await expect.poll(()=>v.evaluate((e:HTMLVideoElement)=>e.currentTime),{timeout:10000}).toBeGreaterThan(3.5);
   const after=await sample();let opaque=0,changed=0;
   for(let i=0;i<before.length;i+=4){
     if(before[i+3]<245||after[i+3]<245)continue;
     opaque++;if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>24)changed++;
   }
   expect(opaque).toBeGreaterThan(100);
   expect(changed/opaque,'The maiden must perform rather than play a duplicate still').toBeGreaterThan(.05);
 }
 await page.screenshot({path:`docs/hand-v3-${id}-4k.png`});
 await expect.poll(()=>page.evaluate(()=>(window as any).handEnded),{timeout:25000}).toBe(true);
 const final=await page.evaluate(()=>(window as any).handFinal);console.log(id,JSON.stringify({native,final}));expect(final.time).toBeGreaterThanOrEqual(native.duration-.1);expect(final.quality.droppedVideoFrames/Math.max(1,final.quality.totalVideoFrames)).toBeLessThan(.05);
 await expect(page.locator('.poker-guest')).toHaveCount(0);await expect(page.locator('#spin')).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>((window as any).eventScores as HTMLAudioElement[]).filter(e=>!e.paused).length)).toBe(0);
 expect(await page.locator('#balance').textContent()).toBe(balance);
});



