import { readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFeatureGallery } from '../server/showcase';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
// Keep identical media URLs cached across code-only releases. Verify the selected
// commit contains the exact current public tree before using its immutable URLs.
const mediaRevision=execFileSync('git',['log','-1','--format=%H','--','public'],{encoding:'utf8'}).trim();
const tree=(ref:string)=>execFileSync('git',['rev-parse',`${ref}:public`],{encoding:'utf8'}).trim();
if(!mediaRevision||tree(mediaRevision)!==tree(revision))throw new Error('Cannot resolve matching published media tree');
const media=`https://raw.githubusercontent.com/dancockrell/supernatural-wild-west/${mediaRevision}/public`;
for(const name of readdirSync('demo-dist/assets')){
 if(!/\.(js|css)$/.test(name))continue;
 const file=`demo-dist/assets/${name}`;
 writeFileSync(file,readFileSync(file,'utf8').replace(/\/(video|audio|art)\//g,`${media}/$1/`));
}
writeFileSync('demo-dist/feature-gallery.json',JSON.stringify(buildFeatureGallery()));
writeFileSync('demo-dist/.nojekyll','');
writeFileSync('demo-dist/build.json',JSON.stringify({revision,mediaRevision,mode:'fictional-credit-browser-demo'}));
