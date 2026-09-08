/** Anonymous media allows the public demo to use its version-pinned asset host. */
export function createVideo(){const video=document.createElement('video');if(import.meta.env.MODE==='public-demo')video.crossOrigin='anonymous';return video;}
export function createAudio(src:string){const audio=new Audio();if(import.meta.env.MODE==='public-demo')audio.crossOrigin='anonymous';audio.src=src;return audio;}
