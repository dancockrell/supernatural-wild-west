import {test} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('profile 4K decoder and compositor load',async({page})=>{
 await page.setViewportSize({width:3840,height:2160});await page.goto('/?parlor=1');
 const capture=()=>page.evaluate(()=>[...document.querySelectorAll('video')].filter(v=>!v.paused).map(v=>({src:v.getAttribute('src'),native:[v.videoWidth,v.videoHeight],rect:[v.getBoundingClientRect().width,v.getBoundingClientRect().height],t:v.currentTime,total:v.getVideoPlaybackQuality().totalVideoFrames,drop:v.getVideoPlaybackQuality().droppedVideoFrames,filter:getComputedStyle(v).filter,mask:getComputedStyle(v).maskImage})));
 await page.waitForTimeout(3000);const initial=await capture();await page.waitForTimeout(5000);const loaded=await capture();
 await page.evaluate(()=>{for(const v of document.querySelectorAll('video'))if(!v.closest('.ghost-porch.left'))v.pause()});
 await page.waitForTimeout(4000);const alone=await capture();
 await page.addStyleTag({content:'.ghost-porch,.ghost-porch video{filter:none!important;mask-image:none!important}.parlor-foreground-fog{display:none!important}'});
 await page.waitForTimeout(4000);const plain=await capture();
 const gpu=await page.evaluate(()=>{const c=document.createElement('canvas');const gl=c.getContext('webgl');const e=gl?.getExtension('WEBGL_debug_renderer_info');return e?gl?.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown'});
 writeFileSync('docs/4k-playback-profile.json',JSON.stringify({gpu,initial,loaded,alone,plain},null,2));
});
