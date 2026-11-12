import type { ReplayManifest, ReplayRecord } from './model';
import { waitForReplay } from './queue';
export class ReplayCloudError extends Error { constructor(message:string,readonly retryAfter=60){super(message);} }
export function replayCloud(owner:string,namespace:string,signal:AbortSignal=new AbortController().signal) {
  // Independent of Yostar admission. Leave headroom under the account API's
  // 120 reads / 60 writes / 10 removals per minute for ordinary account activity.
  const nextAt={read:0,write:0,remove:0};
  async function request(method:string,stageId?:string,body?:unknown){
    const operation=method==='GET'?'read':method==='DELETE'?'remove':'write';
    const wait=nextAt[operation]-Date.now();
    if(wait>0)await waitForReplay(wait,signal);
    signal.throwIfAborted();
    nextAt[operation]=Date.now()+(operation==='read'?700:operation==='remove'?6500:1250);
    const query=new URLSearchParams({owner,namespace,...(stageId?{stageId}:{})});
    const init:RequestInit={method,credentials:'same-origin',cache:'no-store',signal,
      headers:method==='GET'?{}:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({owner,namespace,...body as object})})};
    const r=await (method==='GET'?fetch(`/api/cloud-account/auto-deploys?${query}`,init):fetch('/api/cloud-account/auto-deploys',init));
    const data=await r.json();
    signal.throwIfAborted();
    if(!r.ok)throw new ReplayCloudError(typeof data.error==='string'?data.error:'Cloud saving stopped.',Math.max(60,Number(r.headers.get('retry-after'))||60));
    return data;
  }
  return {
    manifest:async():Promise<ReplayManifest[]> => (await request('GET')).records,
    read:async(stageId:string):Promise<ReplayRecord>=>({...((await request('GET',stageId)).record),namespace,savedAt:Date.now()}),
    save:async(record:ReplayRecord,expectedHash:string|null)=>request('PUT',undefined,{stageId:record.stageId,payload:record.payload,fingerprint:record.fingerprint,expectedHash}),
    mark:async(stageId:string,fingerprint:string,hash:string)=>request('PATCH',undefined,{stageId,fingerprint,hash}),
    remove:async(stageId:string,hash:string,fingerprint:string)=>request('DELETE',undefined,{stageId,hash,fingerprint}),
  };
}
