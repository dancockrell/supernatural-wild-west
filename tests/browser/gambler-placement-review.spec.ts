import {test,expect} from '@playwright/test';
test('gambler silhouette stays on stage and clear of the Medium',async({page})=>{
 await page.setViewportSize({width:1672,height:941});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await expect.poll(()=>page.locator('.narrative-gambler video:not([hidden]),.ghost-porch.right video').evaluateAll(es=>es.every(e=>(e as HTMLVideoElement).readyState>=2))).toBe(true);
 const result=await page.evaluate(()=>{
  document.querySelectorAll('video').forEach(v=>v.pause());
  const stage=document.querySelector('.parlor-stage')!.getBoundingClientRect();
  function pixels(selector:string){const v=document.querySelector<HTMLVideoElement>(selector)!;const b=v.getBoundingClientRect();const c=document.createElement('canvas');c.width=Math.ceil(stage.width+100);c.height=Math.ceil(stage.height+100);const x=c.getContext('2d')!;x.drawImage(v,b.x-stage.x,b.y-stage.y,b.width,b.height);return {data:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};}
  const g=pixels('.narrative-gambler video:not([hidden])'),m=pixels('.ghost-porch.right video');let outside=0,overlap=0;
  for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){const i=(y*g.w+x)*4+3;if(g.data[i]>40){if(x>=stage.width||y>=stage.height)outside++;if(m.data[i]>40)overlap++;}}
  return {outside,overlap};
 });
 expect(result).toEqual({outside:0,overlap:0});
 await page.screenshot({path:'docs/gambler-stage-current.png'});
});
