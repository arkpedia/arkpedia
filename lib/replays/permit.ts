import { waitForReplay } from './queue';

/** An anonymous browser identifier is the only body sent to Arkpedia. No game
 * identity, credentials, stage metadata or replay contents enter this endpoint. */
export async function requestReplayPermit(signal:AbortSignal, waiting:()=>void=()=>{}){
  const key='arkpedia:replay-client';
  let client=localStorage.getItem(key);
  if(!client||!/^[0-9a-f-]{36}$/.test(client)){client=crypto.randomUUID();localStorage.setItem(key,client);}
  let misses=0;
  while(!signal.aborted){
    const start=performance.now();
    let response:Response;
    try{response=await fetch('/api/account-import/replay-permit',{
      method:'POST',credentials:'omit',redirect:'error',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({client}),
      signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),
    });}catch(error){if(signal.aborted)throw error;throw new Error('Could not check download availability. Downloads paused; try again later.');}
    if(response.status===429){
      waiting();
      const delay=Number(response.headers.get('Retry-After'));
      await waitForReplay((Number.isFinite(delay)&&delay>0?Math.min(3600,Math.max(60,delay)):60)*1000,signal);
      continue;
    }
    if(!response.ok)throw new Error('Downloads are temporarily unavailable. Try again later; your saved auto-deploys are unchanged.');
    const data=await response.json();
    if(typeof data?.granted!=='boolean')throw new Error('Could not check download availability. Downloads paused.');
    // A sleeping tab or slow response must not reuse an old admission on wake.
    if(data.granted&&performance.now()-start<1000)return;
    waiting();
    await waitForReplay(Math.min(30000,2000*2**Math.min(misses++,4))+Math.random()*2000,signal);
  }
  throw new DOMException('Paused','AbortError');
}
