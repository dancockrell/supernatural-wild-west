import {test,expect,type Locator,type Page} from '@playwright/test';

async function openGallery(page:Page){
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#help').click();await page.getByRole('button',{name:'Review rare animations'}).click();
}
// The one filter the product admits on a woman, added deliberately in 7ceca5f
// ("Fade the spectral ribbons on the residents without thinning the women").
// It is an alpha-curve transfer, not a body shader: see the comment on the
// filter itself in src/client/boundary-cast.ts, and the three CSS rules that
// set it (parlor.css:353, cinematics.css:770, cinematics.css:940). Everything
// else on a woman - relighting, haze, blend modes, masks - stays off, which is
// what this file is named for. Nothing but the residents in the room may carry
// it, so it is a parameter rather than a blanket allowance.
const WISP_FADE='url("#ghost-wisp-fade")';
async function natural(video:Locator,filter='none'){
 expect(await video.evaluate(e=>{const s=getComputedStyle(e);return {filter:s.filter,opacity:s.opacity,blend:s.mixBlendMode,mask:s.maskImage};})).toEqual({filter,opacity:'1',blend:'normal',mask:'none'});
}
type Frame={time:number;opaque:number;lit:number;checksum:number};
async function decoded(video:Locator,filter?:string,source:RegExp=/\/(parlor-maidens-v1|parlor-idles-v2|rare-features-v4|feature-performances-v2|hand-performances-v3)\//){
 await expect(video).toHaveAttribute('src',source);
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState),{timeout:18000}).toBeGreaterThanOrEqual(2);
 // Three frames off one continuous playback. A resident cuts only at her clip's
 // native boundary, and when she does, ResidentSequence.present() takes the
 // played-out element out of the DOM - so a sample that straddles a boundary
 // simply stops receiving frames. Measured: medium-idle ended at 3.459s with two
 // of three frames taken, connected:false. That is the product working, so the
 // retired element is re-sampled on the resident's current film rather than
 // reported as a stall. A genuine stall - frames stalling while the element is
 // still in the room - still fails, and says so with its state.
 let samples:Frame[]|undefined,retired=[] as string[];
 for(let attempt=0;attempt<4&&!samples;attempt++){
  const outcome=await video.evaluate(async(v:HTMLVideoElement)=>{
   const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
   const state=()=>JSON.stringify({connected:v.isConnected,paused:v.paused,ended:v.ended,readyState:v.readyState,currentTime:v.currentTime,src:v.currentSrc,decoded:v.getVideoPlaybackQuality().totalVideoFrames});
   return await new Promise<{samples:Frame[]}|{retired:string}>((resolve,reject)=>{
    const samples:Frame[]=[];let id:number;
    const stop=(fn:()=>void)=>{clearTimeout(timeout);clearInterval(watch);v.cancelVideoFrameCallback(id);fn();};
    const timeout=setTimeout(()=>stop(()=>reject(new Error(`No decoded native frame progress: ${JSON.stringify({frames:samples.length})} ${state()}`))),8000);
    const watch=setInterval(()=>{if(!v.isConnected)stop(()=>resolve({retired:state()}));},100);
    const draw=(_:number,frame:VideoFrameCallbackMetadata)=>{
     ctx.clearRect(0,0,96,96);ctx.drawImage(v,0,0,96,96);const pixels=ctx.getImageData(0,0,96,96).data;let opaque=0,lit=0;
     for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=245){opaque++;if(pixels[i]+pixels[i+1]+pixels[i+2]>45)lit++;}
     let checksum=2166136261;for(const channel of pixels)checksum=Math.imul(checksum^channel,16777619);
     samples.push({time:frame.mediaTime,opaque,lit,checksum});
     if(samples.length===3)stop(()=>resolve({samples}));else id=v.requestVideoFrameCallback(draw);
    };id=v.requestVideoFrameCallback(draw);
   });
  });
  if('samples' in outcome) samples=outcome.samples; else retired.push(outcome.retired);
 }
 // Four boundaries in a row is not a boundary, it is something else.
 expect(samples,`only retired elements sampled: ${retired.join(' | ')}`).toBeDefined();
 const frames=samples!;
 expect(frames[2].time).toBeGreaterThan(frames[0].time);
 expect(new Set(frames.map(frame=>frame.checksum)).size).toBeGreaterThan(1);
 for(const frame of frames){expect(frame.opaque).toBeGreaterThan(40);expect(frame.lit).toBeGreaterThan(20);}
 await natural(video,filter);
}

test('native women draw without added effects in the room with contact shadows retained',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await expect(page.locator('.resident-fog,#women-clean')).toHaveCount(0);
 const women=page.locator('.boundary-cast .ghost-porch video[data-movie]');await expect(women).toHaveCount(2);
 for(let i=0;i<2;i++)await decoded(women.nth(i),WISP_FADE);
 await expect(page.locator('.brazier-plume')).toHaveCount(0);
 await page.screenshot({path:'docs/women-no-added-effects.png'});
 await expect(page.locator('.resident-ground-shadows')).toHaveCount(1);
});

test('all twelve room performances display actual native motion',async({page})=>{
 test.setTimeout(90000);await openGallery(page);
 let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 const balance=await page.locator('#balance').textContent();
 const labels=await page.locator('[data-character-preview]').filter({hasText:/^(Lantern|Brazier) maiden/}).allTextContents();
 expect(labels).toHaveLength(12);
 for(const label of labels){
  await page.getByRole('button',{name:label,exact:true}).click();
  await decoded(page.locator('.reaction-review'));
  await page.locator('#back-to-rare-animations').click();
 }
 expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
});

test('all women hand and feature performances use native sources without added surrounding haze',async({page})=>{
 test.setTimeout(90000);await openGallery(page);
 let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 const balance=await page.locator('#balance').textContent();
 // The clip each preview is required to play, from src/client/cinematics.ts.
 // Naming it is what makes the waits below mean anything: FeatureStage.play()
 // resets the stage with innerHTML and appends the new video a beat later, so
 // between the click and that append the locator still resolves to the PREVIOUS
 // feature's paused element, holding its old currentTime. A bare poll for
 // currentTime>.7 is satisfied instantly by that leftover, and then the frame
 // sampler measures a paused, unlaid-out video and reports no decoded progress.
 // That is how this test failed: the wait could not fail, so it never waited.
 const clips={witch:'/video/feature-performances-v2/witch.webm',fortune:'/video/rare-features-v4/fortune.webm',
  'awaken-1':'/video/feature-performances-v2/saloon.webm','awaken-3':'/video/feature-performances-v2/mine.webm'};
 for(const [feature,clip] of Object.entries(clips)){
  await page.locator(`[data-feature-preview="${feature}"]`).click();const video=page.locator('.feature-stage video');
  await expect(video).toHaveAttribute('src',clip,{timeout:18000});
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:18000}).toBeGreaterThan(.7);
  await decoded(video,'none',new RegExp(`${clip}$`));
  expect(await page.locator('.performance-fog').evaluateAll(nodes=>nodes.every(e=>getComputedStyle(e).display==='none'))).toBe(true);
  await page.locator('#return-animation-gallery').click();
 }
 for(const rank of ['Pair','Two pair','Flush','Straight flush']){
  await page.locator(`[data-hand-preview="${rank}"]`).click();const video=page.locator('.poker-guest video');await decoded(video);
  expect(await page.locator('.large-hand-stage').evaluate(e=>[getComputedStyle(e,'::before').content,getComputedStyle(e,'::after').content])).toEqual(['none','none']);
  await page.locator('#return-animation-gallery').click();
 }
 expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
});

