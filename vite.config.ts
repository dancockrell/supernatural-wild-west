import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({
 base:mode==='public-demo'?'/supernatural-wild-west/':'/',
 publicDir:mode==='public-demo'?false:'public',
 build:{outDir:mode==='public-demo'?'demo-dist':'dist'},
 server:{port:5180,strictPort:true,proxy:{'/api':'http://127.0.0.1:8787'}},
}));
