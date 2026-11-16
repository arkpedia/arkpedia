import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import { bannerChoice, decodeBallot, encodeBallot, importGoals, parseBallot, pollBanners, setBannerChoice, stampKey, constrainOwned, activePollBanners, currentBallot, type PollBanner } from '../../lib/polls/pull-poll';
import type { UpcomingBanner } from '../../lib/pulls/pulls';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';
import { pullPoll } from '../../lib/polls/pull-poll-api';

const banner:PollBanner={id:'test-pool',name:'Future banner',aliases:['Old title'],start:'2036-12-01',end:'2036-12-15',endAt:null,estimated:true,image:null,operators:['Exusiai','Texas']};
const banners=[banner];
test('compact choices apply to all operators; detailed choices survive sharing as custom',()=>{
  let ballot=setBannerChoice({},banner,'pull');
  assert.deepEqual(ballot[banner.id],{Exusiai:1,Texas:1});assert.equal(bannerChoice(ballot[banner.id],banner),'pull');
  ballot=setBannerChoice(ballot,banner,'maybe');assert.deepEqual(ballot[banner.id],{Exusiai:-1,Texas:-1});
  assert.equal(bannerChoice(ballot[banner.id],banner),'maybe');
  ballot[banner.id].Texas=6;assert.equal(bannerChoice(ballot[banner.id],banner),'custom');
  assert.deepEqual(decodeBallot(encodeBallot(ballot),banners),ballot);
  assert.equal(bannerChoice({Exusiai:0},banner),'custom');
  assert.equal(bannerChoice(setBannerChoice(ballot,banner,'skip')[banner.id],banner),'skip');
});
test('planner import matches aliases, preserves potentials and does not mutate planner goals',()=>{
  const goals=[{banner:'Old title',pulls:100,spendOn:'2026-12-15',targets:[{name:'Texas',copies:4}]}];
  assert.deepEqual(importGoals(goals,banners),{[banner.id]:{Exusiai:0,Texas:4}});
  assert.equal(goals[0].targets.length,1);
  assert.deepEqual(importGoals([{banner:'Future banner',pulls:10,spendOn:'2026-12-15'}],banners),{[banner.id]:{Exusiai:1,Texas:1}});
});
test('limited banner Pull includes featured six/five-stars and skips returning limiteds',()=>{
  const returning=['SilverAsh the Reignfrost','Exusiai the New Covenant','Lappland the Decadenza'];
  const scheduled={...banner,sixStars:['Talulah','Тоска'],alsoRatedUp:returning,category:'limited',poolId:'LIMITED_79_0_1'} as unknown as UpcomingBanner;
  const lineup={name:banner.name,pull_type:'limited',six_stars:scheduled.sixStars,five_stars:['Ольга'],four_stars:[],rate_up_six_stars:returning} as unknown as HeadhuntingBanner;
  const limited=pollBanners([scheduled],[lineup])[0];
  assert.deepEqual(limited.returningOperators,returning);
  assert.equal(limited.operators.length,6);
  const choices={Talulah:1,'Тоска':1,...Object.fromEntries(returning.map(name=>[name,0])),'Ольга':1};
  const ballot=setBannerChoice(setBannerChoice({},limited,'maybe'),limited,'pull');
  assert.deepEqual(ballot[limited.id],choices);
  assert.equal(bannerChoice(ballot[limited.id],limited),'pull');
  assert.deepEqual(decodeBallot(encodeBallot(ballot),[limited]),ballot);
  assert.equal(bannerChoice({...ballot[limited.id],[returning[0]]:1},limited),'pull');
  assert.equal(parseBallot({[limited.id]:{[returning[0]]:6}},[limited])[limited.id][returning[0]],6);
  const goal={banner:limited.name,spendOn:limited.end,pulls:100};
  assert.deepEqual(importGoals([goal],[limited])[limited.id],choices);
  assert.equal(importGoals([{...goal,targets:[{name:returning[0],copies:3}]}],[limited])[limited.id][returning[0]],3);
  const regular=pollBanners([{...scheduled,category:'standard'}],[])[0];
  assert.equal(setBannerChoice({},regular,'pull')[regular.id].Talulah,1);assert.equal(setBannerChoice({},regular,'pull')[regular.id][returning[0]],-1);
});
test('ballots reject injected operators, unknown banners, nonintegers and oversized shares',()=>{
  for(const value of [{wrong:{Texas:1}},{[banner.id]:{Unknown:1}},{[banner.id]:{Texas:7}},{[banner.id]:{Texas:1.5}},{[banner.id]:{Texas:'1'}}])assert.throws(()=>parseBallot(value,banners));
  assert.throws(()=>decodeBallot('a'.repeat(50001),banners));
  assert.deepEqual(parseBallot({[banner.id]:{}},banners),{});
});
function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of fs.readdirSync('migrations/accounts').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(`migrations/accounts/${file}`,'utf8'));
  const prepare=(sql:string,args:unknown[]=[])=>({bind:(...values:unknown[])=>prepare(sql,values),first:async()=>sqlite.prepare(sql).get(...args as never[])??null,run:async()=>sqlite.prepare(sql).run(...args as never[]),all:async()=>({results:sqlite.prepare(sql).all(...args as never[])})});
  const db={prepare,batch:async(statements:ReturnType<typeof prepare>[])=>Promise.all(statements.map(s=>s.all()))} as unknown as D1Database;
  async function call(owner:string|null,method='GET',body?:unknown,cookie='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',query:Record<string,string>={}){
    let status=200,result:any;const headers:Record<string,string>={};
    const response={setHeader:(key:string,value:string)=>{headers[key]=value;},status:(n:number)=>{status=n;return response;},json:(v:unknown)=>{result=v;return response;}};
    await pullPoll({method,cookies:{'__Host-arkpedia-pull-poll':cookie},body,query} as unknown as NextApiRequest,response as unknown as NextApiResponse,db,owner,async()=>({banners}));
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


test('public results count mixed choices and potentials without exposing ballot identities',async()=>{
  const h=harness();try{
    await h.call(null,'PUT',{owner:null,revision:0,choices:{[banner.id]:{Exusiai:1,Texas:-1}}});
    await h.call(null,'PUT',{owner:null,revision:0,choices:setBannerChoice({},banner,'skip')},'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
    await h.call(null,'PUT',{owner:null,revision:0,choices:{[banner.id]:{Exusiai:6}}},'cccccccc-cccc-4ccc-cccc-cccccccccccc');
    const {result}=await h.call(null,'GET',undefined,'',{view:'results'});
    assert.equal(result.ballots,3);assert.deepEqual(result.banners.map((r:any)=>({...r})),[{id:banner.id,answers:3,pull:2,maybe:0,skip:1}]);
    const op=result.operators.find((r:any)=>r.name==='Exusiai');assert.equal(op.want,2);assert.equal(op.totalPotential,7);assert.equal(op.maxPotential,1);assert.deepEqual(op.potentials,[1,0,0,0,0,1]);
    assert.ok(!JSON.stringify(result).includes('voter'));assert.ok(!JSON.stringify(result).includes('aaaa'));
  }finally{h.sqlite.close();}
});
test('classified banners accept an explicit banner vote without inventing operator goals',()=>{
  const pending={...banner,operators:[],newOperators:[],sixStars:[]};assert.equal(bannerChoice(setBannerChoice({},pending,'pull')[pending.id],pending),'pull');const ballot=setBannerChoice({},pending,'maybe');
  assert.equal(bannerChoice(ballot[pending.id],pending),'maybe');assert.deepEqual(parseBallot(ballot,[pending]),ballot);
  assert.throws(()=>parseBallot({[pending.id]:{Exusiai:1}},[pending]));
});
test('planner sync preserves resources, budgets, other goals and local Maybe choices',async()=>{
  const {emptyPullPlan,pollIntoPlanner,plannerIntoPoll}=await import('../../lib/polls/pull-poll-sync');
  const plan={...emptyPullPlan(),orundum:'12345',goals:[{banner:banner.name,spendOn:banner.end,pulls:88,targets:[{name:'Exusiai',copies:2}]},{banner:'Other',spendOn:'2027-01-01',pulls:50}]};
  const ballot={[banner.id]:{Exusiai:4 as const,Texas:-1 as const}};
  const next=pollIntoPlanner(plan,ballot,banners);assert.equal(next.orundum,'12345');assert.equal(next.goals[0].pulls,88);assert.deepEqual(next.goals[0].targets,[{name:'Exusiai',copies:4}]);assert.deepEqual(next.goals[1],plan.goals[1]);assert.equal(plan.goals[0].targets![0].copies,2);
  const restored=plannerIntoPoll(ballot,{...next,goals:[{...next.goals[0],targets:[{name:'Exusiai',copies:6}]}]},banners);assert.deepEqual(restored,{[banner.id]:{Exusiai:6,Texas:-1}});
  assert.equal(pollIntoPlanner(next,{[banner.id]:{}},banners).goals.length,1);
  assert.deepEqual(plannerIntoPoll(ballot,{...plan,goals:[]},banners),{[banner.id]:{Exusiai:0,Texas:-1}});
});

test('only debut, limited and event-rerun banners enter the poll; old rate-ups remain optional',async()=>{
  const {getPullSchedule}=await import('../../lib/pulls/schedule');const {getAllHeadhuntingBanners}=await import('../../lib/gacha/headhuntingBannerData');
  const catalogue=pollBanners(getPullSchedule(),getAllHeadhuntingBanners());
  assert.ok(catalogue.length>0);assert.ok(catalogue.every(b=>!/Kernel|Standard Pool|Joint Operation|Orienteering|Locating/i.test(b.name)));
  const chaos=catalogue.find(b=>b.name==='Deterministic Chaos')!;assert.ok(chaos);assert.deepEqual(chaos.newOperators,['Aphrissa','Pedro']);
  const ballot=setBannerChoice({},chaos,'pull');assert.deepEqual(ballot[chaos.id],{Aphrissa:1,Pedro:1,Wulfenite:-1});
  assert.equal(bannerChoice({...ballot[chaos.id],Pedro:0,Wulfenite:0},chaos),'pull');
  const rerun=catalogue.find(b=>b.rerun)!;assert.ok(rerun);assert.ok(Object.values(setBannerChoice({},rerun,'pull')[rerun.id]).every(w=>w===0||w===1));
});
test('five-star goals only become Dolphin at P6, and ownership raises the target floor',()=>{
  const b={...banner,sixStars:['Exusiai'],newOperators:['Exusiai','Texas']};const portraits={Exusiai:{icon:null,rarity:6},Texas:{icon:null,rarity:5}};
  for(const p of [1,2,3,4,5] as const)assert.equal(stampKey({Exusiai:1,Texas:p},b,portraits),'pull');
  assert.equal(stampKey({Exusiai:1,Texas:6},b,portraits),'dolphin');
  const owned={Exusiai:5,Texas:6};const ballot=setBannerChoice({},b,'pull',owned);assert.deepEqual(ballot[b.id],{Exusiai:6,Texas:0});
  assert.equal(bannerChoice(ballot[b.id],b,owned),'pull');assert.equal(stampKey(ballot[b.id],b,portraits,owned),'pull');
  assert.deepEqual(constrainOwned({[b.id]:{Exusiai:2,Texas:-1}},owned),{[b.id]:{Exusiai:6,Texas:-1}});
});
test('exact closing instants remove banners and historical drafts prune safely',()=>{
  const end='2026-12-15T15:59:59Z',b={...banner,endAt:end};assert.equal(activePollBanners([b],Date.parse(end)-1).length,1);assert.equal(activePollBanners([b],Date.parse(end)).length,0);
  assert.deepEqual(currentBallot({expired:{Old:6},[banner.id]:{Texas:2}},banners),{[banner.id]:{Texas:2}});
});

test('owned target potentials round-trip as additional planner copies',async()=>{
  const {pollIntoPlanner,plannerIntoPoll,emptyPullPlan}=await import('../../lib/polls/pull-poll-sync');
  const owned={Exusiai:5};const ballot={[banner.id]:{Exusiai:6 as const,Texas:-1 as const}};
  const plan=pollIntoPlanner({...emptyPullPlan(),orundum:'5000'},ballot,banners,owned);
  assert.deepEqual(plan.goals[0].targets,[{name:'Exusiai',copies:1}]);assert.equal(plan.orundum,'5000');
  assert.deepEqual(plannerIntoPoll(ballot,plan,banners,owned),ballot);
});
