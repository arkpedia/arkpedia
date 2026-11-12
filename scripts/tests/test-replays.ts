import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Zip, ZipDeflate, zipSync,strToU8 } from 'fflate';
import { createReplaySession, ReplayRequestError } from '../../lib/account-import/yostar';
import { decodeReplay,stageMarkers,namespaceFor,needsReplay,replayHash,validateReplay,ReplayValidationError,type ReplayRecord } from '../../lib/replays/model';
import { syncReplays,type QueueOptions } from '../../lib/replays/queue';
import zip64Fixture from '../../tests/fixtures/replay-zip64.json';
const stage='main_00-01';
const payload=JSON.stringify({timestamp:1,journal:{metadata:{stageId:stage},squad:[],logs:[]}});
const encoded=(p=payload)=>Buffer.from(zipSync({default_entry:strToU8(p)})).toString('base64');
const markers=(n=1,has=1)=>stageMarkers({dungeon:{stages:{[stage]:{hasBattleReplay:has,startTimes:n,completeTimes:n,practiceTimes:0,state:3}}}});

test('stage invalidation ignores sign-in, isolates regions/accounts and notices replay removal',()=>{
  assert.equal(namespaceFor('en','1'),'en:1');assert.notEqual(namespaceFor('jp','1'),namespaceFor('en','1'));assert.throws(()=>namespaceFor('en','email@example.invalid'));
  const m=markers()[0],cached={stageId:stage,fingerprint:m.fingerprint,hash:'x'};
  assert.equal(needsReplay(m,cached),false);assert.equal(needsReplay(markers(2)[0],cached),true);assert.equal(needsReplay(markers(2,0)[0],cached),false);
});
test('archive validation accepts only the requested replay and rejects credentials, oversized and wrong-stage records',()=>{
  assert.equal(JSON.parse(decodeReplay(encoded(),stage)).journal.metadata.stageId,stage);
  assert.throws(()=>decodeReplay(encoded(),'main_00-02'));
  assert.throws(()=>validateReplay(JSON.stringify({...JSON.parse(payload),token:'not-allowed'}),stage));
  assert.throws(()=>decodeReplay(encoded(JSON.stringify({...JSON.parse(payload),padding:'x'.repeat(600_000)})),stage));
});
test('replay validation distinguishes stage identity from missing document sections without echoing raw data',()=>{
  for(const [value,message] of [
    ['private malformed payload',/not valid JSON/],
    [{},/readable journal/],
    [{journal:{}},/stage metadata/],
    [{journal:{metadata:{stageId:'private@example.invalid'}}},/valid stage ID/],
    [{journal:{metadata:{stageId:'main_00-02'},squad:[],logs:[]}},/belongs to main_00-02/],
    [{journal:{metadata:{stageId:stage},squad:null,logs:[]}},/squad list/],
    [{journal:{metadata:{stageId:stage},squad:[],logs:null}},/action list/],
  ] as const){
    assert.throws(()=>validateReplay(typeof value==='string'?value:JSON.stringify(value),stage),e=>e instanceof ReplayValidationError&&message.test(e.message)&&!e.message.includes('private'));
  }
});
test('ZIP64 per-entry sizes work without a ZIP64 archive end record', () => {
  assert.equal(decodeReplay(zip64Fixture.encoded, stage), validateReplay(payload, stage));
});
test('streaming ZIP descriptors and stored entries decode, but duplicate replay files are rejected', () => {
  const streaming = (count: number) => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, data) => { if (error) throw error; chunks.push(data); });
    for (let i = 0; i < count; i++) {
      const file = new ZipDeflate('default_entry'); zip.add(file); file.push(strToU8(payload), true);
    }
    zip.end(); return Buffer.concat(chunks).toString('base64');
  };
  assert.equal(decodeReplay(streaming(1), stage), validateReplay(payload, stage));
  const stored = Buffer.from(zipSync({default_entry: strToU8(payload)}, {level: 0})).toString('base64');
  assert.equal(decodeReplay(stored, stage), validateReplay(payload, stage));
  assert.throws(() => decodeReplay(streaming(2), stage), /duplicate replay files/);
});
test('archive errors distinguish a missing file from actual oversized output without exposing file names', () => {
  const missing = Buffer.from(zipSync({'private-name@example.invalid': strToU8(payload)})).toString('base64');
  assert.throws(() => decodeReplay(missing, stage), /contains no replay file \(1 entry\)/);
  assert.throws(() => decodeReplay(encoded('x'.repeat(600_000)), stage), /exceeds the 512 KB/);
  assert.throws(() => decodeReplay(Buffer.from('invalid archive').toString('base64'), stage), /not a readable ZIP/);
});
test('actual decompressed bytes enforce the limit even when ZIP headers claim a tiny file', () => {
  const archive = Buffer.from(zipSync({default_entry: strToU8('x'.repeat(2_000_000))}));
  const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  archive.writeUInt32LE(10, 22); // local original size
  archive.writeUInt32LE(10, central + 24); // directory original size
  assert.throws(() => decodeReplay(archive.toString('base64'), stage), /exceeds the 512 KB/);
});
test('replay sessions strictly sequence requests and invalidate uncertain sessions without retry or leaking errors',async()=>{
  const calls:string[]=[];
  const session=createReplaySession(async(url,request)=>{calls.push(request.headers.seqnum);assert.equal(url,'https://game.invalid/quest/getBattleReplay');return {status:200,json:{battleReplay:encoded()}};},'https://game.invalid','1','private-secret');
  await session.readReplay(stage);await session.readReplay(stage);assert.deepEqual(calls,['3','4']);
  let attempts=0;
  const bad=createReplaySession(async()=>{attempts++;throw Error('private-secret');},'https://game.invalid','1','private-secret');
  await assert.rejects(bad.readReplay(stage),e=>e instanceof ReplayRequestError&&!e.message.includes('private-secret'));
  await assert.rejects(bad.readReplay(stage));assert.equal(attempts,1);
  const throttled=createReplaySession(async()=>({status:429,json:null,headers:[['Retry-After','600']]}),'https://game.invalid','1','s');
  await assert.rejects(throttled.readReplay(stage),e=>e instanceof ReplayRequestError&&e.retryAfter===600);
});
test('Annihilation and ordinary stages use the same replay endpoint in a mixed sync',async()=>{
  const s=setup(),stages=['camp_01','main_00-01'];
  s.options.markers=stages.map(stageId=>({...markers()[0],stageId}));
  const requests:{stage:string;seq:string}[]=[];
  s.options.session=createReplaySession(async(url,request)=>{
    if(url!=='https://game.invalid/quest/getBattleReplay')return {status:404,json:{}};
    const stageId=JSON.parse(request.body!).stageId;
    requests.push({stage:stageId,seq:request.headers.seqnum});
    return {status:200,json:{battleReplay:encoded(payload.replaceAll(stage,stageId))}};
  },'https://game.invalid','1','private-secret');
  const result=await syncReplays(s.options);
  assert.equal(result.remaining,0);assert.equal(result.fetched,2);
  assert.deepEqual(requests,[{stage:'camp_01',seq:'3'},{stage:'main_00-01',seq:'4'}]);
  assert.deepEqual([...s.records.keys()],stages);
  await syncReplays(s.options);assert.equal(requests.length,2,'completed checkpoints are not fetched again');
});
function setup(){
  const records=new Map<string,ReplayRecord>();let fetched=0;const waits:number[]=[];
  const options:QueueOptions={namespace:'en:1',markers:markers(),session:{uid:'1',readReplay:async()=>{fetched++;return encoded();}},store:{read:async()=>[...records.values()],save:async r=>{records.set(r.stageId,r);},remove:async(_ns,id)=>{records.delete(id);}},signal:new AbortController().signal,progress:()=>{},check:()=>{},wait:async ms=>{waits.push(ms);},random:()=>0};
  return {options,records,waits,fetched:()=>fetched};
}
test('successful durable checkpoints skip unchanged stages and fetch only a changed stage',async()=>{
  const s=setup();await syncReplays(s.options);await syncReplays(s.options);assert.equal(s.fetched(),1);assert.deepEqual(s.waits,[3000]);
  s.options.markers=markers(2);await syncReplays(s.options);assert.equal(s.fetched(),2);
  s.options.markers=markers(2,0);await syncReplays(s.options);assert.equal(s.records.size,0);
});
test('bulk skips unsupported stage documents without overwriting copies and saves later stages to browser and cloud',async()=>{
  const s=setup();await syncReplays(s.options);
  const original=s.records.get(stage)!;
  const second='main_00-02',requests:string[]=[],uploads:string[]=[];
  s.options.markers=[...markers(2),{...markers()[0],stageId:second}];
  s.options.session.readReplay=async id=>{requests.push(id);return encoded(payload.replaceAll(stage,second));};
  s.options.cloud={manifest:async()=>[original],read:async()=>{throw Error('unexpected read');},save:async r=>{uploads.push(r.stageId);},mark:async()=>{throw Error('must not acknowledge rejected replay');},remove:async()=>{throw Error('must not delete');}};
  const result=await syncReplays(s.options);
  assert.deepEqual(requests,[stage,second]);assert.deepEqual(uploads,[second]);
  assert.equal(s.records.get(stage),original);assert.ok(s.records.has(second));
  assert.equal(result.checked,2);assert.equal(result.fetched,1);assert.equal(result.remaining,0);
  assert.deepEqual(result.skipped,[{stageId:stage,reason:'Replay belongs to main_00-02, not the requested stage.'}]);
  assert.match(result.message,/1 skipped/);assert.doesNotMatch(result.message,/^Auto-deploys are up to date/);
  // Rejected stages retain their old marker, so a later explicit sync retries them.
  s.options.cloud=undefined;await syncReplays(s.options);assert.deepEqual(requests,[stage,second,stage]);
});
test('single-stage invalid documents identify the stage and transport/privacy failures still stop bulk sync',async()=>{
  const s=setup();s.options.forceStage=stage;s.options.session.readReplay=async()=>encoded(payload.replaceAll(stage,'main_00-02'));
  await assert.rejects(syncReplays(s.options),e=>e instanceof ReplayValidationError&&e.message.startsWith(`${stage}:`));
  assert.equal(s.records.size,0);
  for(const failure of ['transport','privacy'] as const){
    const t=setup();let calls=0;
    t.options.markers.push({...markers()[0],stageId:'main_00-02'});
    t.options.session.readReplay=async()=>{calls++;if(failure==='transport')throw new ReplayRequestError('Connection stopped');return encoded(JSON.stringify({...JSON.parse(payload),token:'private-value'}));};
    await assert.rejects(syncReplays(t.options));assert.equal(calls,1);assert.equal(t.records.size,0);
  }
});
test('pause after a response cannot checkpoint or upload; failed storage is retryable',async()=>{
  const s=setup(),abort=new AbortController();s.options.signal=abort.signal;
  s.options.session.readReplay=async()=>{abort.abort();return encoded();};
  await assert.rejects(syncReplays(s.options),{name:'AbortError'});assert.equal(s.records.size,0);
  const t=setup();t.options.store.save=async()=>{throw Error('quota');};await assert.rejects(syncReplays(t.options),/quota/);assert.equal(t.records.size,0);
});
test('cloud restoration avoids Yostar and unchanged replay contents upload only the fingerprint',async()=>{
  const s=setup(),canonical=validateReplay(payload,stage),hash=await replayHash(canonical);let saves=0,marks=0,reads=0;
  const r:ReplayRecord={namespace:'en:1',stageId:stage,fingerprint:markers()[0].fingerprint,hash,payload:canonical,savedAt:1};
  s.options.cloud={manifest:async()=>[r],read:async()=>{reads++;return r;},save:async()=>{saves++;},mark:async()=>{marks++;},remove:async()=>{}};
  await syncReplays(s.options);assert.equal(reads,1);assert.equal(s.fetched(),0);
  assert.deepEqual(s.waits,[],'cloud restoration must not wait for a game-download slot');
  s.options.markers=markers(2);await syncReplays(s.options);assert.equal(s.fetched(),1);assert.equal(saves,0);assert.equal(marks,1);
});
test('queue respects batch limits and identity changes before further network requests',async()=>{
  const s=setup();s.options.limit=0;assert.equal((await syncReplays(s.options)).remaining,1);assert.equal(s.fetched(),0);
  s.options.limit=200;s.options.check=()=>{throw Error('account switched');};await assert.rejects(syncReplays(s.options),/account switched/);assert.equal(s.fetched(),0);
});

test('equal stage markers with conflicting local/cloud contents are resolved from the game',async()=>{
  const s=setup();await syncReplays(s.options);
  const current=s.records.get(stage)!;
  const stalePayload=validateReplay(payload.replace('"timestamp":1','"timestamp":0'),stage);
  let remote={...current,payload:stalePayload,hash:await replayHash(stalePayload)};
  let uploads=0;
  s.options.cloud={manifest:async()=>[remote],read:async()=>{throw Error('conflicts must not restore a guessed winner');},save:async(record,expectedHash)=>{assert.equal(expectedHash,remote.hash);uploads++;if(uploads===1)throw Error('upload interrupted');remote=record;},mark:async()=>{throw Error('contents changed');},remove:async()=>{}};
  await assert.rejects(syncReplays(s.options),/upload interrupted/);
  assert.equal(s.fetched(),2);
  await syncReplays(s.options);
  assert.equal(s.fetched(),3);assert.equal(uploads,2);assert.equal(remote.hash,current.hash);
  await syncReplays(s.options);assert.equal(s.fetched(),3);
});

test('replay failures distinguish HTTP, game result and missing payload without exposing response data',async()=>{
  for(const [response,expected] of [
    [{status:404,json:{message:'private-secret'}},/main_00-01.*HTTP 404/],
    [{status:200,json:{result:2,message:'private-secret'}},/result 2/],
    [{status:200,json:{result:'private-secret'}},/game refused/],
    [{status:200,json:{result:0,secret:'private-secret'}},/contained no auto-deploy/],
  ] as const){
    let attempts=0;
    const session=createReplaySession(async()=>{attempts++;return response;},'https://game.invalid','1','private-secret');
    await assert.rejects(session.readReplay(stage),e=>e instanceof ReplayRequestError&&expected.test(e.message)&&!e.message.includes('private-secret'));
    await assert.rejects(session.readReplay(stage));assert.equal(attempts,1);
  }
});


test('explicit sync continues beyond 200 stages, acquires admission only for fetches, and pauses before an unpermitted request',async()=>{
  const s=setup();let permits=0,requests=0;
  s.options.markers=Array.from({length:205},(_,i)=>({...markers()[0],stageId:`main_01-${i}`}));
  s.options.permit=async()=>{permits++;};
  s.options.session.readReplay=async id=>{requests++;return encoded(payload.replaceAll(stage,id));};
  const result=await syncReplays(s.options);
  assert.equal(result.remaining,0);assert.equal(s.records.size,205);assert.equal(permits,205);assert.equal(requests,205);
  await syncReplays(s.options);assert.equal(permits,205,'unchanged stages need neither admission nor game requests');
  s.options.forceStage=s.options.markers[0].stageId;
  s.options.permit=async()=>{throw Error('admission unavailable');};
  await assert.rejects(syncReplays(s.options),/admission unavailable/);assert.equal(requests,205);
  const abort=new AbortController();s.options.signal=abort.signal;s.options.permit=async()=>{abort.abort();};
  await assert.rejects(syncReplays(s.options),{name:'AbortError'});assert.equal(requests,205);
});
