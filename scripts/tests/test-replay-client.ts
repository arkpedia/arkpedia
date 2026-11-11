import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { requestReplayPermit } from '../../lib/replays/permit';
import { replayCloud } from '../../lib/replays/cloud';

function browserStorage() {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const entries=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)}});
  return ()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');};
}

test('waiting clients keep their place, follow short server delays and cancel without contacting the game',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const restore=browserStorage();t.after(restore);
  const requests:string[]=[],positions:number[]=[];
  t.mock.method(globalThis,'fetch',async(_url:RequestInfo|URL,init:RequestInit={})=>{
    requests.push(init.method!);assert.equal(init.credentials,'omit');assert.deepEqual(Object.keys(JSON.parse(init.body as string)),['client']);
    return Response.json(init.method==='DELETE'?{cancelled:true}:{granted:false,retryAfterMs:500,position:3});
  });
  const abort=new AbortController();
  const pending=requestReplayPermit(abort.signal,position=>positions.push(position!));
  const stopped=assert.rejects(pending,{name:'AbortError'});
  await setImmediate();
  for(let i=0;i<5;i++){t.mock.timers.tick(600);await setImmediate();}
  assert.equal(requests.filter(method=>method==='POST').length,6,'no exponential backoff after repeated waits');
  assert.deepEqual(positions,Array(6).fill(3));
  abort.abort();await stopped;await setImmediate();
  assert.equal(requests.at(-1),'DELETE');
  const count=requests.length;t.mock.timers.tick(60000);await setImmediate();assert.equal(requests.length,count);
});

test('admission failures and delayed grants fail closed, while legacy grant responses still work',async t=>{
  const restore=browserStorage();t.after(restore);
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({granted:true}));
  await requestReplayPermit(new AbortController().signal);
  fetch.mock.mockImplementation(async()=>Response.json({error:'unavailable'},{status:503}));
  await assert.rejects(requestReplayPermit(new AbortController().signal),/temporarily unavailable/);
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let time=0,posts=0;t.mock.method(performance,'now',()=>time);
  const abort=new AbortController();
  fetch.mock.mockImplementation(async(_url:RequestInfo|URL,init:RequestInit={})=>{
    if(init.method==='POST'){posts++;time+=1500;}
    return Response.json({granted:true});
  });
  let waiting=false;
  const pending=requestReplayPermit(abort.signal,()=>{waiting=true;});
  const stopped=assert.rejects(pending,{name:'AbortError'});
  await setImmediate();assert.equal(waiting,true);assert.equal(posts,1);
  abort.abort();await stopped;
});

test('cloud reads have their own short pacing and pause cancels a pending restore',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_url:RequestInfo|URL,init:RequestInit={})=>{
    calls++;assert.equal(init.credentials,'same-origin');assert.ok(init.signal);
    return Response.json({records:[],record:{stageId:'main_00-01'}});
  });
  const abort=new AbortController(),cloud=replayCloud('owner','en:1',abort.signal);
  await cloud.manifest();assert.equal(calls,1);
  const first=cloud.read('main_00-01');await setImmediate();assert.equal(calls,1);
  t.mock.timers.tick(700);await first;assert.equal(calls,2);
  const next=cloud.read('main_00-02');const stopped=assert.rejects(next,{name:'AbortError'});
  abort.abort();await stopped;t.mock.timers.tick(10000);assert.equal(calls,2);
});
