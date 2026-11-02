import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { AccountRecord } from '../../lib/account/accountStore';
import { communitySnapshot, parseCommunitySnapshot, type CommunityChoices, type CommunitySnapshot } from '../../lib/community/model';
import { createCommunityHandler } from '../../lib/community/api';

const clock=Date.parse('2026-11-02T12:00:00Z');
const all:CommunityChoices={stats:true,shareTag:true,openRequests:true};
const statsOnly:CommunityChoices={stats:true,shareTag:false,openRequests:false};
function snapshot(uid='100'):CommunitySnapshot{return {server:'en',uid,doctor:'Doctor#1234',importedAt:new Date(clock).toISOString(),slots:3,equipmentKnown:true,
  operators:[{operator:'Thorns',elite:2,level:60,m0:0,m1:0,m2:3,modules:{0:3}}],skins:[{skin:'char_293_thorns@test#1',equipped:true}],
  supports:[{operator:'Thorns',elite:2,level:60,skill:3,mastery:2,module:'uniequip_002_thorns',moduleLevel:3}]};}
function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of fs.readdirSync('migrations/accounts').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(`migrations/accounts/${file}`,'utf8'));
  const prepare=(sql:string,args:unknown[]=[])=>({bind:(...values:unknown[])=>prepare(sql,values),first:async()=>sqlite.prepare(sql).get(...args as never[])??null,
    all:async()=>{const statement=sqlite.prepare(sql);return {success:true,results:statement.columns().length?statement.all(...args as never[]):(statement.run(...args as never[]),[])};},run:async()=>({meta:sqlite.prepare(sql).run(...args as never[])})});
  let queue=Promise.resolve<unknown>(null);
  const db={prepare,batch:(statements:ReturnType<typeof prepare>[])=>{const next=queue.then(async()=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}});queue=next.catch(()=>null);return next;}} as unknown as D1Database;
  const limiter={limit:async()=>({success:true})};
  const env={ARKPEDIA_ACCOUNTS_DB:db,ARKPEDIA_AUTH_URL:'https://preview.example.invalid',BETTER_AUTH_SECRET:'test-only-secret-long-enough-for-hmac-01234567',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',DISCORD_CLIENT_ID:'',DISCORD_CLIENT_SECRET:'',ACCOUNT_TRAFFIC_LIMIT:limiter,ACCOUNT_IP_LIMIT:limiter};
  function user(id:string){sqlite.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt)VALUES(?,?,?,?,?)').run(id,'Private Provider Name',id+'@example.invalid','2026-01-01','2026-01-01');sqlite.prepare('INSERT INTO arkpedia_profile(userId,username,usernameKey,updatedAt)VALUES(?,?,?,?)').run(id,id,id,'2026-01-01');}
  async function call(kind:'sharing'|'stats'|'supports'|'availability',owner:string|null,method='GET',body?:unknown,query:Record<string,string>={},headers:Record<string,string>={}){
    let status=200,result:any;const response={setHeader:()=>{},status:(n:number)=>{status=n;return response;},json:(v:unknown)=>{result=v;return response;},end:()=>{}};
    await createCommunityHandler(kind,{resolveEnv:()=>env,authenticate:async()=>owner,now:()=>clock})({method,headers:{origin:env.ARKPEDIA_AUTH_URL,'content-type':'application/json',...headers},query,body:body&&typeof body==='object'?{owner,...body}:body} as NextApiRequest,response as unknown as NextApiResponse);
    return {status,result};
  }
  const publish=(owner:string,uid:string,choices=all,changes:Partial<CommunitySnapshot>={})=>call('sharing',owner,'PUT',{action:'consent',revision:0,choices,snapshot:{...snapshot(uid),...changes}});
  return {sqlite,db,env,user,call,publish};
}
test('community projection excludes private fields, counts in-progress M3 and keeps the support skill at its actual mastery',()=>{
  const account:AccountRecord={version:1,server:'en',importedAt:new Date(clock).toISOString(),doctor:'Doctor#1234',operators:['Thorns'],skins:['skin@x#1'],cleared:['PRIVATE_STAGE'],wallet:{orundum:999,originitePrime:100,permits:2,yellowCerts:3,monthlyCardUntil:null},
    operatorBuilds:{Thorns:{elite:2,level:60,skillLevel:7,masteries:{2:3},modules:{0:2}}},outfits:{Thorns:'skin@x#1'},profile:{level:120,bio:'PRIVATE BIO',registeredAt:null,secretary:null,uid:'123',friendSlots:{used:47,limit:50},supports:[{name:'Thorns',rarity:6,elite:2,level:60,potential:6,skill:3,skillMastery:2,module:'uniequip_002_thorns',moduleLevel:3}]}};
  const projected=communitySnapshot(account,all);
  assert.equal(projected.operators[0].m2,3);assert.equal(projected.supports[0].mastery,2);assert.equal(projected.operators[0].modules?.[0],3);assert.equal(projected.slots,3);
  assert.ok(!JSON.stringify(projected).includes('PRIVATE'));assert.ok(!JSON.stringify(projected).includes('orundum'));
  const privateStats=communitySnapshot(account,statsOnly);assert.equal(privateStats.doctor,null);assert.deepEqual(privateStats.supports,[]);
  const supports=communitySnapshot(account,{...all,stats:false});assert.deepEqual(supports.operators,[]);assert.deepEqual(supports.skins,[]);
  assert.throws(()=>parseCommunitySnapshot({...projected,token:'PRIVATE'},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...projected,operators:[{...projected.operators[0],elite:1}]},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...projected,operators:[{...projected.operators[0],modules:[]}]},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...projected,supports:[{...projected.supports[0],skill:null}]},all,clock));
  assert.equal(privateStats.slots,null);
});
test('masteries use E2 owners and modules use their level-eligible cohort, excluding unknown levels',async()=>{
  const h=harness();
  try{
    for(let i=0;i<26;i++){
      h.user('relative'+i);
      const s=snapshot(String(700+i));
      s.operators[0]={operator:'Thorns',elite:i<21?2:1,level:i<10?60:i<20?59:i===20?null:80,
        m0:0,m1:0,m2:i<8?3:0,modules:i<10?{0:i<5?1:3}:{}};
      assert.equal((await h.publish('relative'+i,String(700+i),statsOnly,s)).status,200);
    }
    const op=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(op.builds,26);assert.equal(op.masteryOwners,21);assert.deepEqual(op.skills,[0,0,8]);
    assert.deepEqual(op.moduleGroups.map((g:any)=>[g.level,g.owners]),[[40,20],[50,20],[60,10]]);
    assert.deepEqual(op.moduleGroups.find((g:any)=>g.level===60).modules[0],[10,5,5]);
    // E2 59 is outside the six-star module denominator; E1 80 and unknown levels never qualify.
    await h.call('sharing','relative0','DELETE',{});
    const smaller=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(smaller.masteryOwners,20);
    assert.equal(smaller.moduleGroups.some((g:any)=>g.level===60),false);
    assert.equal(smaller.moduleGroups.find((g:any)=>g.level===50).owners,19);
  }finally{h.sqlite.close();}
});

test('public statistics use only opted-in contributors and suppress small or unknown build samples',async()=>{
  const h=harness();
  try{
    h.user('private');assert.equal((await h.publish('private','100',{stats:false,shareTag:true,openRequests:true})).status,200);
    assert.deepEqual((await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result,{contributors:0,owned:null});
    for(let i=0;i<12;i++){
      h.user('u'+i);const s=snapshot(String(200+i));s.operators[0]={operator:'Thorns',elite:i<2?1:2,level:60,m0:0,m1:0,m2:i<2?0:3,modules:i<2?{}:{0:i<5?1:3}};s.skins[0].equipped=i<3;
      assert.equal((await h.publish('u'+i,String(200+i),statsOnly,s)).status,200);
    }
    const op=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(op.contributors,12);assert.equal(op.owned,12);assert.equal(op.builds,12);assert.equal(op.e1,2);assert.equal(op.e2,10);assert.deepEqual(op.skills,[0,0,10]);assert.equal(op.masteryOwners,10);assert.equal(op.moduleGroups.find((g:any)=>g.level===60).owners,10);assert.deepEqual(op.moduleGroups.find((g:any)=>g.level===60).modules[0],[10,7,7]);
    const skin=(await h.call('stats',null,'GET',undefined,{server:'en',skin:'char_293_thorns@test#1'})).result;assert.equal(skin.equipped,3);assert.equal(skin.equipmentOwners,12);
    assert.ok(!JSON.stringify(op).includes('Doctor'));assert.ok(!JSON.stringify(op).includes('example.invalid'));
    assert.equal((await h.call('stats',null,'GET',undefined,{server:'jp',operator:'Thorns'})).result.owned,null);
    const off=await h.call('sharing','u0','DELETE',{});assert.equal(off.result.stats,false);
    assert.equal((await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result.contributors,11);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_operator WHERE userId=?').get('u0')?.n,0);
  }finally{h.sqlite.close();}
});

test('statistics retain older latest imports, replace rather than duplicate them, and keep supports fresh',async()=>{
  const h=harness(),oldDate=new Date(clock-365*86400_000).toISOString();
  try{
    for(let i=0;i<10;i++){
      h.user('historic'+i);
      assert.equal((await h.publish('historic'+i,String(900+i),all,{importedAt:oldDate})).status,200);
    }
    const operator=async()=>(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    const outfit=async()=>(await h.call('stats',null,'GET',undefined,{server:'en',skin:'char_293_thorns@test#1'})).result;
    assert.equal((await operator()).contributors,10);assert.equal((await operator()).skills[2],10);
    assert.equal((await outfit()).equipped,10);
    assert.equal((await h.call('supports',null,'GET',undefined,{server:'en'})).result.listings.length,0);
    const updated=snapshot('900');updated.operators[0].m2=0;updated.operators[0].modules={0:2};updated.skins[0].equipped=false;
    assert.equal((await h.call('sharing','historic0','PUT',{revision:1,action:'refresh',choices:all,snapshot:updated})).status,200);
    const current=await operator();
    assert.equal(current.contributors,10);assert.equal(current.owned,10);assert.equal(current.skills[2],9);
    assert.deepEqual(current.moduleGroups.find((g:any)=>g.level===60).modules[0],[10,10,9]);
    assert.equal((await outfit()).equipped,9);
    assert.equal((await h.call('supports',null,'GET',undefined,{server:'en'})).result.listings.length,1);
    assert.equal((await h.call('sharing','historic0','PUT',{revision:2,action:'refresh',choices:all,snapshot:{...snapshot('900'),importedAt:oldDate}})).status,409);
    await h.call('sharing','historic1','DELETE',{});
    assert.deepEqual(await operator(),{contributors:9,owned:null});
    assert.deepEqual(await outfit(),{contributors:9,owned:null});
  }finally{h.sqlite.close();}
});

test('a large ownership sample cannot expose small mastery or module cohorts',async()=>{
  const h=harness();
  try{
    for(let i=0;i<10;i++){
      h.user('small'+i);const s=snapshot(String(800+i));
      if(i===9)s.operators[0]={operator:'Thorns',elite:1,level:80,m0:0,m1:0,m2:0,modules:{}};
      assert.equal((await h.publish('small'+i,String(800+i),statsOnly,s)).status,200);
    }
    const op=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(op.owned,10);assert.equal(op.e2,9);
    assert.equal(op.masteryOwners,undefined);assert.equal(op.skills,undefined);assert.deepEqual(op.moduleGroups,[]);
  }finally{h.sqlite.close();}
});
test('support finder excludes unconsented, full, unknown and expired listings and can find weaker exact masteries',async()=>{
  const h=harness();try{
    const examples=[['low',1,20,0,2],['strong',2,90,3,3],['unknown',2,60,null,3],['full',2,60,2,0],['slots-unknown',2,60,2,null],['old',2,60,2,3]] as const;
    for(let i=0;i<examples.length;i++){
      const [owner,elite,level,mastery,slots]=examples[i];h.user(owner);
      assert.equal((await h.publish(owner,String(300+i),all,{slots,importedAt:new Date(clock-(owner==='old'?8:0)*86400_000).toISOString(),supports:[{operator:'Thorns',elite,level,skill:3,mastery,module:null,moduleLevel:null},...(owner==='low'?[{operator:'Amiya',elite:2,level:80,skill:3,mastery:3,module:null,moduleLevel:null}]:[])]})).status,200);
    }
    const allRows=(await h.call('supports',null,'GET',undefined,{server:'en'})).result.listings;
    assert.equal(allRows.length,3);assert.ok(allRows.every((r:any)=>r.friendTag==='Doctor#1234'&&!('userId'in r)&&!('gameKey'in r)&&!('uid'in r)));
    const weaker=(await h.call('supports',null,'GET',undefined,{server:'en',operator:'Thorns',elite:'1',minLevel:'1',maxLevel:'30',mastery:'0',skill:'3'})).result.listings;
    assert.equal(weaker.length,1);assert.equal(weaker[0].supports[0].level,20);
    assert.equal(weaker[0].supports.length,2,'the matching player card keeps their other equipped support too');
    assert.equal((await h.call('supports',null,'GET',undefined,{server:'en',mastery:'0'})).result.listings.length,1);
    assert.equal((await h.call('supports',null,'GET',undefined,{server:'en',minLevel:'80',maxLevel:'20'})).status,400);
    h.user('duplicate');
    assert.equal((await h.publish('duplicate','300')).status,409,'another Arkpedia account cannot duplicate an already-contributed game account');
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_support WHERE userId=?').get('duplicate')?.n,0);
  }finally{h.sqlite.close();}
});
test('consent revisions isolate concurrent updates and stale refreshes cannot resurrect withdrawn sharing',async()=>{
  const h=harness();try{
    h.user('owner');assert.equal((await h.publish('owner','100')).status,200);
    const body={revision:1,action:'refresh',choices:all,snapshot:snapshot('100')};
    const [a,b]=await Promise.all([h.call('sharing','owner','PUT',body),h.call('sharing','owner','PUT',{...body,snapshot:{...snapshot('100'),slots:8}})]);
    assert.deepEqual([a.status,b.status].sort(),[200,409]);
    const winner=a.status===200?a:b;
    assert.equal((await h.call('sharing','owner','PUT',{...body,revision:winner.result.revision,snapshot:{...snapshot('100'),importedAt:new Date(clock-3600_000).toISOString()}})).status,409,'an old device cannot overwrite a newer import');
    await h.call('sharing','owner','DELETE',{});
    assert.equal((await h.call('sharing','owner','PUT',{...body,revision:winner.result.revision})).status,409);
    assert.equal((await h.call('supports',null)).result.listings.length,0);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_skin').get()?.n,0);
    assert.equal((await h.call('sharing','owner','PUT',{revision:winner.result.revision+1,action:'refresh',choices:all,snapshot:snapshot('200')})).status,409);
    assert.equal((await h.call('sharing','owner','GET')).result.shareTag,false);
  }finally{h.sqlite.close();}
});
test('withdrawing during a first publication leaves no public rows',async()=>{
  const h=harness();try{
    h.user('owner');
    const [publish,off]=await Promise.all([h.publish('owner','100'),h.call('sharing','owner','DELETE',{})]);
    assert.ok([200,409].includes(publish.status));assert.equal(off.status,200);
    assert.equal((await h.call('sharing','owner')).result.stats,false);
    assert.equal((await h.call('supports',null)).result.listings.length,0);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_operator').get()?.n,0);
  }finally{h.sqlite.close();}
});
test('private saves do not imply community consent; withdrawal works without an import and account deletion cascades',async()=>{
  const h=harness();try{
    h.user('owner');h.user('other');
    assert.equal((await h.call('sharing','owner')).result.stats,false);
    assert.equal((await h.publish('owner','100')).status,200);
    const fewer=await h.call('sharing','owner','PUT',{revision:1,choices:{stats:false,shareTag:true,openRequests:true}});
    assert.equal(fewer.status,200);assert.equal(fewer.result.stats,false);assert.equal(fewer.result.listed,true);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_operator').get()?.n,0);
    assert.equal((await h.call('sharing',null)).status,401);
    assert.equal((await h.call('sharing','other','DELETE',{owner:'owner'})).status,409);
    assert.equal((await h.call('sharing','owner','DELETE',{}, {},{origin:'https://evil.invalid'})).status,403);
    h.sqlite.prepare('DELETE FROM "user" WHERE id=?').run('owner');
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_support').get()?.n,0);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM "user"').get()?.n,1);
  }finally{h.sqlite.close();}
});
test('availability observations deduplicate reporters, expire, and never survive a fresh import or withdrawal',async()=>{
  const h=harness();try{
    for(const name of ['target','a','b','c'])h.user(name);
    assert.equal((await h.publish('target','100')).status,200);
    const listing=(await h.call('supports',null)).result.listings[0].id.split(':')[0];
    const body={listing,importedAt:snapshot().importedAt,status:'full'};
    const report=(owner:string|null,status='full',method='POST')=>h.call('availability',owner,method,{...body,status});
    assert.equal((await report(null)).status,401);assert.equal((await report('target')).status,400);
    assert.equal((await report('a')).result.fullReports,1);
    assert.equal((await report('a')).result.fullReports,1,'one member cannot inflate the count');
    assert.equal((await report('b')).result.hidden,false);
    assert.equal((await report('c')).result.hidden,true);
    assert.equal((await h.call('supports',null)).result.listings.length,0);
    assert.equal((await h.call('sharing','target')).result.reportedFull,true);
    assert.equal((await report('a','open')).result.hidden,false);
    assert.equal((await h.call('supports',null)).result.listings[0].fullReports,2);
    assert.equal((await report('a','open','DELETE')).result.openReports,0);
    await report('a');
    await h.call('sharing','a','DELETE',{});
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_availability WHERE reporterId=?').get('a')?.n,0,'Stop all sharing removes reports made by that member too');
    h.sqlite.prepare('UPDATE community_availability SET createdAt=?').run(new Date(clock-25*3600_000).toISOString());
    assert.equal((await h.call('supports',null)).result.listings[0].fullReports,0);
    await report('b');
    const updated=await h.call('sharing','target','PUT',{revision:1,action:'refresh',choices:all,snapshot:{...snapshot('100'),importedAt:new Date(clock+60_000).toISOString()}});
    assert.equal(updated.status,200);assert.equal(updated.result.listed,true);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_availability').get()?.n,0);
    assert.equal((await report('c')).status,409,'an observation cannot carry over to a different import');
    const changed=await h.call('sharing','target','PUT',{revision:2,action:'consent',choices:all,snapshot:{...snapshot('200'),importedAt:new Date(clock+60_000).toISOString()}});
    assert.equal(changed.status,200);
    assert.notEqual((await h.call('supports',null)).result.listings[0].id,listing,'changing game identity creates a different public listing');
    await h.call('sharing','target','DELETE',{});
    assert.equal((await report('c')).status,409,'withdrawal cannot be reversed by a report');
  }finally{h.sqlite.close();}
});


test('public card appearance is bounded, opt-in, backward compatible and removed on withdrawal',async()=>{
  const h=harness();try{
    const appearance={avatar:'avatar_special_41',avatarType:'ICON',secretary:null,secretarySkin:null,nameCard:'nc_as2024_throne',nameCardVariant:0,level:120,operators:417,skins:380};
    assert.equal(parseCommunitySnapshot(snapshot(),all,clock).appearance,null);
    assert.equal(parseCommunitySnapshot({...snapshot(),appearance},statsOnly,clock).appearance,null);
    for(const bad of [{...appearance,avatar:'https://tracker.invalid/a'},{...appearance,nameCard:'../../secret'},{...appearance,skins:-1},{...appearance,bio:'PRIVATE'}]){
      assert.throws(()=>parseCommunitySnapshot({...snapshot(),appearance:bad},all,clock));
    }
    h.user('cards');assert.equal((await h.publish('cards','100',all,{appearance})).status,200);
    assert.deepEqual((await h.call('supports',null)).result.listings[0].appearance,appearance);
    assert.equal((await h.call('sharing','cards','PUT',{revision:1,choices:statsOnly})).status,200);
    assert.equal(h.sqlite.prepare('SELECT appearance FROM community_account WHERE userId=?').get('cards').appearance,null);
    assert.equal((await h.call('supports',null)).result.listings.length,0);
    assert.equal((await h.call('sharing','cards','PUT',{revision:2,action:'consent',choices:all,snapshot:{...snapshot(),appearance}})).status,200);
    await h.call('sharing','cards','DELETE',{});
    assert.equal(h.sqlite.prepare('SELECT appearance FROM community_account WHERE userId=?').get('cards').appearance,null);
  }finally{h.sqlite.close();}
});


test('equipped supports share actual all-skill ranks independently of aggregate stats',()=>{
  const support={...snapshot().supports[0],skillLevel:7,skillMasteries:[1,3,2]};
  const parsed=parseCommunitySnapshot({...snapshot(),supports:[support]},{...all,stats:false},clock);
  assert.deepEqual(parsed.supports[0].skillMasteries,[1,3,2]);assert.deepEqual(parsed.operators,[]);
  assert.throws(()=>parseCommunitySnapshot({...snapshot(),supports:[{...support,skillMasteries:[1,3,3]}]},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...snapshot(),supports:[{...support,skillMasteries:[1,3,2,0]}]},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...snapshot(),supports:[{...support,skillLevel:8}]},all,clock));
});


test('support skill ranks survive database storage and legacy entries remain unknown',async()=>{
  const h=harness();try{
    h.user('ranks');h.user('legacy');
    const support={...snapshot().supports[0],skillLevel:7,skillMasteries:[1,3,2]};
    assert.equal((await h.publish('ranks','100',all,{supports:[support]})).status,200);
    assert.equal((await h.publish('legacy','200')).status,200);
    const supports=(await h.call('supports',null)).result.listings.flatMap((entry:any)=>entry.supports);
    assert.ok(supports.some((s:any)=>s.skillLevel===7&&JSON.stringify(s.skillMasteries)==='[1,3,2]'));
    assert.ok(supports.some((s:any)=>s.skillLevel===null&&JSON.stringify(s.skillMasteries)==='[]'));
    assert.equal((await h.call('sharing','ranks','DELETE',{})).status,200);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM community_support WHERE userId=?').get('ranks')?.n,0);
  }finally{h.sqlite.close();}
});
