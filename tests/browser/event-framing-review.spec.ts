import {test} from '@playwright/test';
import {preview} from './preview';
for(const kind of ['awaken-0','awaken-3']) test(`framing ${kind}`,async({page})=>{
 await page.goto('/?parlor=1');
 await preview(page,kind);
 await page.locator('.feature-stage video').evaluate(async(v:HTMLVideoElement)=>{if(v.readyState<2) await new Promise(r=>v.addEventListener('loadeddata',r,{once:true}));v.pause();v.currentTime=1;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));});
 await page.screenshot({path:`docs/event-framing-${kind}.png`});
});
