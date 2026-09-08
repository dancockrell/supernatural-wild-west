import {test,expect,type Locator,type Page} from '@playwright/test';

async function openGallery(page:Page){
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.locator('#help').click();await page.getByRole('button',{name:'Review rare animations'}).click();
}
async function natural(video:Locator){
 expect(await video.evaluate(e=>{const s=getComputedStyle(e);return {filter:s.filter,opacity:s.opacity,blend:s.mixBlendMode,mask:s.maskImage};})).toEqual({filter:'none',opacity:'1',blend:'normal',mask:'none'});
}
async function decoded(video:Locator){
 await expect(video).toHaveAttribute('src',/\/parlor-women-solid-v1\//);
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState),{timeout:18000}).toBeGreaterThanOrEqual(2);
 const samples=await video.evaluate(async(v:HTMLVideoElement)=>{
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  return await new Promise<{time:number;opaque:number;lit:number}[]>((resolve,reject)=>{
   const samples:{time:number;opaque:number;lit:number}[]=[];let id:number;
   const timeout=setTimeout(()=>{v.cancelVideoFrameCallback(id);reject(new Error('No decoded native frame progress'));},8000);
   const draw=(_:number,frame:VideoFrameCallbackMetadata)=>{
    ctx.clearRect(0,0,96,96);ctx.drawImage(v,0,0,96,96);const pixels=ctx.getImageData(0,0,96,96).data;let opaque=0,lit=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=245){opaque++;if(pixels[i]+pixels[i+1]+pixels[i+2]>45)lit++;}
    samples.push({time:frame.mediaTime,opaque,lit});
    if(samples.length===3){clearTimeout(timeout);resolve(samples);}else id=v.requestVideoFrameCallback(draw);
   };id=v.requestVideoFrameCallback(draw);
  });
 });
 expect(samples[2].time).toBeGreaterThan(samples[0].time);
 for(const frame of samples){expect(frame.opaque).toBeGreaterThan(40);expect(frame.lit).toBeGreaterThan(20);}
 await natural(video);
}

test('solid women draw naturally in the room with contact shadows retained',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await expect(page.locator('.resident-fog,#women-clean')).toHaveCount(0);
 const women=page.locator('.boundary-cast .ghost-porch video');await expect(women).toHaveCount(2);
 for(let i=0;i<2;i++)await decoded(women.nth(i));
 await page.screenshot({path:'docs/women-no-added-effects.png'});
 await expect(page.locator('.resident-ground-shadows')).toHaveCount(1);
});

test('every solid room idle variant and reaction decodes naturally in the gallery',async({page})=>{
 test.setTimeout(90000);await openGallery(page);
 let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 const balance=await page.locator('#balance').textContent();
 const variants=[{index:0,name:'queen-reaction'},{index:1,name:'medium-reaction'},
  ...['queen','medium'].flatMap((key,k)=>['idle','alternate','character-idle',...(key==='queen'?['fringe','shiver']:['turn','neck'])].map((action,i)=>({index:7+k*5+i,name:`${key}-${action}`})))];
 for(const variant of variants){
  await page.locator(`[data-character-preview="${variant.index}"]`).click();
  const video=page.locator('.reaction-review');await expect(video).toHaveAttribute('src',`/video/parlor-women-solid-v1/${variant.name}.webm`);
  await decoded(video);await page.locator('#back-to-rare-animations').click();
 }
 expect(await page.locator('#balance').textContent()).toBe(balance);expect(wagers).toBe(0);
});

test('all women hand and feature performances use solid sources without surrounding haze',async({page})=>{
 test.setTimeout(90000);await openGallery(page);
 let wagers=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spin'))wagers++;});
 const balance=await page.locator('#balance').textContent();
 for(const feature of ['witch','fortune','awaken-1','awaken-3']){
  await page.locator(`[data-feature-preview="${feature}"]`).click();const video=page.locator('.feature-stage video');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:18000}).toBeGreaterThan(.7);
  await decoded(video);
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
