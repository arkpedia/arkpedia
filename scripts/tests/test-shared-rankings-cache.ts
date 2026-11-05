import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedRankingResult,type RankingBucket} from '../../lib/community/sharedRankingsCache';
import type {CommunityRankings} from '../../lib/community/rankings';

function bucket(){
  let version=0;const objects=new Map<string,{etag:string;body:string}>();
  const store:RankingBucket={
    async get(key){const row=objects.get(key);return row?{etag:row.etag,text:async()=>row.body}:null;},
    async put(key,body,options){const old=objects.get(key),condition=options?.onlyIf;
      if(condition?.etagMatches&&old?.etag!==condition.etagMatches||condition?.etagDoesNotMatch==='*'&&old)return null;
      const row={etag:String(++version),body};objects.set(key,row);return {etag:row.etag};},
  };return {store,objects};
}
const result=(contributors=10):CommunityRankings=>({contributors,roster:contributors>=10?[]:null,replayContributors:0,replays:0,battles:null});
test('independent readers and isolates share one aggregate refresh through a conditional bucket lease',async()=>{
  const {store}=bucket();let reads=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const load=async()=>{reads++;await gate;return result();};
  const first=sharedRankingResult(store,'all','consent-1',load);
  await new Promise(resolve=>setTimeout(resolve,5));
  const others=Array.from({length:4},()=>sharedRankingResult(store,'all','consent-1',load));
  release();assert.deepEqual(await Promise.all([first,...others]),Array(5).fill(result()));assert.equal(reads,1);
  assert.deepEqual(await sharedRankingResult(store,'all','consent-1',load),result());assert.equal(reads,1);
});
test('withdrawn consent never uses a warm or stale aggregate, and failed refreshes remain retryable',async()=>{
  const {store}=bucket();let time=1_000;const options={now:()=>time};
  await sharedRankingResult(store,'all','before',async()=>result(),options);
  await assert.rejects(sharedRankingResult(store,'all','withdrawn',async()=>{throw Error('database overloaded');},options),/overloaded/);
  assert.deepEqual(await sharedRankingResult(store,'all','withdrawn',async()=>result(9),options),result(9));
  time+=31_000;assert.deepEqual(await sharedRankingResult(store,'all','withdrawn',async()=>result(8),options),result(8));
});
test('overload fallback is recent, consent-matched and bounded rather than extended indefinitely',async()=>{
  const {store}=bucket();let time=1_000;const options={now:()=>time};
  await sharedRankingResult(store,'all','same',async()=>result(),options);time+=31_000;
  const overloaded=async():Promise<CommunityRankings>=>{throw Error('D1 DB is overloaded');};
  const error=console.error;console.error=()=>{};
  try{assert.deepEqual(await sharedRankingResult(store,'all','same',overloaded,options),result());time+=121_000;
    await assert.rejects(sharedRankingResult(store,'all','same',overloaded,options),/overloaded/);
  }finally{console.error=error;}
});
test('different filters stay separate and an abandoned lease can be recovered',async()=>{
  const {store}=bucket(),options={now:()=>20_000};
  await store.put('community-rankings/v1/all',JSON.stringify({lease:{expires:10_000,nonce:'abandoned'}}));
  assert.deepEqual(await sharedRankingResult(store,'all','same',async()=>result(12),options),result(12));
  assert.deepEqual(await sharedRankingResult(store,'jp','same',async()=>result(3),options),result(3));
});
test('an expired refresh owner cannot overwrite a newer aggregate or release its lease',async()=>{
  const {store}=bucket();let time=1_000,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),options={now:()=>time};
  const old=sharedRankingResult(store,'all','same',async()=>{await gate;return result(10);},options);
  await new Promise(resolve=>setTimeout(resolve,5));time+=16_000;
  assert.deepEqual(await sharedRankingResult(store,'all','same',async()=>result(11),options),result(11));
  release();await old;
  assert.deepEqual(await sharedRankingResult(store,'all','same',async()=>{throw Error('must use newer result');},options),result(11));
});
test('R2 write throttling waits and retries the same conditional operation without duplicate database scans',async()=>{
  const {store}=bucket();let puts=0,reads=0,time=1_000;const pauses:number[]=[];
  const limited:RankingBucket={get:store.get,async put(...args){if(++puts===1||puts===3)throw Error('R2 TooManyRequests (10058)');return store.put(...args);}};
  const value=await sharedRankingResult(limited,'all','same',async()=>{reads++;return result();},{now:()=>time,wait:async ms=>{pauses.push(ms);time+=ms;}});
  assert.deepEqual(value,result());assert.equal(reads,1);assert.deepEqual(pauses,[1100,1100]);assert.equal(puts,4);
});
