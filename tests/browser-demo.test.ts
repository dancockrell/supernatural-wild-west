import {it,expect,vi} from 'vitest';
import {BrowserDemo} from '../src/client/browser-demo';
it('public demo settles, replays requests and restores its browser session',async()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)});
 try{
  const demo=new BrowserDemo();const before=await demo.reconnect();
  const request={requestId:'public-demo-test-1',expectedSequence:before.state.sequence,bet:100};
  const result=await demo.spin(request);
  expect(result.state.sequence).toBe(before.state.sequence+1);
  expect(await demo.spin(request)).toEqual(result);
  expect((await new BrowserDemo().reconnect()).lastResult).toEqual(result);
  await expect(demo.spin({...request,bet:200})).rejects.toThrow('Idempotency conflict');
 }finally{vi.unstubAllGlobals();}
});
