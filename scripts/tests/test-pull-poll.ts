import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import { bannerChoice, decodeBallot, encodeBallot, importGoals, parseBallot, setBannerChoice, type PollBanner } from '../../lib/polls/pull-poll';
import { pullPoll } from '../../lib/polls/pull-poll-api';

const banner:PollBanner={id:'test-pool',name:'Future banner',aliases:['Old title'],start:'2026-12-01',end:'2026-12-15',endAt:null,estimated:true,image:null,operators:['Exusiai','Texas']};
const banners=[banner];
test('compact choices apply to all operators; detailed choices survive sharing as custom',()=>{
  let ballot=setBannerChoice({},banner,'pull');
  assert.deepEqual(ballot[banner.id],{Exusiai:1,Texas:1});assert.equal(bannerChoice(ballot[banner.id],banner),'pull');
  ballot=setBannerChoice(ballot,banner,'maybe');assert.deepEqual(ballot[banner.id],{Exusiai:-1,Texas:-1});
  assert.equal(bannerChoice(ballot[banner.id],banner),'maybe');
  ballot[banner.id].Texas=6;assert.equal(bannerChoice(ballot[banner.id],banner),'custom');
  assert.deepEqual(decodeBallot(encodeBallot(ballot),banners),ballot);
  assert.equal(bannerChoice({Exusiai:0},banner),'');
  assert.equal(bannerChoice(setBannerChoice(ballot,banner,'skip')[banner.id],banner),'skip');
});
test('planner import matches aliases, preserves potentials and does not mutate planner goals',()=>{
  const goals=[{banner:'Old title',pulls:100,spendOn:'2026-12-15',targets:[{name:'Texas',copies:4}]}];
  assert.deepEqual(importGoals(goals,banners),{[banner.id]:{Exusiai:0,Texas:4}});
  assert.equal(goals[0].targets.length,1);
  assert.deepEqual(importGoals([{banner:'Future banner',pulls:10,spendOn:'2026-12-15'}],banners),{[banner.id]:{Exusiai:1,Texas:1}});
});
test('ballots reject injected operators, unknown banners, nonintegers and oversized shares',()=>{
  for(const value of [{wrong:{Texas:1}},{[banner.id]:{Unknown:1}},{[banner.id]:{Texas:7}},{[banner.id]:{Texas:1.5}},{[banner.id]:{Texas:'1'}}])assert.throws(()=>parseBallot(value,banners));
  assert.throws(()=>decodeBallot('a'.repeat(50001),banners));
  assert.deepEqual(parseBallot({[banner.id]:{}},banners),{});
});
function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of fs.readdirSync('migrations/accounts').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(`migrations/accounts/${file}`,'utf8'));
  const prepare=(sql:string,args:unknown[]=[])=>({bind:(...values:unknown[])=>prepare(sql,values),first:async()=>sqlite.prepare(sql).get(...args as never[])??null,run:async()=>sqlite.prepare(sql).run(...args as never[])});
  const db={prepare} as unknown as D1Database;
  async function call(owner:string|null,method='GET',body?:unknown,cookie='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'){
    let status=200,result:any;const headers:Record<string,string>={};
    const response={setHeader:(key:string,value:string)=>{headers[key]=value;},status:(n:number)=>{status=n;return response;},json:(v:unknown)=>{result=v;return response;}};
    await pullPoll({method,cookies:{'__Host-arkpedia-pull-poll':cookie},body} as unknown as NextApiRequest,response as unknown as NextApiResponse,db,owner,async()=>({banners}));
    return {status,result,headers};
  }
  return {sqlite,call};
}
test('anonymous submissions persist, update atomically and reject stale revisions and account changes',async()=>{
  const h=harness();try{
    const fresh=await h.call(null,'GET',undefined,'');assert.equal(fresh.status,200);assert.match(fresh.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await h.call(null,'PUT',{owner:null,revision:0,choices:{}} , '')).status,409);
    const choices=setBannerChoice({},banner,'pull');
    const first=await h.call(null,'PUT',{owner:null,revision:0,choices});assert.equal(first.status,200);assert.equal(first.result.revision,1);
    assert.deepEqual((await h.call(null)).result.choices,choices);
    assert.equal((await h.call(null,'PUT',{owner:null,revision:0,choices})).status,409);
    assert.equal((await h.call(null,'PUT',{owner:'other',revision:1,choices})).status,409);
    assert.equal((await h.call(null,'PUT',{owner:null,revision:1,choices:{bad:{Texas:2}}})).status,400);
    const updated=await h.call(null,'PUT',{owner:null,revision:1,choices:setBannerChoice({},banner,'skip')});assert.equal(updated.status,200);assert.equal(updated.result.revision,2);
    assert.equal((await h.call(null,'GET',undefined,'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')).result.revision,0);
  }finally{h.sqlite.close();}
});
test('explicit account submission replaces this browser’s anonymous entry; deletion cascades',async()=>{
  const h=harness();try{
    const choices=setBannerChoice({},banner,'maybe');
    await h.call(null,'PUT',{owner:null,revision:0,choices});
    h.sqlite.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt)VALUES(?,?,?,?,?)').run('u','Test','u@example.invalid','2026-01-01','2026-01-01');
    assert.equal((await h.call('u','PUT',{owner:'u',revision:0,choices})).status,200);
    assert.equal(h.sqlite.prepare('SELECT count(*) n FROM pull_poll_ballot').get().n,1);
    assert.equal((await h.call('u')).result.revision,1);
    h.sqlite.prepare('DELETE FROM "user" WHERE id=?').run('u');
    assert.equal(h.sqlite.prepare('SELECT count(*) n FROM pull_poll_ballot').get().n,0);
  }finally{h.sqlite.close();}
});

test('full banner rosters include featured five- and four-star operators',async()=>{
  const {pollBanners}=await import('../../lib/polls/pull-poll');
  const {getPullSchedule}=await import('../../lib/pulls/schedule');
  const {getAllHeadhuntingBanners}=await import('../../lib/gacha/headhuntingBannerData');
  const schedule=getPullSchedule(),lineups=getAllHeadhuntingBanners();
  const full=pollBanners(schedule,lineups);
  const match=full.find(b=>lineups.some(row=>row.name===b.name&&row.five_stars.length));
  assert.ok(match);
  const raw=lineups.find(b=>b.name===match.name)!;
  assert.ok(raw.five_stars.every(name=>match.operators.includes(name)));
});

test('anonymous writes have a browser-scoped rate limit without requiring an account row',async()=>{
  const h=harness();try{
    const choices=setBannerChoice({},banner,'pull');
    for(let revision=0;revision<10;revision++)assert.equal((await h.call(null,'PUT',{owner:null,revision,choices})).status,200);
    assert.equal((await h.call(null,'PUT',{owner:null,revision:10,choices})).status,429);
    assert.equal((await h.call(null)).result.revision,10);
  }finally{h.sqlite.close();}
});
