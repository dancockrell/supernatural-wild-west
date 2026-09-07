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
      const tablePoints=[[156,341],[838,341],[552,695]].map(([x,y])=>{
        // Source footprint points for loss are obtained from the measured inverse registration.
        const source=v.dataset.performance==='loss'?new DOMPoint(x,y).matrixTransform(new DOMMatrix([1.02425,-.00009,-.000418,1.00894,-11.21568,-2.9592]).inverse()):new DOMPoint(x,y);
        const point=new DOMPoint(source.x*v.clientWidth/960,source.y*v.clientHeight/720).matrixTransform(m);
        return {x:point.x,y:point.y};
      });
      return {name:v.dataset.performance,t:v.currentTime,duration:v.duration,host:rect(host),cards:rect(cards),
        cardPlane:cards.querySelector('.ritual-card')!.parentElement!.getAttribute('transform'),
        transform:[m.a,m.b,m.c,m.d,m.e,m.f],origin:getComputedStyle(v).transformOrigin,tablePoints};
    });
    expect(snapshot.t,'capture the beginning of the natural performance').toBeLessThan(1.5);
    if(name==='loss'){
      expect(snapshot.transform[0]).toBeCloseTo(1.02425,5);
      expect(snapshot.transform[3]).toBeCloseTo(1.00894,5);
      expect(snapshot.transform[4]/snapshot.host.width).toBeCloseTo(-.011683,5);
      expect(snapshot.transform[5]/snapshot.host.height).toBeCloseTo(-.004110,5);
      expect(snapshot.origin).toBe('0px 0px');
    }else expect(snapshot.transform).toEqual([1,0,0,1,0,0]);
    snapshots.push(snapshot);
    await page.screenshot({path:`docs/gambler-natural-${name}-4k.png`});
    if(name!=='idle')await expect(current).toHaveCount(0,{timeout:10000});
  }
  for(const sample of snapshots.slice(1)){
    expect(sample.host).toEqual(snapshots[0].host);
    expect(sample.cards).toEqual(snapshots[0].cards);
    expect(sample.cardPlane).toBe(snapshots[0].cardPlane);
    sample.tablePoints.forEach((point:{x:number;y:number},i:number)=>{
      expect(Math.abs(point.x-snapshots[0].tablePoints[i].x)).toBeLessThan(.1);
      expect(Math.abs(point.y-snapshots[0].tablePoints[i].y)).toBeLessThan(.1);
    });
  }
  const endings=await page.evaluate(()=>(window as any).tableNaturalEndings as Array<{name:string;trusted:boolean;time:number;duration:number}>);
  for(const name of ['receive','loss'])expect(endings.some(e=>e.name===name&&e.trusted&&e.time>=e.duration-.05)).toBe(true);
  console.log('natural table registration',JSON.stringify({snapshots,endings}));
});
