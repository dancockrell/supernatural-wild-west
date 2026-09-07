import {test,expect} from '@playwright/test';
import {initialState} from '../../src/engine/engine';
import {handMotion,stageHandFrames} from '../../src/client/poker-motion';
for(const width of [3840,1440,390]) test(`foreground hand clears controls throughout awards at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===3840?2160:1000});
 const state={...initialState(),poker:{cards:[8,9,10,11,12],bet:100}};
 await page.route('**/api/session',r=>r.fulfill({json:{state,lastResult:null}}));
 await page.goto('/?parlor=1');
 await page.locator('.poker-award').evaluate(e=>e.innerHTML='Royal flush <strong>1,000,000.00 CR</strong>');
 const cards=page.locator('.poker-cards .poker-slot.dealt');await expect(cards).toHaveCount(5);
 const cardWidth=(await cards.first().boundingBox())!.width;
 const gestures=['Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush','Royal flush'].map(rank=>({rank,frames:Array.from({length:5},(_,i)=>stageHandFrames(handMotion(rank).frames(i,5),cardWidth))}));
 const clearance=await page.evaluate(gestures=>{
  const cards=[...document.querySelectorAll<HTMLElement>('.poker-cards .poker-slot')];
  const controls=document.querySelector('.controls')!.getBoundingClientRect();
  const stage=document.querySelector('.parlor-stage')!.getBoundingClientRect();
  let top=Infinity,bottom=-Infinity;
  for(const gesture of gestures) {
   const animations=cards.map((card,i)=>{const a=card.animate(gesture.frames[i],{duration:1000,easing:'cubic-bezier(.22,.7,.3,1)',fill:'both'});a.pause();return a;});
   for(let t=0;t<=1000;t+=25) {
    animations.forEach(a=>a.currentTime=t);
    for(const card of cards){const r=card.getBoundingClientRect();top=Math.min(top,r.top-controls.bottom);bottom=Math.max(bottom,r.bottom-stage.bottom);}
   }
   animations.forEach(a=>a.cancel());
  }
  const award=document.querySelector('.poker-award')!.getBoundingClientRect();
  const status=document.querySelector('#connection')!.getBoundingClientRect();
  const text=document.createRange();text.selectNodeContents(document.querySelector('.poker-award')!);const ink=text.getBoundingClientRect();
  if(ink.bottom>stage.bottom+.5)throw new Error('Award below stage');
  if(ink.left<status.right&&ink.right>status.left&&ink.top<status.bottom&&ink.bottom>status.top)throw new Error('Award overlaps connection');
  return {top,bottom};
 },gestures);
 expect(clearance.top).toBeGreaterThan(0);expect(clearance.bottom).toBeLessThan(0);
 await page.screenshot({path:`docs/player-hand-clearance-${width}.png`});
 console.log(width,clearance);
});
