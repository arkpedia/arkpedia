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
import skinsData from '../../data/skins.json';
import { previewStatistics } from '../../lib/community/preview-statistics';

const clock=Date.parse('2026-11-02T12:00:00Z');
const all:CommunityChoices={stats:true,shareTag:true,openRequests:true};
const statsOnly:CommunityChoices={stats:true,shareTag:false,openRequests:false};
function snapshot(uid='100'):CommunitySnapshot{return {server:'en',uid,doctor:'Doctor#1234',importedAt:new Date(clock).toISOString(),slots:3,equipmentKnown:true,
  operators:[{operator:'Thorns',elite:2,level:60,m0:0,m1:0,m2:3,modules:{0:3}}],skins:[{skin:'char_293_thorns@test#1',equipped:true}],
  supports:[{operator:'Thorns',elite:2,level:60,skill:3,mastery:2,module:'uniequip_002_thorns',moduleLevel:3}]};}
function harness(){
  const pollIds=new Set(skinsData.filter(s=>s.skinId&&s.model).map(s=>s.skinId!));
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of fs.readdirSync('migrations/accounts').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(`migrations/accounts/${file}`,'utf8'));
  // Ordinary SQLite permits 2,000 result columns; production D1 permits 100.
  // Enforce the production limit in every populated aggregate regression.
  const statementFor=(sql:string)=>{const statement=sqlite.prepare(sql);assert.ok(statement.columns().length<=100,'D1 SELECT results must not exceed 100 columns');return statement;};
  const prepare=(sql:string,args:unknown[]=[])=>({bind:(...values:unknown[])=>prepare(sql,values),first:async()=>statementFor(sql).get(...args as never[])??null,
    all:async()=>{const statement=statementFor(sql);return {success:true,results:statement.columns().length?statement.all(...args as never[]):(statement.run(...args as never[]),[])};},run:async()=>({meta:sqlite.prepare(sql).run(...args as never[])})});
  let queue=Promise.resolve<unknown>(null);
  const db={prepare,batch:(statements:ReturnType<typeof prepare>[])=>{const next=queue.then(async()=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.all());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}});queue=next.catch(()=>null);return next;}} as unknown as D1Database;
  const limiter={limit:async()=>({success:true})};
  const env={ARKPEDIA_ACCOUNTS_DB:db,ARKPEDIA_AUTH_URL:'https://preview.example.invalid',BETTER_AUTH_SECRET:'test-only-secret-long-enough-for-hmac-01234567',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',DISCORD_CLIENT_ID:'',DISCORD_CLIENT_SECRET:'',ACCOUNT_TRAFFIC_LIMIT:limiter,ACCOUNT_IP_LIMIT:limiter};
  function user(id:string){sqlite.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt)VALUES(?,?,?,?,?)').run(id,'Private Provider Name',id+'@example.invalid','2026-01-01','2026-01-01');sqlite.prepare('INSERT INTO arkpedia_profile(userId,username,usernameKey,updatedAt)VALUES(?,?,?,?)').run(id,id,id,'2026-01-01');}
  async function call(kind:'sharing'|'stats'|'supports'|'availability'|'rankings'|'skin-poll',owner:string|null,method='GET',body?:unknown,query:Record<string,string>={},headers:Record<string,string>={}){
    let status=200,result:any;const response={setHeader:()=>{},status:(n:number)=>{status=n;return response;},json:(v:unknown)=>{result=v;return response;},end:()=>{}};
    await createCommunityHandler(kind,{resolveEnv:()=>env,authenticate:async()=>owner,now:()=>clock,pollSkinIds:async()=>pollIds})({method,headers:{origin:env.ARKPEDIA_AUTH_URL,'content-type':'application/json',...headers},query,body:body&&typeof body==='object'?{owner,...body}:body} as NextApiRequest,response as unknown as NextApiResponse);
    return {status,result};
  }
  const publish=(owner:string,uid:string,choices=all,changes:Partial<CommunitySnapshot>={})=>call('sharing',owner,'PUT',{action:'consent',revision:0,choices,snapshot:{...snapshot(uid),...changes}});
  return {sqlite,db,env,user,call,publish,pollIds};
}
test('community projection excludes private fields, counts in-progress M3 and keeps the support skill at its actual mastery',()=>{
  const account:AccountRecord={version:1,server:'en',importedAt:new Date(clock).toISOString(),doctor:'Doctor#1234',operators:['Thorns'],skins:['skin@x#1'],cleared:['PRIVATE_STAGE'],wallet:{orundum:999,originitePrime:100,permits:2,yellowCerts:3,monthlyCardUntil:null},
    operatorBuilds:{Thorns:{elite:2,level:60,skillLevel:7,masteries:{2:3},modules:{0:2}}},outfits:{Thorns:'skin@x#1'},profile:{level:120,bio:'PRIVATE BIO',registeredAt:null,secretary:null,uid:'123',friendSlots:{used:47,limit:50},supports:[{name:'Thorns',rarity:6,elite:2,level:60,potential:6,skill:3,skillMastery:2,module:'uniequip_002_thorns',moduleLevel:3}]}};
  const projected=communitySnapshot(account,all);
  assert.equal(projected.operators[0].skillLevel,7);assert.equal(projected.operators[0].m2,3);assert.equal(projected.supports[0].mastery,2);assert.equal(projected.operators[0].modules?.[0],3);assert.equal(projected.slots,3);
  assert.ok(!JSON.stringify(projected).includes('PRIVATE'));assert.ok(!JSON.stringify(projected).includes('orundum'));
  const privateStats=communitySnapshot(account,statsOnly);assert.equal(privateStats.doctor,null);assert.deepEqual(privateStats.supports,[]);
  const supports=communitySnapshot(account,{...all,stats:false});assert.deepEqual(supports.operators,[]);assert.deepEqual(supports.skins,[]);
  assert.throws(()=>parseCommunitySnapshot({...projected,token:'PRIVATE'},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...projected,operators:[{...projected.operators[0],elite:1}]},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...projected,operators:[{...projected.operators[0],modules:[]}]},all,clock));
  assert.throws(()=>parseCommunitySnapshot({...projected,supports:[{...projected.supports[0],skill:null}]},all,clock));
  assert.equal(privateStats.slots,null);
});
test('masteries and exact module levels use all E2 owners including low and unknown character levels',async()=>{
  const h=harness();
  try{
    for(let i=0;i<26;i++){
      h.user('relative'+i);
      const s=snapshot(String(700+i));
      s.operators[0]={operator:'Thorns',elite:i<21?2:1,level:i<10?60:i<19?1:i===19?59:i===20?null:80,
        m0:0,m1:0,m2:i<8?3:0,modules:i<10?{0:i<5?1:3}:i===19?{0:2}:{}};
      assert.equal((await h.publish('relative'+i,String(700+i),statsOnly,s)).status,200);
    }
    const op=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(op.builds,26);assert.equal(op.masteryOwners,21);assert.deepEqual(op.skills,[0,0,8]);
    assert.deepEqual(op.moduleGroups.map((g:any)=>[g.level,g.owners]),[[40,11],[50,11],[60,10]]);
    assert.deepEqual(op.moduleGroups.find((g:any)=>g.level===60).modules[0],[10,5,5]);
    assert.equal(op.moduleOwners,21);assert.deepEqual(op.modules[0],[5,1,5]);
    assert.equal(op.modules[0].reduce((sum:number,n:number)=>sum+n,0),11);
    // E2 Lv1, Lv59 and unknown levels qualify; E1 Lv80 does not.
    // Each module belongs to exactly one level; higher levels do not inflate lower ones.
    await h.call('sharing','relative0','DELETE',{});
    const smaller=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(smaller.masteryOwners,20);
    assert.equal(smaller.moduleGroups.find((g:any)=>g.level===60).owners,9);
    assert.equal(smaller.moduleGroups.find((g:any)=>g.level===50).owners,10);
    assert.equal(smaller.moduleOwners,20);assert.deepEqual(smaller.modules[0],[4,1,5]);
  }finally{h.sqlite.close();}
});

test('public statistics use only opted-in contributors and wait for ten on the server',async()=>{
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

test('All pools regional counts for operators and skins with one combined contributor threshold',async()=>{
  const h=harness();
  try{
    for(let i=0;i<14;i++){
      const server=i<7?'en':i<12?'jp':'kr';
      h.user('region'+i);
      const owns=i<4||server==='jp',elite=i<2?1:2;
      assert.equal((await h.publish('region'+i,String(400+i),statsOnly,{server,
        operators:owns?[{operator:'Thorns',elite,level:60,m0:0,m1:0,m2:server==='jp'?3:0,modules:elite===2?{0:server==='jp'?3:1}:{}}]:[],
        skins:owns?[{skin:'char_293_thorns@test#1',equipped:server==='jp'}]:[],
      })).status,200);
      if(i===8)assert.deepEqual((await h.call('stats',null,'GET',undefined,{server:'all',operator:'Thorns'})).result,{contributors:9,owned:null});
    }
    h.user('excluded');await h.publish('excluded','999',{...all,stats:false},{server:'jp'});
    for(const server of ['en','jp','kr'])assert.equal((await h.call('stats',null,'GET',undefined,{server,operator:'Thorns'})).result.owned,null);
    const op=(await h.call('stats',null,'GET',undefined,{server:'all',operator:'Thorns'})).result;
    assert.equal(op.contributors,14);assert.equal(op.owned,9);assert.equal(op.builds,9);
    assert.equal(op.e1,2);assert.equal(op.e2,7);assert.equal(op.masteryOwners,7);
    assert.deepEqual(op.skills,[0,0,5]);assert.deepEqual(op.skillRanks[2],[0,0,0,5]);
    assert.equal(op.moduleOwners,7);assert.deepEqual(op.modules[0],[2,0,5]);
    const skin=(await h.call('stats',null,'GET',undefined,{server:'all',skin:'char_293_thorns@test#1'})).result;
    assert.deepEqual(skin,{contributors:14,owned:9,equipmentOwners:9,equipped:5});
    // Existing regional/default API queries retain their own cohorts.
    assert.equal((await h.call('stats',null,'GET',undefined,{operator:'Thorns'})).result.contributors,7);
    assert.equal((await h.call('stats',null,'GET',undefined,{server:'jp',operator:'Thorns'})).result.contributors,5);
    assert.equal((await h.call('stats',null,'GET',undefined,{server:'kr',operator:'Thorns'})).result.contributors,2);
    assert.equal((await h.call('stats',null,'GET',undefined,{server:'invalid',operator:'Thorns'})).status,400);
    assert.equal((await h.call('supports',null,'GET',undefined,{server:'all'})).status,400);
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
    assert.deepEqual(current.modules[0],[0,1,9]);
    assert.equal((await outfit()).equipped,9);
    assert.equal((await h.call('supports',null,'GET',undefined,{server:'en'})).result.listings.length,1);
    assert.equal((await h.call('sharing','historic0','PUT',{revision:2,action:'refresh',choices:all,snapshot:{...snapshot('900'),importedAt:oldDate}})).status,409);
    await h.call('sharing','historic1','DELETE',{});
    assert.deepEqual(await operator(),{contributors:9,owned:null});
    assert.deepEqual(await outfit(),{contributors:9,owned:null});
  }finally{h.sqlite.close();}
});

test('small mastery and module groups remain available above the server threshold',async()=>{
  const h=harness();
  try{
    for(let i=0;i<10;i++){
      h.user('small'+i);const s=snapshot(String(800+i));
      if(i===9)s.operators[0]={operator:'Thorns',elite:1,level:80,m0:0,m1:0,m2:0,modules:{}};
      assert.equal((await h.publish('small'+i,String(800+i),statsOnly,s)).status,200);
    }
    const op=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(op.owned,10);assert.equal(op.e2,9);
    assert.equal(op.masteryOwners,9);assert.deepEqual(op.skills,[0,0,9]);assert.equal(op.moduleGroups.find((g:any)=>g.level===60).owners,9);
  }finally{h.sqlite.close();}
});
test('ten contributors unlock small owner groups, zero upgrades, and empty or unknown groups',async()=>{
  const h=harness();
  try{
    for(let i=0;i<10;i++){
      const owner='threshold'+i;h.user(owner);const s=snapshot(String(1800+i));
      s.operators=i<6?[{operator:'Thorns',elite:i===5?null:2,level:i===4?null:60,
        m0:i===5?null:0,m1:i===5?null:0,m2:i===5?null:i<2?3:0,modules:i===5?null:i<2?{0:1}:{}}]:[];
      s.skins=i<6?[{skin:'char_293_thorns@test#1',equipped:false}]:[];s.equipmentKnown=i!==5;
      assert.equal((await h.publish(owner,String(1800+i),statsOnly,s)).status,200);
      if(i===8)assert.deepEqual((await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result,{contributors:9,owned:null});
    }
    const op=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(op.contributors,10);assert.equal(op.owned,6);assert.equal(op.builds,5);
    assert.equal(op.e1,0);assert.equal(op.e2,5);assert.equal(op.masteryOwners,5);assert.deepEqual(op.skills,[0,0,2]);
    assert.equal(op.moduleOwners,5);assert.deepEqual(op.modules[0],[2,0,0]);
    const skin=(await h.call('stats',null,'GET',undefined,{server:'en',skin:'char_293_thorns@test#1'})).result;
    assert.equal(skin.owned,6);assert.equal(skin.equipmentOwners,5);assert.equal(skin.equipped,0);
    const empty=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Nobody owns this'})).result;
    assert.equal(empty.owned,0);assert.equal(empty.builds,0);assert.equal(empty.masteryOwners,0);assert.deepEqual(empty.skills,[0,0,0]);
    assert.equal(empty.moduleOwners,0);assert.ok(empty.modules.flat().every((n:number)=>n===0));
    assert.ok(empty.moduleGroups.every((g:any)=>g.owners===0&&g.modules.flat().every((n:number)=>n===0)));
    const noSkin=(await h.call('stats',null,'GET',undefined,{server:'en',skin:'missing'})).result;
    assert.equal(noSkin.equipmentOwners,0);assert.equal(noSkin.equipped,0);
    await h.call('sharing','threshold0','DELETE',{});
    assert.deepEqual((await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result,{contributors:9,owned:null});
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
test('friend tag searches compose with support filters and never expose private or unavailable players',async()=>{
  const h=harness();try{
    for(const [i,owner] of ['public','private','closed','full','stale','japan'].entries()){
      h.user(owner);
      assert.equal((await h.publish(owner,String(900+i),owner==='private'?statsOnly:owner==='closed'?{...all,openRequests:false}:all,{
        doctor:owner==='private'?null:'Helpful#1234',server:owner==='japan'?'jp':'en',slots:owner==='full'?0:3,
        importedAt:new Date(clock-(owner==='stale'?8:0)*86400_000).toISOString(),
      })).status,200);
    }
    for(const tag of ['help','HELPFUL#1234','  #1234  ']){
      const response=await h.call('supports',null,'GET',undefined,{tag,operator:'Thorns',mastery:'2'});
      assert.equal(response.status,200);assert.equal(response.result.listings.length,1);
      assert.equal(response.result.listings[0].friendTag,'Helpful#1234');
    }
    for(const tag of ['missing','%','_'])assert.equal((await h.call('supports',null,'GET',undefined,{tag})).result.listings.length,0);
    assert.equal((await h.call('supports',null,'GET',undefined,{tag:'Helpful',operator:'Amiya'})).result.listings.length,0);
    assert.equal((await h.call('supports',null,'GET',undefined,{tag:'Helpful',server:'jp'})).result.listings.length,1);
    assert.equal((await h.call('supports',null,'GET',undefined,{tag:'x'.repeat(201)})).status,400);
    assert.equal((await h.call('supports',null,'GET',undefined,{tag:['a','b']} as unknown as Record<string,string>)).status,400);
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

test('skill distributions retain rank 7 and all masteries without inventing historical rank data',async()=>{
  const h=harness();
  try{
    const builds=[
      {skillLevel:7,m0:0,m1:1,m2:2},
      {skillLevel:6,m0:0,m1:0,m2:0},
      {m0:0,m1:0,m2:0}, // old: genuinely unknown
      {m0:0,m1:0,m2:3}, // old: mastery proves shared rank 7
    ];
    for(let i=0;i<10;i++){
      h.user('ranks'+i);
      const operators=i<4?[{operator:'Thorns',elite:2,level:1,modules:{},...builds[i]}]:[];
      assert.equal((await h.publish('ranks'+i,String(900+i),statsOnly,{operators})).status,200);
    }
    const result=(await h.call('stats',null,'GET',undefined,{server:'en',operator:'Thorns'})).result;
    assert.equal(result.masteryOwners,4);
    assert.deepEqual(result.skillRanks,[[2,0,0,0],[1,1,0,0],[0,0,1,1]]);
    assert.deepEqual(result.skillUnknown,[1,1,1]);
    assert.deepEqual(result.skills,[0,0,1]);
    const invalid={...snapshot(),operators:[{...snapshot().operators[0],skillLevel:6}]};
    assert.throws(()=>parseCommunitySnapshot(invalid,statsOnly,clock),/Masteries require/);
  }finally{h.sqlite.close();}
});

test('ranked skin poll requires an Arkpedia session and replaces, withdraws and deduplicates ballots',async()=>{
  const h=harness();
  const choices=skinsData.filter(s=>s.skinId&&s.model).slice(0,6).map(s=>s.skinId!);
  try{
    h.user('voter');h.user('other');
    assert.equal((await h.call('skin-poll',null,'PUT',{choices:choices.slice(0,5),revision:0})).status,401);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:choices.slice(0,4),revision:0})).status,400);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:Array(5).fill(choices[0]),revision:0})).status,400);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:[...choices.slice(0,4),'not-a-skin'],revision:0})).status,400);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:choices.slice(0,5),revision:0},{},{origin:'https://other.invalid'})).status,403);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:choices.slice(0,5),revision:0})).status,200);
    let result=(await h.call('skin-poll',null)).result;
    assert.equal(result.ballots,1);assert.equal(result.mine,undefined);assert.deepEqual(result.ranking.map((v:any)=>v.points),[5,4,3,2,1]);
    assert.ok(!JSON.stringify(result).includes('voter'));assert.ok(!JSON.stringify(result).includes('example.invalid'));
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:choices.slice(1,6),revision:0})).status,409);
    const replaced=await h.call('skin-poll','voter','PUT',{choices:choices.slice(1,6),revision:1});
    assert.equal(replaced.status,200);assert.equal(replaced.result.revision,2);
    result=(await h.call('skin-poll',null)).result;assert.equal(result.ballots,1);assert.equal(result.ranking.some((v:any)=>v.skin===choices[0]),false);
    assert.equal((await h.call('skin-poll','voter','DELETE',{revision:1})).status,409);
    assert.equal((await h.call('skin-poll','voter','DELETE',{revision:2})).status,200);
    assert.equal((await h.call('skin-poll',null)).result.ballots,0);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:choices.slice(0,5),revision:0})).status,409);
    assert.equal((await h.call('skin-poll','voter','GET',undefined,{owner:'other'})).status,409);
    assert.equal((await h.call('skin-poll','voter','PUT',{owner:'other',choices:choices.slice(0,5),revision:3})).status,409);
    assert.equal((await h.call('skin-poll','voter','PUT',{choices:choices.slice(0,5),revision:3})).status,200);
    h.sqlite.prepare('DELETE FROM "user" WHERE id=?').run('voter');
    assert.equal((await h.call('skin-poll',null)).result.ballots,0);
  }finally{h.sqlite.close();}
});

test('community rankings include existing replay consent, current runs, stage cohorts and withdrawal',async()=>{
  const h=harness();
  const payload=(skill=2)=>JSON.stringify({journal:{metadata:{stageId:'main_00-01'},squad:[{skinId:'char_293_thorns@summer#1',skillIndex:skill},{skinId:'char_002_amiya#1',skillIndex:0}],logs:[
    {op:0,signiture:{charId:'char_293_thorns'}},{op:1,signiture:{charId:'char_293_thorns'}},
    {op:0,signiture:{charId:'char_293_thorns'}},{op:2,signiture:{charId:'char_293_thorns'}},{op:2,signiture:{charId:'char_293_thorns'}},
    {op:0,signiture:{charId:'token_summon'}},
  ]}});
  const add=(owner:string,namespace:string,clears=3)=>h.sqlite.prepare('INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes) VALUES(?,?,?,?,?,?,?)').run(owner,namespace,'main_00-01',JSON.stringify([1,5,clears,0,2]),'hash',payload(),payload().length);
  try{
    h.user('privateReplay');add('privateReplay','en:999');
    for(let i=0;i<10;i++){
      h.user('rank'+i);await h.publish('rank'+i,String(i+1000),statsOnly,{operators:[{operator:'Thorns',elite:2,level:90,m0:3,m1:3,m2:3,modules:{}}]});
      add('rank'+i,`en:${i+1000}`);
    }
    const summary=JSON.parse(h.sqlite.prepare('SELECT units FROM auto_deploy_summary LIMIT 1').get().units);
    assert.equal(summary.length,2);assert.equal(summary.find((v:any)=>v.charId==='char_293_thorns').deployments,2);
    const result=(await h.call('rankings',null,'GET',undefined,{server:'all'})).result;
    assert.equal(result.contributors,10);assert.equal(result.replayContributors,10);assert.equal(result.replays,10);
    assert.equal(result.clearContributors,10);assert.equal(result.clearRecords,10);assert.equal(result.clearedStages,1);
    assert.equal(result.stageClears.find((v:any)=>v.stageId==='main_00-01').clears,30);
    assert.deepEqual(result.stageCoverage.map((v:any)=>[v.operator,v.stages]),[['Thorns',1]]);
    assert.deepEqual(result.roster[0].m3,[10,10,10]);assert.equal(result.roster[0].m9,10);assert.equal(result.roster[0].maxed,10);
    h.sqlite.prepare('UPDATE community_operator SET m0=0,m1=1 WHERE userId=?').run('rank0');
    h.sqlite.prepare('UPDATE community_operator SET elite=1,m0=0,m1=0,m2=0 WHERE userId=?').run('rank1');
    assert.deepEqual((await h.call('rankings',null)).result.roster.find((v:any)=>v.operator==='Thorns').m3,[8,8,9],'M3 counts each skill separately and requires E2');
    const thorns=result.battles.find((v:any)=>v.charId==='char_293_thorns');
    assert.equal(thorns.deployed,10);assert.equal(thorns.deployments,20);assert.equal(thorns.activations,20);assert.equal(thorns.skill,2);
    assert.equal(result.battles.find((v:any)=>v.charId==='char_002_amiya').benched,10);
    assert.ok(!JSON.stringify(result).includes('rank0'));assert.ok(!JSON.stringify(result).includes('en:1000'));
    h.user('duplicate');await h.publish('duplicate','5555',statsOnly);add('duplicate','en:1000',9);
    h.sqlite.prepare('INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes) VALUES(?,?,?,?,?,?,?)').run('rank0','en:1000','main_00-02','[1,9,7,0,2]','second',payload(),payload().length);
    h.sqlite.prepare('INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes) VALUES(?,?,?,?,?,?,?)').run('rank0','en:1000','PRIVATE_UNKNOWN_STAGE','[1,999,999,0,2]','unknown',payload(),payload().length);
    const stages=(await h.call('rankings',null)).result;
    assert.equal(stages.stageClears.find((v:any)=>v.stageId==='main_00-01').clears,36,'duplicate counters use the maximum, not the sum');
    assert.equal(stages.stageClears.find((v:any)=>v.stageId==='main_00-02').clears,7);
    assert.deepEqual(stages.stageCoverage.map((v:any)=>[v.operator,v.stages]),[['Thorns',2]]);
    assert.equal(stages.clearedStages,2);assert.ok(!JSON.stringify(stages).includes('PRIVATE_UNKNOWN_STAGE'));
    h.sqlite.prepare('UPDATE auto_deploy SET fingerprint=? WHERE stageId=?').run('[1,0,0,0,1]','main_00-02');
    assert.equal((await h.call('rankings',null)).result.stageCoverage[0].stages,1,'unsuccessful records do not count as cleared stages');
    h.sqlite.prepare('UPDATE auto_deploy SET fingerprint=? WHERE stageId=?').run('[1,0,"unknown",0,"unknown"]','main_00-02');
    assert.equal((await h.call('rankings',null)).result.stageCoverage[0].stages,1,'unknown counter types are not clear evidence');
    h.sqlite.prepare('UPDATE auto_deploy SET fingerprint=? WHERE stageId=?').run('invalid','main_00-02');
    assert.equal((await h.call('rankings',null)).result.stageClears.length,1,'malformed counters are omitted');
    assert.equal((await h.call('rankings',null,'GET',undefined,{server:'en',stage:'main_00-01'})).result.replays,10);
    assert.equal((await h.call('rankings',null,'GET',undefined,{server:'jp'})).result.battles,null);
    assert.equal((await h.call('rankings',null,'GET',undefined,{stage:'main_00-02'})).result.battles,null);
    h.sqlite.prepare('UPDATE auto_deploy SET payload=? WHERE userId=?').run(payload(1),'rank1');
    const after=(await h.call('rankings',null)).result;
    assert.equal(after.battles.find((v:any)=>v.charId==='char_293_thorns'&&v.skill===1).activations,2);
    await h.call('sharing','rank2','DELETE',{});
    const removed=(await h.call('rankings',null)).result;
    assert.equal(removed.replayContributors,9);assert.equal(removed.battles,null);assert.equal(removed.stageClears,null);assert.equal(removed.stageCoverage,null);
    assert.equal(h.sqlite.prepare('SELECT count(*) n FROM auto_deploy WHERE userId=?').get('rank2').n,1);
    h.sqlite.prepare('DELETE FROM auto_deploy WHERE userId=?').run('rank3');
    assert.equal(h.sqlite.prepare('SELECT count(*) n FROM auto_deploy_summary WHERE userId=?').get('rank3').n,0);
  }finally{h.sqlite.close();}
});

test('production ranking reads share work and immediately drop withdrawn contributions',async()=>{
  const h=harness();Object.assign(h.env,{ARKPEDIA_DEPLOYMENT_ROLE:'production'});
  try{
    for(let i=0;i<10;i++){h.user('cached'+i);await h.publish('cached'+i,String(8000+i),statsOnly);}
    const prepare=h.db.prepare.bind(h.db);let queries=0;
    h.db.prepare=((...args:Parameters<typeof prepare>)=>{queries++;return prepare(...args);}) as typeof h.db.prepare;
    const reads=await Promise.all(Array.from({length:4},()=>h.call('rankings',null,'GET',undefined,{server:'all'})));
    assert.ok(reads.every(read=>read.status===200&&read.result.contributors===10));
    assert.ok(queries<20,'concurrent requests share the expensive ranking queries');
    queries=0;assert.equal((await h.call('rankings',null,'GET',undefined,{server:'all'})).result.contributors,10);
    assert.equal(queries,1,'a warm read still checks current sharing consent');
    const replay=JSON.stringify({journal:{squad:[],logs:[]}});
    h.sqlite.prepare('INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes) VALUES(?,?,?,?,?,?,?)').run('cached0','en:8000','main_00-01','[1,1,1,0,2]','cache-upload',replay,replay.length);
    queries=0;assert.equal((await h.call('rankings',null,'GET',undefined,{server:'all'})).result.replays,0);
    assert.equal(queries,1,'upload batches do not continuously invalidate the 30-second aggregate cache');
    await h.call('sharing','cached0','DELETE',{});
    const withdrawn=(await h.call('rankings',null,'GET',undefined,{server:'all'})).result;
    assert.equal(withdrawn.contributors,9);assert.equal(withdrawn.roster,null);
  }finally{h.sqlite.close();}
});

test('bounded replay backfill resumes without changing archives and skips unknown record shapes',()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  const files=fs.readdirSync('migrations/accounts').filter(f=>f.endsWith('.sql')).sort();
  try{
    for(const f of files.filter(f=>f<'0015_'))sqlite.exec(fs.readFileSync(`migrations/accounts/${f}`,'utf8'));
    sqlite.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)').run('old','Private','private@example.invalid','2026-01-01','2026-01-01');
    const payload=JSON.stringify({journal:{squad:[null,'unknown',{skinId:'char_293_thorns#1',skillIndex:2}],logs:[null,'future-record',{op:0,signiture:{charId:'char_293_thorns'}},{op:2,signiture:{charId:'char_293_thorns'}}]}});
    sqlite.prepare('INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes) VALUES(?,?,?,?,?,?,?)').run('old','en:100','main_00-01','[]','hash',payload,payload.length);
    sqlite.exec(fs.readFileSync('migrations/accounts/0015_community_rankings_polls.sql','utf8'));
    for(const f of files.filter(f=>f>'0015_community_rankings_polls.sql'))sqlite.exec(fs.readFileSync(`migrations/accounts/${f}`,'utf8'));
    assert.equal(sqlite.prepare('SELECT count(*) n FROM auto_deploy_summary').get().n,0);
    const backfill=fs.readFileSync('scripts/community/backfill-replay-summaries.sql','utf8');
    assert.match(backfill,/LIMIT 250/);
    sqlite.exec(backfill);
    const first=sqlite.prepare('SELECT * FROM auto_deploy_summary').get();
    sqlite.exec(backfill);
    assert.deepEqual(sqlite.prepare('SELECT * FROM auto_deploy_summary').get(),first);
    assert.equal(sqlite.prepare('SELECT payload FROM auto_deploy').get().payload,payload);
    const rows=JSON.parse(sqlite.prepare('SELECT units FROM auto_deploy_summary').get().units);
    assert.equal(rows.length,1);assert.equal(rows[0].squad,1);assert.equal(rows[0].activations,1);assert.equal(rows[0].skill,2);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM community_account').get().n,0);
    // A later upload is summarized by the live trigger, and the backfill leaves it intact.
    sqlite.prepare('INSERT INTO auto_deploy(userId,namespace,stageId,fingerprint,hash,payload,bytes) VALUES(?,?,?,?,?,?,?)').run('old','en:100','main_00-02','[]','hash',payload,payload.length);
    const live=sqlite.prepare('SELECT * FROM auto_deploy_summary WHERE stageId=?').get('main_00-02');
    sqlite.exec(backfill);
    assert.deepEqual(sqlite.prepare('SELECT * FROM auto_deploy_summary WHERE stageId=?').get('main_00-02'),live);
    const malformed=JSON.stringify({journal:{squad:['text'],logs:[2,'text',null]}});
    sqlite.prepare('UPDATE auto_deploy SET payload=?').run(malformed);
    assert.deepEqual(JSON.parse(sqlite.prepare('SELECT units FROM auto_deploy_summary').get().units),[]);
  }finally{sqlite.close();}
});

test('newly published poll skin IDs are accepted without changing the application catalogue',async()=>{
  const h=harness();try{
    h.user('new-skin-voter');const choices=[...h.pollIds].slice(0,4).concat('new-public-outfit@fixture#1');
    assert.equal((await h.call('skin-poll','new-skin-voter','PUT',{choices,revision:0})).status,400);
    h.pollIds.add(choices[4]);
    assert.equal((await h.call('skin-poll','new-skin-voter','PUT',{choices,revision:0})).status,200);
    assert.equal((await h.call('skin-poll',null)).result.ranking.length,5);
  }finally{h.sqlite.close();}
});

test('production aggregate snapshots are Preview-only, thresholded and expose a closed projection',()=>{
  const snapshot={schema:1,capturedAt:'2026-11-03T23:00:00Z',cohorts:{all:{contributors:20,replayContributors:12,replays:120,
    roster:[{operator:'Thorns',owned:20,builds:20,e2:10,m9:3,m3:[4,5,6,999],unraised:2,maxed:1,userId:'PRIVATE'}],
    battles:[{charId:'char_293_thorns',skill:2,squads:20,deployed:18,deployments:18,activations:30,benched:2,namespace:'PRIVATE'}],
    clearContributors:12,clearRecords:120,clearedStages:3,
    stageClears:[{stageId:'main_00-01',clears:100,code:'0-1',name:'Collapse',slug:'0-1',image:null,userId:'PRIVATE'}],
    stageCoverage:[{operator:'Thorns',stages:2,namespace:'PRIVATE'}],userId:'PRIVATE'}}};
  assert.equal(previewStatistics('production','all','',snapshot),null);
  assert.equal(previewStatistics(undefined,'all','',snapshot),null);
  assert.equal(previewStatistics('staging','jp','',snapshot),null);
  const publicData=previewStatistics('staging','all','',snapshot)!;
  assert.deepEqual(publicData.roster![0].m3,[4,5,6]);assert.equal(publicData.source,'production-snapshot');assert.equal(publicData.replays,120);
  assert.ok(!JSON.stringify(publicData).includes('PRIVATE'));
  assert.throws(()=>previewStatistics('staging','all','main_00-01',snapshot),/covers all stages/);
  snapshot.cohorts.all.contributors=9;snapshot.cohorts.all.replayContributors=9;snapshot.cohorts.all.clearContributors=9;
  const small=previewStatistics('staging','all','',snapshot)!;assert.equal(small.roster,null);assert.equal(small.battles,null);assert.equal(small.stageClears,null);assert.equal(small.stageCoverage,null);
});

test('independent skin ratings persist per skin, resume privately, and retain revisions after clearing',async()=>{
  const h=harness(),ids=[...h.pollIds].slice(0,3),q={mode:'ratings'};try{
    h.user('rater');h.user('rater2');h.user('incomplete-rater');h.sqlite.prepare('DELETE FROM arkpedia_profile WHERE userId=?').run('incomplete-rater');
    assert.equal((await h.call('skin-poll','incomplete-rater','PUT',{skin:ids[0],rating:8,revision:0},q)).status,428);
    assert.equal((await h.call('skin-poll','rater','DELETE',{skin:'arbitrary-not-a-skin',revision:0},q)).status,400);
    await h.call('skin-poll','rater','PUT',{choices:[...h.pollIds].slice(0,5),revision:0});
    assert.equal((await h.call('skin-poll',null,'PUT',{skin:ids[0],rating:8,revision:0},q)).status,401);
    for(const rating of [0,11,4.5,'7',null])assert.equal((await h.call('skin-poll','rater','PUT',{skin:ids[0],rating,revision:0},q)).status,400);
    assert.equal((await h.call('skin-poll','rater','PUT',{skin:'unknown',rating:8,revision:0},q)).status,400);
    assert.equal((await h.call('skin-poll','rater','PUT',{skin:ids[0],rating:8,revision:0},q,{origin:'https://other.invalid'})).status,403);
    for(const skin of ids)assert.equal((await h.call('skin-poll','rater','PUT',{skin,rating:8,revision:0},q)).status,200);
    assert.equal((await h.call('skin-poll','rater2','PUT',{skin:ids[0],rating:10,revision:0},q)).status,200);
    const publicData=(await h.call('skin-poll',null,'GET',undefined,q)).result;assert.equal(publicData.raters,2);assert.equal(publicData.ratings,4);assert.equal(publicData.mine,undefined);
    assert.equal(publicData.ranking.find((row:any)=>row.skin===ids[0]).total,18);assert.ok(!JSON.stringify(publicData).includes('\"rater\"'));
    assert.deepEqual(publicData.ranking.find((row:any)=>row.skin===ids[0]).histogram,[0,0,0,0,0,0,0,1,0,1]);
    assert.equal((await h.call('skin-poll',null)).result.ballots,1,'the earlier ranked ballot remains intact');
    const mine=(await h.call('skin-poll','rater','GET',undefined,{...q,owner:'rater'})).result;assert.equal(mine.mine.length,3);assert.equal(mine.mine[0].revision,1);
    assert.equal((await h.call('skin-poll','rater','GET',undefined,{...q,owner:'rater2'})).status,409);
    const stale=await h.call('skin-poll','rater','PUT',{skin:ids[0],rating:1,revision:0},q);assert.equal(stale.status,409);assert.equal(stale.result.current.rating,8);
    assert.equal((await h.call('skin-poll','rater','PUT',{skin:ids[0],rating:6,revision:1},q)).result.revision,2);
    assert.equal((await h.call('skin-poll','rater','DELETE',{skin:ids[0],revision:1},q)).status,409);
    assert.equal((await h.call('skin-poll','rater','DELETE',{skin:ids[0],revision:2},q)).result.revision,3);
    assert.deepEqual((await h.call('skin-poll',null,'GET',undefined,q)).result.ranking.find((row:any)=>row.skin===ids[0]).histogram,[0,0,0,0,0,0,0,0,0,1]);
    assert.equal((await h.call('skin-poll','rater','PUT',{skin:ids[0],rating:9,revision:0},q)).status,409);
    assert.equal((await h.call('skin-poll','rater','PUT',{skin:ids[0],rating:9,revision:3},q)).status,200);
    h.sqlite.prepare('DELETE FROM "user" WHERE id=?').run('rater');assert.equal((await h.call('skin-poll',null,'GET',undefined,q)).result.ratings,1);
    assert.equal((await h.call('skin-poll',null)).result.ballots,0,'the new scale never invents ranked ballots');
  }finally{h.sqlite.close();}
});
