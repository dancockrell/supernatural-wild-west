import { chromium } from '@playwright/test';
import { initialState } from '../src/engine/engine';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const reports=[];
try {
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 const page=await browser.newPage({viewport});
 await page.addInitScript('window.__name = (fn) => fn;');
 await page.route('**/api/session',r=>r.fulfill({json:{state:initialState(),lastResult:null}}));
 await page.addInitScript(()=>{
  const original=document.createElement.bind(document);
  (window as any).__profileVideos=[];
  document.createElement=((...args:any[])=>{
   const el=(original as any)(...args);
   if(args[0]==='video') (window as any).__profileVideos.push(el);
   return el;
  }) as typeof document.createElement;
 });
 await page.goto(process.env.PROFILE_URL || 'http://127.0.0.1:8787/');
 await page.waitForTimeout(5000);
 const result=await page.evaluate(async()=>{
  const gaps:number[]=[];const tasks:number[]=[];
  const observer=new PerformanceObserver(list=>list.getEntries().forEach(e=>tasks.push(e.duration)));
  observer.observe({entryTypes:['longtask']});
  const start=performance.now();let previous=start;
  await new Promise<void>(resolve=>{
   const frame=(now:number)=>{gaps.push(now-previous);previous=now;if(now-start<10000)requestAnimationFrame(frame);else resolve();};
   requestAnimationFrame(frame);
  });
  observer.disconnect();gaps.shift();gaps.sort((a,b)=>a-b);
  const movies=((window as any).__profileVideos as HTMLVideoElement[]).map(v=>({path:new URL(v.src).pathname,ready:v.readyState,paused:v.paused,time:v.currentTime,...(()=>{const q=v.getVideoPlaybackQuality();return{totalFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames};})()}));
  return {durationMs:performance.now()-start,animationFrameSamples:gaps.length,medianFrameMs:gaps[Math.floor(gaps.length*.5)],p95FrameMs:gaps[Math.floor(gaps.length*.95)],framesOver50ms:gaps.filter(v=>v>50).length,longTasks:tasks.length,longTaskTotalMs:tasks.reduce((a,b)=>a+b,0),movies};
 });
 reports.push({viewport,...result});await page.close();
}
} finally { await browser.close(); }
await mkdir('docs/performance',{recursive:true});
const report={date:new Date().toISOString(),environment:'Local headless Chromium on development Windows machine; viewport emulation is not physical phone evidence. Idle presentation only, no wagers.',reports};
await writeFile('docs/performance/presentation-latest.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
