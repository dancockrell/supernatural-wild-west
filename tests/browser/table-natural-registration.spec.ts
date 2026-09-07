import {test,expect} from '@playwright/test';

test('natural receive, loss, and idle preserve the gambler table registration at 4K',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:3840,height:2160});
  await page.goto('/?parlor=1');
  await expect(page.locator('#spin')).toBeEnabled();
  await page.evaluate(()=>{
    const endings:Array<{name:string;trusted:boolean;time:number;duration:number}>=[];
    Object.assign(window,{tableNaturalEndings:endings});
    document.addEventListener('ended',event=>{
      const v=event.target;
      if(v instanceof HTMLVideoElement && v.closest('.narrative-gambler'))
        endings.push({name:v.dataset.performance||'',trusted:event.isTrusted,time:v.currentTime,duration:v.duration});
    },true);
  });
  const cards=page.locator('.ghost-ritual-cards');
  let arrived=false;
  for(let attempt=0;attempt<3&&!arrived;attempt++){
    const response=page.waitForResponse(r=>r.url().endsWith('/api/spin')&&r.request().method()==='POST');
    await page.locator('#spin').click();expect((await response).ok()).toBe(true);
    try {await expect(cards).toHaveAttribute('data-arrival',/.+/,{timeout:12000});arrived=true;}
    catch {await expect(page.locator('#spin')).toBeEnabled();}
  }
  expect(arrived,'a real player-card arrival must enter the receive path').toBe(true);
  const snapshots:Array<any>=[];
  for(const name of ['receive','loss','idle']){
    const current=page.locator(`.narrative-gambler video[data-performance="${name}"]:not([hidden])`);
    await expect(current).toHaveCount(1,{timeout:25000});
    await expect.poll(()=>current.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.12);
    const snapshot=await current.evaluate((v:HTMLVideoElement)=>{
      const host=v.closest('.narrative-gambler')!;
      const cards=host.querySelector<SVGSVGElement>('.ghost-ritual-cards')!;
      const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const m=new DOMMatrixReadOnly(getComputedStyle(v).transform);
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=720;
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(v,0,0,960,720);
      const pixels=ctx.getImageData(0,0,960,720).data;
      const tableEdges=[370,430,500,610].map(y=>{
        const xs:number[]=[];for(let x=80;x<930;x++)if(pixels[(y*960+x)*4+3]>200)xs.push(x);
        return {y,left:xs[0]??-1,right:xs.at(-1)??-1};
      });
      const felt:number[]=[];
      for(let y=368;y<408;y+=4)for(let x=265;x<705;x+=8){const at=(y*960+x)*4;felt.push(pixels[at],pixels[at+1],pixels[at+2]);}
      return {name:v.dataset.performance,t:v.currentTime,duration:v.duration,host:rect(host),cards:rect(cards),
        cardPlane:cards.querySelector('.ritual-card')!.parentElement!.getAttribute('transform'),
        transform:[m.a,m.b,m.c,m.d,m.e,m.f],native:{width:v.videoWidth,height:v.videoHeight},src:v.currentSrc,tableEdges,felt};
    });
    expect(snapshot.t,'capture the beginning of the natural performance').toBeLessThan(1.5);
    expect(snapshot.transform).toEqual([1,0,0,1,0,0]);
    if(name==='loss'){
      expect(snapshot.src).toContain('/parlor-gambler-native-v2/loss.webm');
      expect(snapshot.duration).toBeGreaterThanOrEqual(8);
      expect(snapshot.duration).toBeLessThan(8.2);
      expect(snapshot.native.width).toBeGreaterThanOrEqual(1920);
      expect(snapshot.native.height).toBeGreaterThanOrEqual(1440);
    }
    snapshots.push(snapshot);
    await page.screenshot({path:`docs/gambler-natural-${name}-4k.png`});
    if(name!=='idle')await expect(current).toHaveCount(0,{timeout:10000});
  }
  for(const sample of snapshots.slice(1)){
    expect(sample.host).toEqual(snapshots[0].host);
    expect(sample.cards).toEqual(snapshots[0].cards);
    expect(sample.cardPlane).toBe(snapshots[0].cardPlane);
    if(sample.name==='loss'){
      sample.tableEdges.forEach((edge:{y:number;left:number;right:number},i:number)=>{
        expect(edge.left).toBeGreaterThan(0);
        expect(Math.abs(edge.left-snapshots[0].tableEdges[i].left),'decoded table left silhouette').toBeLessThanOrEqual(2);
        expect(Math.abs(edge.right-snapshots[0].tableEdges[i].right),'decoded table right silhouette').toBeLessThanOrEqual(2);
      });
      const difference=sample.felt.reduce((sum:number,v:number,i:number)=>sum+Math.abs(v-snapshots[0].felt[i]),0)/sample.felt.length;
      expect(difference,'decoded felt remains the same material, without an affine workaround').toBeLessThan(8);
    }

  }
  const endings=await page.evaluate(()=>(window as any).tableNaturalEndings as Array<{name:string;trusted:boolean;time:number;duration:number}>);
  for(const name of ['receive','loss'])expect(endings.some(e=>e.name===name&&e.trusted&&e.time>=e.duration-.05)).toBe(true);
  console.log('natural table registration',JSON.stringify({snapshots:snapshots.map(({felt,...sample})=>sample),endings}));
});

