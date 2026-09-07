import {test,expect} from '@playwright/test';
for(const [rank,time] of [['Full house',7.5],['Two pair',7.2],['Four of a kind',4]] as const)test(`paid footer preserves ${rank} action`,async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.evaluate(rank=>{document.querySelector<HTMLElement>('.poker-award')!.dataset.amount='500000';document.querySelector('.player-play-space')!.dispatchEvent(new CustomEvent('hand-award',{detail:rank}));},rank);
 const video=page.locator('.poker-guest video');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:15000}).toBeGreaterThan(.5);
 await video.evaluate(async(v:HTMLVideoElement,t)=>{v.pause();await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=t;});},time);
 await expect(page.locator('.hand-marquee')).toHaveClass(/paid-reveal/);await page.screenshot({path:`docs/typography-prop-${rank.replaceAll(' ','-')}.png`});
});

