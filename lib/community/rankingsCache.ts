import type { D1Database } from '@cloudflare/workers-types';
import { communityRankings, type CommunityRankings } from './rankings';
import {sharedRankingResult,type RankingBucket} from './sharedRankingsCache';

interface Entry { stamp:string; expires:number; result:Promise<CommunityRankings> }
const caches=new WeakMap<D1Database,Map<string,Entry>>();

export async function rankingConsentStamp(db:D1Database):Promise<string>{
  const row=await db.prepare('SELECT revision FROM community_statistics_epoch WHERE id=1').first<{revision:number}>();
  if(!row||!Number.isSafeInteger(row.revision))throw Error('Community statistics consent state is unavailable.');
  return String(row.revision);
}

/** One cheap consent-epoch read per visit, never an account/replay scan on a warm
 * daily snapshot. Routine imports do not invalidate it; withdrawals/deletions do. */
export async function cachedCommunityRankings(db:D1Database,server:string,stage:string,bucket?:RankingBucket,options:{forceRefresh?:boolean;background?:(work:Promise<unknown>)=>void}={}):Promise<CommunityRankings>{
  const stamp=await rankingConsentStamp(db);
  const key=JSON.stringify([server,stage]);
  // Four bounded region cohorts use the shared cache. Individual-stage reads
  // are small and do not create an unbounded set of persistent objects.
  if(bucket&&!stage)return sharedRankingResult(bucket,encodeURIComponent(key),stamp,async()=>{
    const result=await communityRankings(db,server,stage);
    if(await rankingConsentStamp(db)!==stamp)throw Error('Community statistics consent changed during refresh.');
    return {...result,source:'daily-snapshot',capturedAt:new Date().toISOString()};
  },options);
  let cache=caches.get(db);if(!cache){cache=new Map();caches.set(db,cache);}
  const now=Date.now(),entry=cache.get(key);
  if(entry?.stamp===stamp&&entry.expires>now)return entry.result;
  const next={stamp,expires:now+30_000,result:communityRankings(db,server,stage)};
  if(cache.size>=64)cache.delete(cache.keys().next().value!);
  cache.set(key,next);
  try{return await next.result;}
  catch(error){if(cache.get(key)===next)cache.delete(key);throw error;}
}
