import express from 'express';import {chromium} from '@playwright/test';
const app=express();app.use('/supernatural-wild-west',express.static('demo-dist'));const server=app.listen(8790,'127.0.0.1');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.DEMO_URL||'http://127.0.0.1:8790/supernatural-wild-west/?parlor=1');await page.locator('#spin').waitFor();
await page.waitForFunction(()=>!document.querySelector('#spin').disabled);
await page.waitForFunction(()=>[...document.querySelectorAll('.ghost-porch video')].every(v=>v.readyState>=2&&v.currentTime>0),{timeout:45000});
await page.locator('#spin').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('sww-public-demo-v1')||'null')?.state.sequence>0);await page.waitForFunction(()=>!document.querySelector('#spin').disabled && document.querySelector('#spin').textContent.trim()==='SPIN',null,{timeout:45000});
await page.screenshot({path:'docs/public-demo-smoke.png'});console.log(JSON.stringify({errors,balance:await page.locator('#balance').textContent(),videos:await page.locator('.ghost-porch video').evaluateAll(es=>es.map(v=>({ready:v.readyState,time:v.currentTime,cors:v.crossOrigin})))}));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();server.close();}
