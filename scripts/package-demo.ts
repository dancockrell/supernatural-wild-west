import { readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFeatureGallery } from '../server/showcase';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const media=`https://raw.githubusercontent.com/dancockrell/supernatural-wild-west/${revision}/public`;
for(const name of readdirSync('demo-dist/assets')){
 if(!/\.(js|css)$/.test(name))continue;
 const file=`demo-dist/assets/${name}`;
 writeFileSync(file,readFileSync(file,'utf8').replace(/\/(video|audio|art)\//g,`${media}/$1/`));
}
writeFileSync('demo-dist/feature-gallery.json',JSON.stringify(buildFeatureGallery()));
writeFileSync('demo-dist/.nojekyll','');
writeFileSync('demo-dist/build.json',JSON.stringify({revision,mode:'fictional-credit-browser-demo'}));
