import {test,expect} from '@playwright/test';
test('resident handoff holds rendered pixels until the incoming frame is presented',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).__heldPixels=[];
  const native=HTMLVideoElement.prototype.requestVideoFrameCallback;
  HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){
   const video=this;
   return native.call(this,(now,meta)=>setTimeout(()=>{
    const canvas=video.closest('.ghost-porch')?.querySelector('canvas');
    if(canvas){
     const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
     (window as any).__heldPixels.push(data.some((v,i)=>i%4===3&&v>100));
    }
    callback(now,meta);
   },180));
  };
 });
 await page.goto('/?parlor=1');
 await expect.poll(()=>page.evaluate(()=>(window as any).__heldPixels.length),{timeout:20000}).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).__heldPixels.every(Boolean))).toBe(true);
 await expect(page.locator('.ghost-porch canvas')).toHaveCount(0,{timeout:2000});
});
