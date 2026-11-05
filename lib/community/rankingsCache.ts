import type { D1Database } from '@cloudflare/workers-types';
import { communityRankings, type CommunityRankings } from './rankings';
import {sharedRankingResult,type RankingBucket} from './sharedRankingsCache';

interface Entry { stamp:string; expires:number; result:Promise<CommunityRankings> }
const caches=new WeakMap<D1Database,Map<string,Entry>>();

/** Share concurrent live reads in an isolate without retaining withdrawn consent.
 * Every request checks anonymous change counters first; a changed account revision,
 * deletion bypasses the cached aggregate immediately. Replay uploads refresh
 * within 30 seconds instead of invalidating every in-flight upload batch. */
export async function cachedCommunityRankings(db:D1Database,server:string,stage:string,bucket?:RankingBucket):Promise<CommunityRankings>{
  const stamp=JSON.stringify(await db.prepare(`SELECT
    (SELECT count(*) FROM community_account) accounts,
    (SELECT coalesce(sum(revision),0) FROM community_account) revisions,
    (SELECT max(updatedAt) FROM community_account) accountUpdate`).first());
  const key=JSON.stringify([server,stage]);
  // Four bounded region cohorts use the shared cache. Individual-stage reads
  // are small and do not create an unbounded set of persistent objects.
  if(bucket&&!stage)return sharedRankingResult(bucket,encodeURIComponent(key),stamp,()=>communityRankings(db,server,stage));
  let cache=caches.get(db);if(!cache){cache=new Map();caches.set(db,cache);}
  const now=Date.now(),entry=cache.get(key);
  if(entry?.stamp===stamp&&entry.expires>now)return entry.result;
  const next={stamp,expires:now+30_000,result:communityRankings(db,server,stage)};
  if(cache.size>=64)cache.delete(cache.keys().next().value!);
  cache.set(key,next);
  try{return await next.result;}
  catch(error){if(cache.get(key)===next)cache.delete(key);throw error;}
}
