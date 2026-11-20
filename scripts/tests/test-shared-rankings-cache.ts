import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedRankingResult,RANKING_SNAPSHOT_DAY,type RankingBucket} from '../../lib/community/sharedRankingsCache';
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
  const {store}=bucket();let time=1_000;const options={now:()=>time,wait:async(ms:number)=>{time+=ms;}};
  await sharedRankingResult(store,'all','before',async()=>result(),options);
  await assert.rejects(sharedRankingResult(store,'all','withdrawn',async()=>{throw Error('database overloaded');},options),/overloaded/);
  assert.deepEqual(await sharedRankingResult(store,'all','withdrawn',async()=>result(9),options),result(9));
  time+=RANKING_SNAPSHOT_DAY+1;assert.deepEqual(await sharedRankingResult(store,'all','withdrawn',async()=>result(8),options),result(8));
});

test('roster views upgrade a fresh legacy snapshot once and preserve its replay expiration',async()=>{
  const {store}=bucket();let time=1000,upgrades=0,full=0;
  const dated={...result(),replays:27};
  const load=async()=>{full++;return dated;};
  const options={now:()=>time,upgradeRoster:async(previous:CommunityRankings)=>{
    upgrades++;return {...previous,rosterProgressReady:true as const};
  }};
  await sharedRankingResult(store,'all','same',load,{now:()=>time});
  time+=RANKING_SNAPSHOT_DAY-60_000;
  const concurrent=await Promise.all(Array.from({length:3},()=>sharedRankingResult(store,'all','same',load,options)));
  assert.ok(concurrent.every(row=>row.rosterProgressReady&&row.replays===27));
  assert.equal(upgrades,1);
  assert.equal(full,1);
  time+=60_001;
  await sharedRankingResult(store,'all','same',load,{now:()=>time});
  assert.equal(full,2);
});

test('roster views can upgrade a stale legacy snapshot when the daily refresh was missed',async()=>{
  const {store}=bucket();let time=1000;
  await sharedRankingResult(store,'all','same',async()=>({...result(),replays:27}),{now:()=>time});
  time+=RANKING_SNAPSHOT_DAY*1.5;
  const upgraded=await sharedRankingResult(store,'all','same',async()=>{
    assert.fail('a roster upgrade should leave the stale replay aggregates for the daily refresh');
  },{now:()=>time,upgradeRoster:async previous=>({...previous,rosterProgressReady:true})});
  assert.equal(upgraded.rosterProgressReady,true);
  assert.equal(upgraded.replays,27);
  const refreshed=await sharedRankingResult(store,'all','same',async()=>result(15),{now:()=>time});
  assert.equal(refreshed.contributors,15);
});

test('a failed roster-only upgrade backs off and a known consent change returns no old snapshot',async()=>{
  const {store}=bucket();let time=1000,attempts=0;
  const load=async()=>result();
  await sharedRankingResult(store,'all','same',load,{now:()=>time});
  const options={now:()=>time,upgradeRoster:async()=>{attempts++;throw Error('database unavailable');}};
  const logError=console.error;console.error=()=>{};
  try{
    assert.deepEqual(await sharedRankingResult(store,'all','same',load,options),result());
    assert.deepEqual(await sharedRankingResult(store,'all','same',load,options),result());
    assert.equal(attempts,1);
    time+=300_001;
    await assert.rejects(sharedRankingResult(store,'all','same',load,{...options,upgradeRoster:async()=>{
      throw Object.assign(new Error('consent changed'),{code:'COMMUNITY_CONSENT_CHANGED'});
    }}),/consent changed/);
  }finally{console.error=logError;}
});
test('overload fallback is recent, consent-matched and bounded rather than extended indefinitely',async()=>{
  const {store}=bucket();let time=1_000;const options={now:()=>time,wait:async(ms:number)=>{time+=ms;}};
  await sharedRankingResult(store,'all','same',async()=>result(),options);time+=RANKING_SNAPSHOT_DAY+1;
  const overloaded=async():Promise<CommunityRankings>=>{throw Error('D1 DB is overloaded');};
  const error=console.error;console.error=()=>{};
  try{assert.deepEqual(await sharedRankingResult(store,'all','same',overloaded,options),result());time+=RANKING_SNAPSHOT_DAY+1;
    await assert.rejects(sharedRankingResult(store,'all','same',overloaded,options),/overloaded/);
  }finally{console.error=error;}
});
test('different filters stay separate and an abandoned lease can be recovered',async()=>{
  const {store}=bucket(),options={now:()=>20_000};
  await store.put('community-rankings/v2/all',JSON.stringify({lease:{expires:10_000,nonce:'abandoned'}}));
  assert.deepEqual(await sharedRankingResult(store,'all','same',async()=>result(12),options),result(12));
  assert.deepEqual(await sharedRankingResult(store,'jp','same',async()=>result(3),options),result(3));
});
test('an expired refresh owner cannot overwrite a newer aggregate or release its lease',async()=>{
  const {store}=bucket();let time=1_000,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),options={now:()=>time};
  const old=sharedRankingResult(store,'all','same',async()=>{await gate;return result(10);},options);
  await new Promise(resolve=>setTimeout(resolve,5));time+=120_001;
  assert.deepEqual(await sharedRankingResult(store,'all','same',async()=>result(11),options),result(11));
  release();await old;
  assert.deepEqual(await sharedRankingResult(store,'all','same',async()=>{throw Error('must use newer result');},options),result(11));
});
test('daily snapshots remain warm across visitors for a full day, and scheduled refresh can replace a fresh snapshot',async()=>{
  const {store}=bucket();let time=1_000,reads=0;
  const load=async()=>result(10+(++reads)),options={now:()=>time};
  assert.equal((await sharedRankingResult(store,'all','same',load,options)).contributors,11);
  time+=23*3600_000;
  assert.equal((await sharedRankingResult(store,'all','same',load,options)).contributors,11);assert.equal(reads,1);
  assert.equal((await sharedRankingResult(store,'all','same',load,{...options,forceRefresh:true})).contributors,12);assert.equal(reads,2);
});
test('a consent change supersedes an in-flight old lease without serving its old totals',async()=>{
  const {store}=bucket();let release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve),options={now:()=>1_000};
  const old=sharedRankingResult(store,'all','before',async()=>{await gate;return result(10);},options);
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await sharedRankingResult(store,'all','withdrawn',async()=>result(9),options)).contributors,9);
  release();await old;
  assert.equal((await sharedRankingResult(store,'all','withdrawn',async()=>{throw Error('must keep the new snapshot');},options)).contributors,9);
});
test('a stale visitor gets the last consent-matched snapshot without waiting for its single background refresh',async()=>{
  const {store}=bucket();let time=1_000,reads=0,release!:()=>void;
  await sharedRankingResult(store,'all','same',async()=>result(10),{now:()=>time});
  time+=RANKING_SNAPSHOT_DAY+1;
  const gate=new Promise<void>(resolve=>release=resolve),jobs:Promise<unknown>[]=[];
  const options={now:()=>time,background:(job:Promise<unknown>)=>{jobs.push(job);}};
  const load=async()=>{reads++;await gate;return result(12);};
  assert.equal((await sharedRankingResult(store,'all','same',load,options)).contributors,10);
  assert.equal((await sharedRankingResult(store,'all','same',load,options)).contributors,10);
  assert.equal(reads,1);assert.equal(jobs.length,1);
  release();await Promise.all(jobs);
  assert.equal((await sharedRankingResult(store,'all','same',load,options)).contributors,12);
});
test('scheduled refresh failure is reported while a safe previous snapshot remains available',async()=>{
  const {store}=bucket(),options={now:()=>1_000};
  await sharedRankingResult(store,'all','same',async()=>result(10),options);
  const error=console.error;console.error=()=>{};
  try{await assert.rejects(sharedRankingResult(store,'all','same',async()=>{throw Error('D1 failed');},{...options,forceRefresh:true}),/D1 failed/);}
  finally{console.error=error;}
  assert.equal((await sharedRankingResult(store,'all','same',async()=>result(12),options)).contributors,10);
});
test('R2 write throttling waits and retries the same conditional operation without duplicate database scans',async()=>{
  const {store}=bucket();let puts=0,reads=0,time=1_000;const pauses:number[]=[];
  const limited:RankingBucket={get:store.get,async put(...args){if(++puts===1||puts===3)throw Error('R2 TooManyRequests (10058)');return store.put(...args);}};
  const value=await sharedRankingResult(limited,'all','same',async()=>{reads++;return result();},{now:()=>time,wait:async ms=>{pauses.push(ms);time+=ms;}});
  assert.deepEqual(value,result());assert.equal(reads,1);assert.deepEqual(pauses,[1100,1100]);assert.equal(puts,4);
});
test('a cold cohort retries D1 overload once after its resource window, without caching an error',async()=>{
  const {store}=bucket();let time=1_000,reads=0;const pauses:number[]=[];
  const value=await sharedRankingResult(store,'en','current',async()=>{if(++reads===1)throw Error('D1_ERROR: D1 DB is overloaded');return result();},{now:()=>time,wait:async ms=>{pauses.push(ms);time+=ms;}});
  assert.deepEqual(value,result());assert.equal(reads,2);assert.deepEqual(pauses,[10100]);
});
