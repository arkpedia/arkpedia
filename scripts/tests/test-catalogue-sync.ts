import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
import { reconcileOperators, reconcileSkins, reconcileCalendars, operatorReleaseDates, parseWikiRows } from '../sync/catalogue-model.mjs';
const cn=JSON.parse(fs.readFileSync('scripts/tests/fixtures/persona-source.json','utf8'));
const empty={characters:{},skins:{charSkins:{},brandList:{}},activity:{basicInfo:{},missionData:{}},gacha:{gachaPoolClient:[]}};
const rows={eventRows:[{name:'Sur le lac lune vivante',type:'side story, crossover',cnstart:'2026/09/04',cnend:'2026/09/18'}],bannerRows:[{name:'Some Evening of White and Mystic Blue',type:'crossover',cnstart:'2026/09/04',cnend:'2026/09/18',operators:'Makoto Yuki, Yukari Takeba, Aegis'}]};
test('a missing collaboration imports all four operators, four outfits, event, banner and real mechanics',()=>{
  const imported=reconcileOperators({operators:[],cn,en:empty});
  assert.equal(imported.operators.length,4);
  const makoto=imported.operators.find((o:any)=>o.internalName==='char_4217_makoto');
  assert.equal(makoto.name,'Makoto Yuki');
  assert.equal(makoto.skills.skillList.length,3);
  assert.equal(makoto.skills.skillList[0].levels.length,10);
  assert.equal(makoto.modules.filter((m:any)=>m.type==='Upgrade')[0].stages.length,3);
  assert.equal(makoto.stats.phases[2].max.hp,cn.characters.char_4217_makoto.phases[2].attributesKeyFrames.at(-1).data.maxHp);
  assert(makoto.files.every((f:any)=>f.section&&f.description&&f.unlock));
  const calendar=reconcileCalendars({events:[],banners:[],operators:imported.operators,cn,en:empty,...rows});
  assert.equal(calendar.events.length,1);assert.equal(calendar.banners.length,1);
  assert.equal(calendar.events[0].global.dateRange,null);
  const outfits=reconcileSkins({skins:[],operators:imported.operators,cn,en:empty,events:calendar.events});
  assert.equal(outfits.skins.length,4);
  assert.equal(new Set(outfits.skins.map((s:any)=>s.skinId)).size,4);
  assert.deepEqual(reconcileSkins({skins:outfits.skins,operators:imported.operators,cn,en:empty,events:calendar.events}).skins,outfits.skins);
  assert.deepEqual(reconcileOperators({operators:imported.operators,cn,en:empty}).operators,imported.operators);
  assert.equal(operatorReleaseDates(imported.operators,calendar.banners,cn,empty).get('char_4220_kormr').cn,cn.activity.basicInfo.act54side.startTime);
});
test('Global release uses the immutable ID to replace a provisional name and skin translation',()=>{
  const previous=reconcileOperators({operators:[],cn,en:empty}).operators;
  const op=previous.find((o:any)=>o.internalName==='char_4217_makoto');op.name='Provisional name';
  const en=structuredClone(cn);en.characters.char_4217_makoto.name='Official Global name';
  // A regional mirror can contain CN-only characters; only actual English entries are promoted.
  const release=2000000000;
  const next=reconcileOperators({operators:previous,cn,en,releases:new Map([['char_4217_makoto',{cn:1788476400,global:release}]]),now:(release+1)*1000});
  const actual=next.operators.find((o:any)=>o.internalName==='char_4217_makoto');
  assert.equal(actual.name,'Official Global name');assert.equal(actual.isFuture,false);
  assert(actual.aliases.includes('Provisional name'));assert.equal(actual.sourceRegion,'Global');
  assert.deepEqual(actual.stats,op.stats);
  const initialSkins=reconcileSkins({skins:[],operators:previous,cn,en:empty}).skins;
  const id='char_4217_makoto@p3r#1';en.skins.charSkins[id].displaySkin.skinName='Official outfit title';
  const updated=reconcileSkins({skins:initialSkins,operators:next.operators,cn,en}).skins;
  const outfit=updated.find((s:any)=>s.skinId===id);
  assert.equal(updated.length,initialSkins.length);assert.equal(outfit.name,'Official outfit title');assert.equal(outfit.model,'Official Global name');
  assert.equal(outfit.sourceRegion,'Global');assert(outfit.searchAliases.length>0);
});
test('secondary limited rate-ups never become featured during automatic imports',()=>{
  const ops=[{name:'New limited',internalName:'new',rarity:6},{name:'Returning limited',internalName:'old',rarity:6},{name:'Five star',internalName:'five',rarity:5}];
  const row={name:'Limited test',type:'celebration',cnstart:'2026/09/04',operators:'New limited, Returning limited, Five star',limited:'1,2,0'};
  const calendar=reconcileCalendars({events:[],banners:[],operators:ops,cn,en:empty,eventRows:[],bannerRows:[row]});
  assert.deepEqual(calendar.banners[0].six_stars,['New limited']);assert.deepEqual(calendar.banners[0].rate_up_six_stars,['Returning limited']);
  assert.equal(calendar.banners[0].pull_type,'limited');
});
test('structured discovery tolerates spacing and fails on a missing referenced operator',()=>{
  assert.equal(parseWikiRows('{{Banners cell\n| name = Test\n| operators = New\n}}','Banners cell')[0].name,'Test');
  assert.throws(()=>reconcileCalendars({events:[],banners:[],operators:[],cn,en:empty,...rows}),/unknown operator/);
});

test('a discovered event still localizes after leaving the upcoming calendar',()=>{
  const en=structuredClone(cn);en.activity.basicInfo.act54side.name='Official Global event';
  en.activity.basicInfo.act54side.startTime=2000000000;en.activity.basicInfo.act54side.endTime=2001000000;
  const event={name:'[Crossover] Provisional event',activityId:'act54side',global:{dateRange:null},cn:{dateRange:'2026/09/04–2026/09/18'}};
  const result=reconcileCalendars({events:[event],banners:[],operators:[],cn,en,eventRows:[],bannerRows:[]});
  assert.equal(result.events[0].name,'[Crossover] Official Global event');
  assert.equal(result.events[0].global.startAt,new Date(2000000000*1000).toISOString());
  assert.equal(result.events[0].global.note,null);
  assert.deepEqual(result.renames,[[event.name,'[Crossover] Official Global event']]);
});

test('existing Global banner identities retain rerun and edition qualifiers',()=>{
  const operators=reconcileOperators({operators:[],cn,en:empty}).operators;
  const en=structuredClone(cn), pool=en.gacha.gachaPoolClient[0];
  pool.gachaPoolName=rows.bannerRows[0].name;
  const banner={name:rows.bannerRows[0].name+' Rerun',cn_date:'2026/09/04–2026/09/18',global_date:'2026/09/04–2026/09/18',cnPoolId:pool.gachaPoolId};
  const date=new Date((pool.openTime-7*3600)*1000).toISOString().slice(0,10).replaceAll('-','/');
  const result=reconcileCalendars({events:[],banners:[banner],operators,cn,en,eventRows:[],bannerRows:[{...rows.bannerRows[0],start:date}]});
  assert.equal(result.banners[0].name,banner.name);
  assert.deepEqual(result.renames,[]);
});
