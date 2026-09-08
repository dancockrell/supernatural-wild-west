import { initialState, resolveSpin } from '../engine/engine';
import type { GameState, SpinRequest, SpinResult } from '../engine/types';

/** Public, fictional-credit demo only. The server adapter remains the production path. */
export class BrowserDemo {
 private state: GameState = initialState();
 private rounds: {request:SpinRequest; result:SpinResult}[] = [];
 constructor(){
  try { const saved=JSON.parse(localStorage.getItem('sww-public-demo-v1')||'null');
   if(saved?.state?.configVersion===this.state.configVersion && Array.isArray(saved.rounds)){
    this.state=saved.state;this.rounds=saved.rounds;
   }
  } catch { /* Storage may be unavailable; the demo still plays in memory. */ }
 }
 async reconnect(){return structuredClone({state:this.state,lastResult:this.rounds.at(-1)?.result||null});}
 async history(){return structuredClone(this.rounds.map(r=>r.result));}
 async spin(request:SpinRequest){
  const previous=this.rounds.find(r=>r.request.requestId===request.requestId);
  if(previous){
   if(previous.request.bet!==request.bet||previous.request.expectedSequence!==request.expectedSequence)throw new Error('Idempotency conflict');
   return structuredClone(previous.result);
  }
  if(request.expectedSequence!==this.state.sequence)throw new Error('Sequence conflict; reconnect');
  const result=resolveSpin(this.state,request.bet,{nextInt(max){
   if(!Number.isSafeInteger(max)||max<1||max>0x100000000)throw new Error('Invalid random range');
   const limit=Math.floor(0x100000000/max)*max;const word=new Uint32Array(1);
   do{crypto.getRandomValues(word);}while(word[0]>=limit);return word[0]%max;
  }},request.requestId);
  this.state=result.state;this.rounds=[...this.rounds,{request,result}].slice(-50);
  try{localStorage.setItem('sww-public-demo-v1',JSON.stringify({state:this.state,rounds:this.rounds}));}catch{}
  return structuredClone(result);
 }
}
