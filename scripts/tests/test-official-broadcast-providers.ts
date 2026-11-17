import assert from 'node:assert/strict';
import {test} from 'node:test';
import {youtubeBroadcast,bilibiliBroadcasts,loadOfficialBroadcasts} from '../../lib/home/officialBroadcastServer';
import {cachedBroadcastData,memoryBroadcastBucket} from '../../lib/home/officialBroadcastCache';
import type {BroadcastSource} from '../../lib/home/officialBroadcastSources';
const now=Date.parse('2026-11-16T12:00:00Z');
const source:Extract<BroadcastSource,{platform:'youtube'}>={id:'jp',platform:'youtube',region:'jp',game:'arknights',channelId:'official'};
test('only the official owner and provider-confirmed live state qualify',()=>{
  const video={id:'abcdefghijk',snippet:{channelId:'official',title:'Arknights 6th Anniversary Livestream',liveBroadcastContent:'upcoming'},liveStreamingDetails:{scheduledStartTime:'2026-11-16T11:00:00Z'}};
  assert.equal(youtubeBroadcast(video,source,'official',now)?.status,'upcoming');
  assert.equal(youtubeBroadcast(video,source,'impostor',now),null);
  video.snippet.liveBroadcastContent='live';
  assert.equal(youtubeBroadcast(video,source,'official',now)?.status,'ended','a live flag without an actual start cannot claim Live now');
  Object.assign(video.liveStreamingDetails,{actualStartTime:'2026-11-16T11:01:00Z'});
  assert.equal(youtubeBroadcast(video,source,'official',now)?.status,'live');
  Object.assign(video.liveStreamingDetails,{actualEndTime:'2026-11-16T11:59:00Z'});
  assert.equal(youtubeBroadcast(video,source,'official',now)?.status,'ended');
});
test('CN replay loops are not live; scheduled room becomes live only with verified UID and room',()=>{
  const cn:Extract<BroadcastSource,{platform:'bilibili'}>={id:'cn',platform:'bilibili',game:'arknights',region:'cn',uid:161775300,roomId:5555734};
  const room={uid:cn.uid,room_id:cn.roomId,live_status:2,title:'明日方舟 前瞻特别直播',live_time:'2026-11-16 19:00:00'};
  assert.deepEqual(bilibiliBroadcasts(null,room,cn,now),[]);
  const reservations=[{sid:1,title:room.title,live_plan_start_time:now/1000-3600}];
  assert.equal(bilibiliBroadcasts(reservations,room,cn,now)[0].status,'upcoming');
  room.live_status=1;
  const live=bilibiliBroadcasts(reservations,room,cn,now);
  assert.equal(live.length,1);assert.equal(live[0].status,'live');assert.equal(live[0].startsAt,'2026-11-16T11:00:00.000Z');
  room.uid=999;
  assert.equal(bilibiliBroadcasts(null,room,cn,now).length,0);
});
test('shared refresh lease makes concurrent cold readers perform one provider load',async()=>{
  const bucket=memoryBroadcastBucket();let calls=0;
  const options={ttl:()=>1000,maxAge:10000,valid:(value:unknown):value is number=>typeof value==='number'};
  const load=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return 42;};
  const results=await Promise.all(Array.from({length:8},()=>cachedBroadcastData(bucket,'concurrent',load,options)));
  assert.equal(calls,1);assert.ok(results.every(result=>result.value===42));
});
test('failed refresh retains bounded prior metadata and backs off without another provider call',async()=>{
  const bucket=memoryBroadcastBucket();let clock=now,calls=0;
  const options={ttl:()=>1000,maxAge:10000,valid:(value:unknown):value is number=>typeof value==='number',now:()=>clock};
  await cachedBroadcastData(bucket,'failure',async()=>1,options);clock+=2000;
  const fail=async()=>{calls++;throw Error('quota exceeded');};
  assert.deepEqual(await cachedBroadcastData(bucket,'failure',fail,options),{value:1,stale:true});
  assert.equal((await cachedBroadcastData(bucket,'failure',fail,options)).stale,true);
  assert.equal(calls,1);clock+=11000;
  await assert.rejects(cachedBroadcastData(bucket,'failure',fail,options),/temporarily unavailable/);
  assert.equal(calls,1);
});

test('bounded discovery is reused while fresh status checks still run; no secret reaches output',async()=>{
  const bucket=memoryBroadcastBucket();let searches=0,metadata=0,seeds=0;
  const json=async(raw:string,key?:string):Promise<Record<string,unknown>>=>{
    const url=new URL(raw);
    if(url.hostname.endsWith('bilibili.com'))return {code:0,data:url.pathname.includes('reservation')?null:{uid:161775300,room_id:5555734,live_status:2}};
    assert.equal(key,'private-test-key');
    if(url.pathname.endsWith('/search')){searches++;return {items:[]};}
    if(url.searchParams.get('part')==='snippet'){
      seeds++;return {items:[{snippet:{channelId:'UCverifiedEndfield'}},{snippet:{channelId:'UCverifiedEndfield'}}]};
    }
    metadata++;return {items:[]};
  };
  const first=await loadOfficialBroadcasts({bucket,key:'private-test-key',json,now});
  await loadOfficialBroadcasts({bucket,key:'private-test-key',json,now:now+30000});
  assert.equal(searches,8);assert.equal(seeds,1);assert.equal(metadata,0);
  assert.deepEqual(first.broadcasts,[]);assert.equal(first.degraded,false);
  assert.ok(!JSON.stringify(first).includes('private-test-key'));
});
