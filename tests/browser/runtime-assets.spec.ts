import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('published runtime media is present and parlor loads without missing resources',async({page,request})=>{
 const assets=JSON.parse(readFileSync('docs/runtime-assets.json','utf8')) as string[];
 for(const path of assets){const response=await request.head(path);expect(response.status(),path).toBe(200);}
 const missing:string[]=[];
 page.on('response',r=>{if(r.status()===404)missing.push(r.url());});
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.waitForTimeout(1500);expect(missing).toEqual([]);
});
