import type { ReplayManifest, ReplayRecord } from './model';
export class ReplayCloudError extends Error { constructor(message:string,readonly retryAfter=60){super(message);} }
export function replayCloud(owner:string,namespace:string) {
  async function request(method:string,stageId?:string,body?:unknown){
    const query=new URLSearchParams({owner,namespace,...(stageId?{stageId}:{})});
    const r=await fetch(`/api/cloud-account/auto-deploys${method==='GET'?`?${query}`:''}`,{method,credentials:'same-origin',cache:'no-store',
      headers:method==='GET'?{}:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({owner,namespace,...body as object})})});
    const data=await r.json();
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
