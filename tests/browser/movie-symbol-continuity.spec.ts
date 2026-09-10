import {test,expect} from '@playwright/test';
import {injectClient} from './client-module';

test('reel portraits retain decoded pixels through loop gaps and replace them for a different symbol',async({page})=>{
 await page.setContent('<main><canvas data-movie="queen"></canvas></main>');
 await injectClient(page,{modules:['resident-media','movie-loops'],expose:['MovieSymbols']});
 const result=await page.evaluate(()=>{
  window.requestAnimationFrame=()=>0;
  HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
  HTMLMediaElement.prototype.pause=function(){};
  const host=document.querySelector('main')!, canvas=host.querySelector('canvas')!;
  const movies=new (window as any).MovieSymbols(host);
  let ready=4,seeking=false,width=960;
  const queen=movies.sources.get('queen');
  Object.defineProperties(queen,{
   readyState:{get:()=>ready},seeking:{get:()=>seeking},
   videoWidth:{get:()=>width},videoHeight:{get:()=>720},
  });
  for(const poster of movies.posters.values()) Object.defineProperties(poster,{
   complete:{get:()=>true},naturalWidth:{get:()=>960},naturalHeight:{get:()=>720},
  });
  // Distinct real canvas pixels make poster substitution or clearing observable.
  const context=canvas.getContext('2d')!;
  context.drawImage=((frame:CanvasImageSource)=>{
   context.fillStyle=frame===queen?'#00cc66':'#cc0033';
   context.fillRect(0,0,320,240);
  }) as typeof context.drawImage;
  const sample=()=>[...context.getImageData(10,10,1,1).data];
  movies.paint(100);const native=sample();
  ready=1;movies.paint(200);const buffering=sample();
  ready=4;seeking=true;movies.paint(300);const rewind=sample();
  seeking=false;width=0;movies.paint(400);const noDimensions=sample();
  width=960;movies.paint(500);const resumed=sample();
  // Reusing a canvas for a different symbol must not preserve the old portrait.
  canvas.dataset.movie='medium';movies.dirty=true;movies.paint(600);
  const replacement=sample(), replacementState=canvas.dataset.ready;
  return {native,buffering,rewind,noDimensions,resumed,replacement,replacementState};
 });
 const native=[0,204,102,255];
 expect(result).toEqual({native,buffering:native,rewind:native,noDimensions:native,resumed:native,replacement:[204,0,51,255],replacementState:'poster'});
});
