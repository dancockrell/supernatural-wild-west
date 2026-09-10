import {test,expect} from '@playwright/test';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
/**
 * The shipping inventory has to be checked in BOTH directions.
 *
 * It used to be checked in one: every listed path must return 200. That is the
 * direction that catches a deleted file, and it caught nothing for weeks
 * because it was failing on 52 of them at once - every clip of the rejected art
 * sets that 21b0ce1 removed on purpose, still listed months later. A list that
 * is always red is worth exactly as much as one that is always green.
 *
 * It cannot catch the opposite drift at all. `vite` copies the whole of
 * `public/` into the build, so a file that nobody listed still ships: four
 * legacy ghost clips and two ground mattes were being served to every player
 * while absent from the document that claims to be the shipping inventory.
 *
 * So the manifest is now exactly "what public/ ships", asserted as a set
 * equality, and both halves of the difference are reported by name.
 */
const MEDIA = ['art','audio','video'];
function shipped(): string[] {
 const found: string[] = [];
 const walk = (dir:string) => {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
   const path = join(dir,entry.name);
   if(entry.isDirectory()) walk(path);
   else found.push('/'+relative('public',path).split(sep).join('/'));
  }
 };
 for(const base of MEDIA) walk(join('public',base));
 return found.sort();
}
test('the shipping inventory matches what the build actually serves',async()=>{
 const listed=JSON.parse(readFileSync('docs/runtime-assets.json','utf8')) as string[];
 const present=shipped();
 // Count the fragile thing: an empty walk or an empty manifest would make the
 // comparison below pass vacuously in one direction and fail incomprehensibly
 // in the other, so refuse to interpret either before both are populated.
 expect(present.length,'media files found under public/').toBeGreaterThan(100);
 expect(listed.length,'paths in docs/runtime-assets.json').toBeGreaterThan(100);
 const absent=listed.filter(p=>!present.includes(p));
 const unlisted=present.filter(p=>!listed.includes(p));
 expect(absent,'listed in runtime-assets.json but not on disk').toEqual([]);
 expect(unlisted,'shipped by the build but missing from runtime-assets.json').toEqual([]);
});
test('every listed asset is actually served, and the parlor loads without a 404',async({page,request})=>{
 const assets=JSON.parse(readFileSync('docs/runtime-assets.json','utf8')) as string[];
 let checked=0;
 for(const path of assets){const response=await request.head(path);expect(response.status(),path).toBe(200);checked++;}
 // The list being on disk is not the same claim as the server serving it, so
 // this counts what it actually fetched rather than trusting the loop ran.
 expect(checked,'assets fetched from the harness').toBe(assets.length);
 const missing:string[]=[];
 page.on('response',r=>{if(r.status()===404)missing.push(r.url());});
 await page.goto('/?parlor=1');await expect(page.locator('#spin')).toBeEnabled();
 await page.waitForTimeout(1500);expect(missing).toEqual([]);
});
