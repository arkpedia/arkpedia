import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getFeaturedOperatorRates } from '../../lib/gacha/eventBannerRates';
import { ALL_SERIES, seriesKey, skinSeriesOptions } from '../../lib/skins/skinSeriesConfig';
import bundledSkins from '../../data/skins.json';
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
import { reconcileOperators, reconcileSkins, reconcileCalendars, operatorReleaseDates, parseWikiRows, skinText, SKIN_SERIES, wikiParseUrl, wikiText, linkPools, lineupNameLookup } from '../sync/catalogue-model.mjs';
// @ts-expect-error Plain Node helper shared by the importers.
import { stripRichText } from '../lib/gametext.mjs';
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
import { withStableSource } from '../sync/sync-content-inventory.mjs';
const cn=JSON.parse(fs.readFileSync('scripts/tests/fixtures/persona-source.json','utf8'));
const empty={characters:{},skins:{charSkins:{},brandList:{}},activity:{basicInfo:{},missionData:{}},gacha:{gachaPoolClient:[]}};
// No official CN announcements (test-cn-news.ts has the runs with them).
const noNews={events:[],banners:[]};
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
  const calendar=reconcileCalendars({announced:noNews,events:[],banners:[],operators:imported.operators,cn,en:empty,...rows});
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
  // A Global outfit ships official text with its title; a title over CN text is not Global yet.
  const id='char_4217_makoto@p3r#1';Object.assign(en.skins.charSkins[id].displaySkin,{skinName:'Official outfit title',dialog:'Official collab line/Official outfit title. Official description.',content:null});
  const updated=reconcileSkins({skins:initialSkins,operators:next.operators,cn,en}).skins;
  const outfit=updated.find((s:any)=>s.skinId===id);
  assert.equal(updated.length,initialSkins.length);assert.equal(outfit.name,'Official outfit title');assert.equal(outfit.model,'Official Global name');
  assert.equal(outfit.code,'Official collab line/Official outfit title');assert.equal(outfit.description,'Official description.');
  assert.equal(outfit.sourceRegion,'Global');assert(outfit.searchAliases.length>0);
});
test('secondary limited rate-ups never become featured during automatic imports',()=>{
  const ops=[{name:'New limited',internalName:'new',rarity:6},{name:'Returning limited',internalName:'old',rarity:6},{name:'Five star',internalName:'five',rarity:5}];
  const row={name:'Limited test',type:'celebration',cnstart:'2026/09/04',operators:'New limited, Returning limited, Five star',limited:'1,2,0'};
  const calendar=reconcileCalendars({announced:noNews,events:[],banners:[],operators:ops,cn,en:empty,eventRows:[],bannerRows:[row]});
  assert.deepEqual(calendar.banners[0].six_stars,['New limited']);assert.deepEqual(calendar.banners[0].rate_up_six_stars,['Returning limited']);
  assert.equal(calendar.banners[0].pull_type,'limited');
  assert.equal(getFeaturedOperatorRates(calendar.banners[0])[0].percent,35);
  const joint=reconcileCalendars({announced:noNews,events:[],banners:[],operators:ops,cn,en:empty,eventRows:[],bannerRows:[{...row,type:'jo',limited:''}]});
  assert.equal(joint.banners[0].pull_type,'joint');
  assert.equal(getFeaturedOperatorRates(joint.banners[0])[0].percent,50);
});
test('structured discovery tolerates spacing, and a wiki lineup naming an unknown operator publishes the banner with the client six-star instead of failing',()=>{
  assert.equal(parseWikiRows('{{Banners cell\n| name = Test\n| operators = New\n}}','Banners cell')[0].name,'Test');
  const operators=reconcileOperators({operators:[],cn,en:empty}).operators, now=Date.parse('2026-09-23T00:00:00Z');
  const typo={...rows.bannerRows[0],operators:'Makoto Yuki, Yukari Takebaa, Aegis'};
  const first=reconcileCalendars({announced:noNews,events:[],banners:[],operators,cn,en:empty,eventRows:[],bannerRows:[typo],now});
  const [banner]=first.banners;
  // The crossover pool itself names Makoto (linkageParam.guaranteeTarget6Char).
  assert.deepEqual([banner.name,banner.cnPoolId,banner.six_stars,banner.five_stars,banner.lineupSource],['[Crossover] Some Evening of White and Mystic Blue','LINKAGE_77_0_1',['Makoto Yuki'],[],'client']);
  assert.deepEqual(first.quarantine.map((e:any)=>[e.key,e.action]),[['banner:LINKAGE_77_0_1','published-partial']]);
  assert.match(first.quarantine[0].reason,/names Yukari Takebaa, which no operator record matches/);
  // Still partial on the next run, and complete once the row is fixed.
  assert.equal(reconcileCalendars({announced:noNews,events:[],banners:first.banners,operators,cn,en:empty,eventRows:[],bannerRows:[typo],now}).quarantine[0].action,'published-partial');
  const fixed=reconcileCalendars({announced:noNews,events:[],banners:first.banners,operators,cn,en:empty,eventRows:[],bannerRows:rows.bannerRows,now});
  assert.deepEqual([fixed.banners[0].six_stars,fixed.banners[0].five_stars,fixed.banners[0].lineupSource],[['Makoto Yuki'],['Yukari Takeba','Aegis'],'wiki']);
  assert.deepEqual(fixed.quarantine,[]);
  // A record that already has its wiki lineup keeps it, and says so.
  const kept=reconcileCalendars({announced:noNews,events:[],banners:fixed.banners,operators,cn,en:empty,eventRows:[],bannerRows:[typo],now});
  assert.deepEqual([kept.banners[0].five_stars,kept.quarantine[0].action],[['Yukari Takeba','Aegis'],'kept-previous']);
  // No lineup at all is the same case.
  const bare=reconcileCalendars({announced:noNews,events:[],banners:[],operators,cn,en:empty,eventRows:[],bannerRows:[{...typo,operators:''}],now});
  assert.deepEqual([bare.banners[0].six_stars,bare.quarantine[0].action],[['Makoto Yuki'],'published-partial']);
  assert.match(bare.quarantine[0].reason,/lists no operators/);
});

/* A CN gacha table of made-up pools, opening at 16:00 on the given CN day for 14 days. */
const cnDay=(day:string)=>Date.parse(`${day.replaceAll('/','-')}T16:00:00+08:00`)/1000;
const pool=(gachaPoolId:string,gachaRuleType:string,day:string,gachaPoolName:string,extra:object={})=>({gachaPoolId,gachaRuleType,gachaPoolName,openTime:cnDay(day),endTime:cnDay(day)+14*86400-1,dynMeta:null,limitParam:null,linkageParam:null,...extra});
const tables=(...gachaPoolClient:object[])=>({...empty,source:'cn-mirror',gacha:{gachaPoolClient}});
const sixStar=[{name:'Limited Six',internalName:'char_9001_ltd',rarity:6},{name:'Featured Six',internalName:'char_9002_ftr',rarity:6},{name:'Five A',internalName:'char_9003_five',rarity:5}];
const september=Date.parse('2026-09-23T00:00:00Z');

test('rows the wiki cannot tie to one CN pool are reported instead of stopping the sync, and a row dated ahead of the client waits quietly',()=>{
  const cnTables=tables(pool('SINGLE_90_0_1','SINGLE','2026/09/15','甲'),pool('RETURN_90_0_1','BACKFLOW','2026/09/15','回归'),
    pool('SINGLE_90_0_2','SINGLE','2026/09/18','乙'),pool('LIMITED_90_0_3','LIMITED','2026/09/18','丙',{limitParam:{limitedCharId:'char_9001_ltd'}}));
  const row=(name:string,cnstart:string,type='special')=>({name,type,cnstart,operators:'Featured Six, Five A'});
  const result=reconcileCalendars({announced:noNews,events:[],banners:[],operators:sixStar,cn:cnTables,en:empty,eventRows:[],now:september,bannerRows:[
    row('Picked By Type','2026/09/15'),           // a featured and a returning-player pool: the row's type decides
    {...row('Two Of A Kind','2026/09/18'),type:'rerun',operators:'Featured Six'}, // featured wins over the limited pool
    {type:'special',cnstart:'2026/09/18'},        // no name to be a banner
    row('Behind The Client','2026/09/20'),        // past, and no pool that day
    row('Coming Later','2026/10/20'),             // future: not out yet
  ]});
  const byName=Object.fromEntries(result.banners.map((b:any)=>[b.name,b]));
  assert.equal(byName['[Headhunting] Picked By Type'].cnPoolId,'SINGLE_90_0_1');
  assert.equal(byName['[Headhunting] Two Of A Kind'].cnPoolId,'SINGLE_90_0_2');
  assert.deepEqual(result.quarantine.map((e:any)=>[e.key,e.action]),[
    ['banner:special (CN 2026/09/18)','omitted-new'],['banner:Behind The Client (CN 2026/09/20)','omitted-new'],
    // The limited pool no row described is published from the client (below).
    ['banner:LIMITED_90_0_3','published-partial']]);
  assert.match(result.quarantine[1].reason,/no CN pool opens that day/);
  // Two pools of the same kind on one day, and nothing to choose between them.
  const twins=reconcileCalendars({announced:noNews,events:[],banners:[],operators:sixStar,now:september,en:empty,eventRows:[],
    cn:tables(pool('SINGLE_90_0_4','SINGLE','2026/09/15','丁'),pool('SINGLE_90_0_5','SINGLE','2026/09/15','戊')),bannerRows:[row('Which One','2026/09/15')]});
  assert.equal(twins.quarantine[0].key,'banner:Which One (CN 2026/09/15)');
  assert.match(twins.quarantine[0].reason,/2 pools open \(SINGLE_90_0_4, SINGLE_90_0_5\)/);
});

test('a numbered banner\'s art is asked of the wiki without its #, and a Joint Operation\'s or an Orienteering\'s only as Global\'s upload',()=>{
  // "Orienteering #8" and "Joint Operation #19" went without art: asked for as "CN Orienteering #8
  // banner.png", a title MediaWiki cuts at the #; the wiki's uploads are "CN Orienteering 8 banner.png".
  const cnTables=tables(pool('SPECIAL_77_0_4','SPECIAL','2026/09/15','定向甄选'),pool('NORM_76_0_3','NORMAL','2026/09/17','联合行动'));
  const result=reconcileCalendars({announced:noNews,events:[],banners:[],operators:sixStar,cn:cnTables,en:empty,eventRows:[],now:september,
    bannerRows:[{type:'orient',no:'8',cnstart:'2026/09/15',operators:'Featured Six, Five A'},{type:'jo',no:'19',cnstart:'2026/09/17',operators:'Featured Six, Five A'}]});
  assert.deepEqual(result.banners.map((b:any)=>[b.name,b.banner_image]),[['Orienteering #8','/headhunting-banner-images/Orienteering #8.webp'],['Joint Operation #19','/headhunting-banner-images/Joint Operation #19.webp']]);
  // Global has run neither: there is no EN upload to ask for yet. Asking every night held JO 22/23
  // and Orienteering 7/#8 as overdue in the content quarantine (issue #59, 2026-10-13).
  assert.deepEqual(result.media,[]);
  // Global runs the Joint Operation (its pool opens on the row's Global start): its EN upload is
  // asked for, and only that -- CN's art shows CN's operators, which Global's will not have.
  const enPool={...pool('NORM_76_0_9','NORMAL','2026/10/01','Joint Operation #19'),openTime:Date.parse('2026-10-01T12:00:00Z')/1000};
  const global=reconcileCalendars({announced:noNews,events:[],banners:[],operators:sixStar,cn:cnTables,en:{...empty,gacha:{gachaPoolClient:[enPool]}},eventRows:[],now:september,
    bannerRows:[{type:'orient',no:'8',cnstart:'2026/09/15',operators:'Featured Six, Five A'},{type:'jo',no:'19',cnstart:'2026/09/17',start:'2026/10/01',operators:'Featured Six, Five A'}]});
  assert.equal(global.banners.find((b:any)=>b.name==='Joint Operation #19').globalPoolId,'NORM_76_0_9');
  assert.deepEqual(global.media,[{path:'headhunting-banner-images/Joint Operation #19.webp',wikiFiles:['EN Joint Operation 19 banner.png']}]);
});

test('a recent CN pool with no record is published from the client under its Chinese name, and the wiki row renames and completes it later',()=>{
  const cnTables=tables(pool('LIMITED_90_0_1','LIMITED','2026/09/10','限定之名',{limitParam:{limitedCharId:'char_9001_ltd'}}),
    pool('SINGLE_90_0_2','SINGLE','2026/09/12','单人之名'),pool('NORM_90_0_3','NORMAL','2026/09/14','适合多种场合的强力干员'),
    pool('LIMITED_80_0_1','LIMITED','2026/06/01','往年之名',{limitParam:{limitedCharId:'char_9001_ltd'}}),
    pool('DOUBLE_90_0_4','DOUBLE','2026/09/15','适合多种场合的强力干员'));
  const first=reconcileCalendars({announced:noNews,events:[],banners:[],operators:sixStar,cn:cnTables,en:empty,eventRows:[],bannerRows:[],now:september});
  // Months-old pools are history the bulk import owns, and Standard pools belong to the recurring importer.
  assert.deepEqual(first.banners.map((b:any)=>[b.name,b.cnPoolId,b.pull_type,b.six_stars,b.lineupSource,b.nameStatus,b.banner_image,b.cn_date]),[
    ['[Limited] 限定之名','LIMITED_90_0_1','limited',['Limited Six'],'client','cn-official',null,'2026/09/10–2026/09/24'],
    ['[Headhunting] 单人之名','SINGLE_90_0_2','featured',[],'pending','cn-official',null,'2026/09/12–2026/09/26'],
    ['Joint Operation (NORM_90_0_3)','NORM_90_0_3','joint',[],'pending','cn-official',null,'2026/09/14–2026/09/28'],
  ]);
  assert.deepEqual(first.media,[]);
  assert.deepEqual(first.quarantine.map((e:any)=>[e.key,e.action]),[['banner:LIMITED_90_0_1','published-partial'],['banner:SINGLE_90_0_2','published-partial'],['banner:NORM_90_0_3','published-partial']]);
  assert.match(first.quarantine[0].reason,/without an English name and key art/);
  assert.match(first.quarantine[1].reason,/without an English name, its rate-up lineup and key art/);
  // Nothing new is minted on the next run.
  assert.equal(reconcileCalendars({announced:noNews,events:[],banners:first.banners,operators:sixStar,cn:cnTables,en:empty,eventRows:[],bannerRows:[],now:september}).banners.length,3);
  // The wiki's row for the featured pool arrives.
  const later=reconcileCalendars({announced:noNews,events:[],banners:first.banners,operators:sixStar,cn:cnTables,en:empty,eventRows:[],now:september,
    bannerRows:[{name:'Community Name',type:'special',cnstart:'2026/09/12',operators:'Featured Six, Five A'}]});
  const featured=later.banners.find((b:any)=>b.cnPoolId==='SINGLE_90_0_2');
  assert.deepEqual([featured.name,featured.aliases,featured.nameStatus,featured.lineupSource,featured.six_stars,featured.five_stars,featured.banner_image],
    ['[Headhunting] Community Name',['[Headhunting] 单人之名'],'en-unofficial','wiki',['Featured Six'],['Five A'],'/headhunting-banner-images/Community Name.webp']);
  assert.deepEqual(later.renames,[['[Headhunting] 单人之名','[Headhunting] Community Name']]);
  assert.deepEqual(later.media,[{path:'headhunting-banner-images/Community Name.webp',wikiFiles:['CN Community Name banner.png','Community Name banner.png']}]);
  assert.deepEqual(later.quarantine.map((e:any)=>e.key),['banner:LIMITED_90_0_1','banner:NORM_90_0_3']);
  // The client's limited operator stays featured when the wiki row leaves it out.
  const limited=reconcileCalendars({announced:noNews,events:[],banners:later.banners,operators:sixStar,cn:cnTables,en:empty,eventRows:[],now:september,
    bannerRows:[{name:'Limited Name',type:'festival',cnstart:'2026/09/10',operators:'Featured Six, Five A'}]}).banners.find((b:any)=>b.cnPoolId==='LIMITED_90_0_1');
  assert.deepEqual([limited.name,limited.six_stars,limited.five_stars,limited.lineupSource],['[Festival] Limited Name',['Limited Six','Featured Six'],['Five A'],'wiki']);
});

/* A wiki row's Global pool gives its record the official name only where the client names that
   pool after the banner, alone: "Joint Operation #19" became the "Joint Operation" every Joint
   Operation pool is called (NORM_64_0_3 / NORM_EN_37_0_6, 2026-10). */
test('a Global pool renames its banner only under a name the client gives that banner alone: never a Joint Operation\'s, an Orienteering\'s or a rerun\'s first-run name',()=>{
  const enDay=(day:string)=>Date.parse(`${day.replaceAll('/','-')}T04:00:00-07:00`)/1000;
  const enPool=(gachaPoolId:string,gachaRuleType:string,day:string,gachaPoolName:string)=>({gachaPoolId,gachaRuleType,gachaPoolName,openTime:enDay(day),endTime:enDay(day)+14*86400-1});
  const cnTables=tables(pool('NORM_64_0_3','NORMAL','2025/09/09','适合多种场合的强力干员'),pool('SINGLE_64_0_1','SINGLE','2025/09/16','单人'),
    pool('SINGLE_64_0_2','SINGLE','2025/09/23','复刻'),pool('SPECIAL_64_0_4','SPECIAL','2025/09/30','定向甄选'));
  const en={...empty,source:'en-mirror',gacha:{gachaPoolClient:[
    enPool('NORM_EN_36_0_6','NORMAL','2026/02/04','Joint Operation'),enPool('NORM_EN_37_0_6','NORMAL','2026/03/04','Joint Operation'),
    enPool('SINGLE_EN_37_0_1','SINGLE','2026/03/18','Official Name'),
    // A rerun's pool carries its first run's name.
    enPool('SINGLE_EN_20_0_1','SINGLE','2025/04/01','First Run'),enPool('SINGLE_EN_37_0_2','SINGLE','2026/04/01','First Run'),
    // The only Orienteering pool in this table: its kind alone keeps its name off the record.
    enPool('SPECIAL_EN_37_0_4','SPECIAL','2026/04/15','Orienteering Headhunting')]}};
  const lineup={six_stars:['Featured Six'],five_stars:['Five A'],four_stars:[],rate_up_six_stars:[],lineupSource:'wiki',global_date:null};
  const banners=[
    {...lineup,name:'Joint Operation #19',pull_type:'joint',category:'standard',cn_date:'2025/09/09–2025/09/23',cnPoolId:'NORM_64_0_3',banner_image:'/headhunting-banner-images/Joint Operation #19.webp'},
    {...lineup,name:'[Headhunting] Community Name',pull_type:'featured',category:'special',cn_date:'2025/09/16–2025/09/30',cnPoolId:'SINGLE_64_0_1'},
    {...lineup,name:'[Headhunting] First Run Rerun',pull_type:'featured',category:'special',cn_date:'2025/09/23–2025/10/07',cnPoolId:'SINGLE_64_0_2'},
    {...lineup,name:'Orienteering #9',pull_type:'orienteering',category:'special',cn_date:'2025/09/30–2025/10/14',cnPoolId:'SPECIAL_64_0_4'},
  ];
  const row=(extra:object)=>({operators:'Featured Six, Five A',...extra});
  const result=reconcileCalendars({announced:noNews,events:[],banners,operators:sixStar,cn:cnTables,en,eventRows:[],now:Date.parse('2026-05-01T00:00:00Z'),bannerRows:[
    row({type:'jo',no:'19',cnstart:'2025/09/09',start:'2026/03/04'}),
    row({name:'Community Name',type:'special',cnstart:'2025/09/16',start:'2026/03/18'}),
    row({name:'First Run Rerun',type:'rerun',cnstart:'2025/09/23',start:'2026/04/01'}),
    row({type:'orient',no:'9',cnstart:'2025/09/30',start:'2026/04/15'})]});
  // Each takes its Global pool and window; only the banner its pool is named after takes the name.
  assert.deepEqual(result.banners.map((b:any)=>[b.name,b.globalPoolId,b.global_date,b.nameStatus,b.aliases]),[
    ['Joint Operation #19','NORM_EN_37_0_6','2026/03/04–2026/03/18',undefined,undefined],
    ['[Headhunting] Official Name','SINGLE_EN_37_0_1','2026/03/18–2026/04/01','en-official',['[Headhunting] Community Name']],
    ['[Headhunting] First Run Rerun','SINGLE_EN_37_0_2','2026/04/01–2026/04/15',undefined,undefined],
    ['Orienteering #9','SPECIAL_EN_37_0_4','2026/04/15–2026/04/29',undefined,undefined]]);
  assert.deepEqual(result.renames,[['[Headhunting] Community Name','[Headhunting] Official Name']]);
  assert.equal(result.banners[0].banner_image,'/headhunting-banner-images/Joint Operation #19.webp');
});

test('pool ids are filled by window and kind, never overwritten, and only one-to-one matches are links',()=>{
  const cnPools=[pool('NORM_90_0_1','NORMAL','2026/01/10','适合多种场合的强力干员'),pool('FESCLASSIC_90_0_1','FESCLASSIC','2026/01/10','适合多种场合的强力干员'),
    pool('SINGLE_90_0_2','SINGLE','2026/02/10','单人'),pool('SINGLE_90_0_3','SINGLE','2026/03/10','另一个'),pool('NORM_90_0_4','NORMAL','2026/04/10','适合多种场合的强力干员'),
    pool('NORM_90_0_5','NORMAL','2026/04/10','适合多种场合的强力干员')];
  const banners=[
    {name:'Joint Operation #30',pull_type:'joint',category:'standard',cn_date:'2026/01/10–2026/01/24'},
    {name:'Kernel Locating #20 (Global)',pull_type:'kernel',category:'kernel',cn_date:'2026/01/10–2026/01/24'},
    // Ends a day early, as many imported records do: the first day still matches.
    {name:'[Limited-Time] Only One',pull_type:'featured',category:'standard',cn_date:'2026/02/10–2026/02/23'},
    {name:'[Limited-Time] Already Linked',pull_type:'featured',category:'standard',cn_date:'2026/03/10–2026/03/24',cnPoolId:'SINGLE_89_0_9'},
    {name:'Joint Operation #31',pull_type:'joint',category:'standard',cn_date:'2026/04/10–2026/04/24'},
  ];
  const cnLinks=linkPools(banners,cnPools,'cn');
  assert.deepEqual(cnLinks.links.map((l:any)=>[banners[l.index].name,l.poolId]),[['Joint Operation #30','NORM_90_0_1'],['Kernel Locating #20 (Global)','FESCLASSIC_90_0_1'],['[Limited-Time] Only One','SINGLE_90_0_2']]);
  assert.deepEqual(cnLinks.disagreements.map((d:any)=>[d.banner,d.recorded,d.matched]),[['[Limited-Time] Already Linked','SINGLE_89_0_9','SINGLE_90_0_3']]);
  assert.deepEqual(cnLinks.ambiguous.map((a:any)=>[a.pools,a.candidates]),[[['NORM_90_0_4','NORM_90_0_5'],['Joint Operation #31']]]);
  // On Global the client names Standard pools and Joint Operations apart, and names featured pools.
  const enDay=(day:string)=>Date.parse(`${day.replaceAll('/','-')}T04:00:00-07:00`)/1000;
  const enPool=(gachaPoolId:string,gachaRuleType:string,day:string,gachaPoolName:string)=>({gachaPoolId,gachaRuleType,gachaPoolName,openTime:enDay(day),endTime:enDay(day)+14*86400-1});
  const global=[{name:'Joint Operation #9',pull_type:'joint',category:'standard',global_date:'2026/05/01–2026/05/15'},
    {name:'Standard Pool #99 (Global)',pull_type:'standard',category:'standard_pool',global_date:'2026/05/01–2026/05/15'},
    {name:'[Limited-Time] Quicksand Vortex',pull_type:'unknown',category:'standard',global_date:'2026/06/01–2026/06/15'},
    {name:'[Limited-Time] Behold the Sword of Tide',pull_type:'featured',category:'standard',global_date:'2026/06/01–2026/06/15'}];
  const enLinks=linkPools(global,[enPool('NORM_EN_1','NORMAL','2026/05/01','Joint Operation'),enPool('NORM_EN_2','NORMAL','2026/05/01','Rare Operators useful in all kinds of stages'),
    enPool('NORM_EN_3','NORMAL','2026/06/01','Behold the Sword of Tide'),enPool('NORM_EN_4','NORMAL','2026/06/01','Quicksand Vortex')],'global');
  assert.deepEqual(enLinks.links.map((l:any)=>[global[l.index].name,l.poolId]),[['Joint Operation #9','NORM_EN_1'],['Standard Pool #99 (Global)','NORM_EN_2'],
    ['[Limited-Time] Behold the Sword of Tide','NORM_EN_3'],['[Limited-Time] Quicksand Vortex','NORM_EN_4']]);
  // The catalogue sync keeps them filled, and a pool no one can decide between is not minted.
  const synced=reconcileCalendars({announced:noNews,events:[],banners,operators:[],cn:tables(...cnPools),en:empty,eventRows:[],bannerRows:[],now:Date.parse('2026-04-12T00:00:00Z')});
  assert.deepEqual(synced.linked,{cn:3,global:0});
  assert.deepEqual(synced.banners.map((b:any)=>b.cnPoolId),['NORM_90_0_1','FESCLASSIC_90_0_1','SINGLE_90_0_2','SINGLE_89_0_9',undefined]);
  assert.deepEqual(synced.quarantine.map((e:any)=>[e.key,e.action]),[['banner:NORM_90_0_4','omitted-new']]);
  assert.match(synced.quarantine[0].reason,/CN pools NORM_90_0_4, NORM_90_0_5 all fit Joint Operation #31/);
  // A disagreement is reported, not dropped, and its pool is not published as a second,
  // Chinese-named record of the banner that already records another pool.
  const during=reconcileCalendars({announced:noNews,events:[],banners,operators:[],cn:tables(...cnPools),en:empty,eventRows:[],bannerRows:[],now:Date.parse('2026-03-20T00:00:00Z')});
  assert.ok(!during.banners.some((b:any)=>b.cnPoolId==='SINGLE_90_0_3'));
  assert.deepEqual(during.quarantine.map((e:any)=>[e.key,e.action]),[['banner:NORM_90_0_4','omitted-new'],['banner:SINGLE_90_0_3','kept-previous']]);
  assert.match(during.quarantine[1].reason,/fits \[Limited-Time\] Already Linked \(2026\/03\/10–2026\/03\/24\) by window and kind, but that record is pool SINGLE_89_0_9/);
});

test('a CN pool under the Standard name that continues the Standard chain is a Standard pool, never a Joint Operation',()=>{
  // Joint Operation #1: its record's cn_date is the window of Standard pool NORM_4_0_3, and
  // the real Joint Operation (NORM_4_0_4) opened a day later. Pools as in the CN table.
  const at=(day:string)=>Date.parse(`${day}T04:00:00+08:00`)/1000;
  const std=(id:string,open:string,close:string)=>({gachaPoolId:id,gachaRuleType:'NORMAL',gachaPoolName:'适合多种场合的强力干员',openTime:at(open),endTime:at(close)-1});
  const cnPools=[std('NORM_4_0_2','2019-10-17','2019-10-31'),std('NORM_4_0_3','2019-10-31','2019-11-14'),std('NORM_4_0_4','2019-11-01','2019-11-15'),std('NORM_4_0_5','2019-11-14','2019-11-28')];
  const recorded=[{name:'Joint Operation #1',pull_type:'joint',category:'special',cn_date:'2019/10/31–2019/11/14'}];
  assert.deepEqual(linkPools(recorded,cnPools,'cn'),{links:[],ambiguous:[],disagreements:[],conflicts:[]});
  const corrected=[{...recorded[0],cn_date:'2019/11/01–2019/11/15'},{name:'Standard Pool #30',pull_type:'standard',category:'standard_pool',cn_date:'2019/10/31–2019/11/14'}];
  assert.deepEqual(linkPools(corrected,cnPools,'cn').links.map((l:any)=>[corrected[l.index].name,l.poolId]),[['Standard Pool #30','NORM_4_0_3'],['Joint Operation #1','NORM_4_0_4']]);
});

test('a Global pool the client names after its banner is linked only under that name, and a pool in someone else\'s estimated window is reported',()=>{
  const enDay=(day:string)=>Date.parse(`${day.replaceAll('/','-')}T04:00:00-07:00`)/1000;
  const enPool=(gachaPoolId:string,gachaRuleType:string,day:string,gachaPoolName:string)=>({gachaPoolId,gachaRuleType,gachaPoolName,openTime:enDay(day),endTime:enDay(day)+14*86400-1});
  // Estimated Global windows: CN dates plus the usual gap, with no marker on the record.
  const records=()=>[{name:'Deterministic Chaos',pull_type:'featured',category:'standard',global_date:'2026/12/13–2026/12/27',cnPoolId:'SINGLE_75_0_1'},
    {name:'Dithyramb Unending Rerun',pull_type:'featured',category:'standard',global_date:'2026/12/23–2027/01/06',cnPoolId:'SINGLE_75_0_3'},
    {name:'[Limited-Time] The Piper on the Knoll',aliases:['Grassy Bagpipe'],pull_type:'featured',category:'standard',global_date:'2020/09/10–2020/09/24'},
    {name:'Joint Operation #24',pull_type:'joint',category:'special',global_date:'2026/12/13–2026/12/27'}];
  // Global runs them in the other order: the rerun opens in the window guessed for the new banner.
  const swapped=[enPool('SINGLE_EN_50_0_1','SINGLE','2026/12/13','Dithyramb Unending'),enPool('NORM_EN_8_0_1','NORMAL','2020/09/10','Grassy Bagpipe'),
    enPool('NORM_EN_50_0_2','NORMAL','2026/12/13','Joint Operation')];
  const banners=records(), result=linkPools(banners,swapped,'global');
  // The name another record is known by counts; the generic Joint Operation name needs none.
  assert.deepEqual(result.links.map((l:any)=>[banners[l.index].name,l.poolId]),[['[Limited-Time] The Piper on the Knoll','NORM_EN_8_0_1'],['Joint Operation #24','NORM_EN_50_0_2']]);
  assert.deepEqual(result.conflicts.map((c:any)=>[c.pool,c.poolName,c.candidates]),[['SINGLE_EN_50_0_1','Dithyramb Unending',['Deterministic Chaos']]]);
  // The daily sync reports it while it is recent, and shows no estimate as confirmed.
  const en={...empty,source:'en-mirror',gacha:{gachaPoolClient:swapped}};
  const synced=reconcileCalendars({announced:noNews,events:[],banners:records(),operators:[],cn:tables(),en,eventRows:[],bannerRows:[],now:Date.parse('2026-12-14T00:00:00Z')});
  assert.equal(synced.banners[0].globalPoolId,undefined);
  assert.deepEqual(synced.quarantine.map((e:any)=>[e.key,e.action]),[['banner:SINGLE_EN_50_0_1','kept-previous']]);
  assert.match(synced.quarantine[0].reason,/Global pool SINGLE_EN_50_0_1 "Dithyramb Unending" opens in the window of Deterministic Chaos \(2026\/12\/13–2026\/12\/27\), which is named otherwise/);
  // The same history, years later, is the backfill's to list, not the daily issue's.
  assert.deepEqual(reconcileCalendars({announced:noNews,events:[],banners:records(),operators:[],cn:tables(),en,eventRows:[],bannerRows:[],now:Date.parse('2027-06-01T00:00:00Z')}).quarantine,[]);
  // When Deterministic Chaos's own pool ships in that window, it is linked by its name.
  const real=linkPools(records(),[...swapped,enPool('SINGLE_EN_50_0_3','SINGLE','2026/12/13','Deterministic Chaos')],'global');
  assert.deepEqual(real.links.map((l:any)=>l.poolId).sort(),['NORM_EN_50_0_2','NORM_EN_8_0_1','SINGLE_EN_50_0_3']);
});

test('a record with no English name yet never takes a named Global pool by its window alone',()=>{
  const enDay=(day:string)=>Date.parse(`${day.replaceAll('/','-')}T04:00:00-07:00`)/1000;
  const named={gachaPoolId:'SINGLE_EN_60_0_1',gachaRuleType:'SINGLE',gachaPoolName:'Dithyramb Unending',openTime:enDay('2026/12/13'),endTime:enDay('2026/12/13')+14*86400-1};
  // Published from the CN client under its Chinese name, and given a Global window (by hand, or by an estimate).
  const record=(extra:object={})=>({name:'[Headhunting] 单人之名',nameStatus:'cn-official',pull_type:'featured',category:'special',global_date:'2026/12/13–2026/12/27',cnPoolId:'SINGLE_90_0_2',...extra});
  const chinese=linkPools([record()],[named],'global');
  assert.deepEqual(chinese.links,[]);
  assert.deepEqual(chinese.conflicts.map((c:any)=>[c.pool,c.candidates]),[['SINGLE_EN_60_0_1',['[Headhunting] 单人之名']]]);
  // Known by the pool's name, it is linked.
  assert.deepEqual(linkPools([record({aliases:['Dithyramb Unending']})],[named],'global').links,[{index:0,poolId:'SINGLE_EN_60_0_1'}]);
});

test('a discovered event still localizes after leaving the upcoming calendar',()=>{
  const en=structuredClone(cn);en.activity.basicInfo.act54side.name='Official Global event';
  en.activity.basicInfo.act54side.startTime=2000000000;en.activity.basicInfo.act54side.endTime=2001000000;
  const event={name:'[Crossover] Provisional event',activityId:'act54side',global:{dateRange:null},cn:{dateRange:'2026/09/04–2026/09/18'}};
  const result=reconcileCalendars({announced:noNews,events:[event],banners:[],operators:[],cn,en,eventRows:[],bannerRows:[]});
  assert.equal(result.events[0].name,'[Crossover] Official Global event');
  assert.equal(result.events[0].global.startAt,new Date(2000000000*1000).toISOString());
  assert.equal(result.events[0].global.note,null);
  assert.deepEqual(result.renames,[[event.name,'[Crossover] Official Global event']]);
});

// The mirrors are read at the run's pin, which moves with every mirror commit; a record whose
// window did not move keeps the source that confirmed it, or that commit alone is a release.
test('a window the client confirms again at a newer mirror commit keeps the source that first confirmed it',()=>{
  const at=(source:string,start=2000000000)=>{const en=structuredClone(cn);Object.assign(en.activity.basicInfo.act54side,{name:'Official Global event',startTime:start,endTime:start+1000000});en.source=source;return en;};
  const event={name:'[Crossover] Official Global event',activityId:'act54side',global:{dateRange:null},cn:{dateRange:'2026/09/04–2026/09/18'}};
  const pool=structuredClone(cn).gacha.gachaPoolClient[0], globalStart=new Date((pool.openTime-7*3600)*1000).toISOString().slice(0,10).replaceAll('-','/');
  const banner={name:rows.bannerRows[0].name,cn_date:'2026/09/04–2026/09/18',global_date:null,cnPoolId:pool.gachaPoolId};
  const operators=reconcileOperators({operators:[],cn,en:empty}).operators;
  const run=(en:any,records:{events:object[],banners:object[]})=>reconcileCalendars({announced:noNews,...records,operators,cn,en:{...en,gacha:{gachaPoolClient:[{...pool,gachaPoolName:rows.bannerRows[0].name}]}},eventRows:[],bannerRows:[{...rows.bannerRows[0],start:globalStart}]});
  const first=run(at('https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/aaaa/en/gamedata/excel'),{events:[event],banners:[banner]});
  const sources=(result:any)=>[result.events[0].global.timingSource,result.banners[0].global_window.timingSource];
  assert.deepEqual(sources(first),Array(2).fill('https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/aaaa/en/gamedata/excel'));
  const next=run(at('https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/bbbb/en/gamedata/excel'),first);
  assert.deepEqual(next.events,first.events);
  assert.deepEqual(next.banners,first.banners);
  // A window that moves records the source that moved it.
  const moved=run(at('https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/cccc/en/gamedata/excel',2000086400),first);
  assert.equal(moved.events[0].global.timingSource,'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/cccc/en/gamedata/excel');
  assert.equal(moved.events[0].global.startAt,new Date(2000086400*1000).toISOString());
});

test('the CN inventory keeps the source it was read from while what it lists is the same',()=>{
  const listed={operators:[{id:'char_1',name:'A'}],skins:[],events:[{id:'act1',name:'E'}],banners:[]};
  const source=(revision:string)=>({repository:'https://github.com/Kengxxiao/ArknightsGameData',revision,files:{'character_table.json':revision}});
  const before={source:source('a'.repeat(40)),...listed};
  assert.equal(JSON.stringify(withStableSource(before,{source:source('b'.repeat(40)),...listed})),JSON.stringify(before));
  const grown={source:source('b'.repeat(40)),...listed,operators:[...listed.operators,{id:'char_2',name:'B'}]};
  assert.deepEqual(withStableSource(before,grown),grown);
  assert.deepEqual(withStableSource(null,grown),grown);
});

test('existing Global banner identities retain rerun and edition qualifiers',()=>{
  const operators=reconcileOperators({operators:[],cn,en:empty}).operators;
  const en=structuredClone(cn), pool=en.gacha.gachaPoolClient[0];
  pool.gachaPoolName=rows.bannerRows[0].name;
  const banner={name:rows.bannerRows[0].name+' Rerun',cn_date:'2026/09/04–2026/09/18',global_date:'2026/09/04–2026/09/18',cnPoolId:pool.gachaPoolId};
  const date=new Date((pool.openTime-7*3600)*1000).toISOString().slice(0,10).replaceAll('-','/');
  const result=reconcileCalendars({announced:noNews,events:[],banners:[banner],operators,cn,en,eventRows:[],bannerRows:[{...rows.bannerRows[0],start:date}]});
  assert.equal(result.banners[0].name,banner.name);
  assert.deepEqual(result.renames,[]);
});

test('the one-time backfill writes the links from local tables, keeps recorded ids, and lists what it could not decide',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'arkpedia-backfill-'));
  try {
    const cnDayOf=(day:string)=>Date.parse(`${day}T16:00:00+08:00`)/1000, enDayOf=(day:string)=>Date.parse(`${day}T04:00:00-07:00`)/1000;
    const filler=(prefix:string)=>Array.from({length:100},(_,i)=>({gachaPoolId:`${prefix}_FILLER_${i}`,gachaRuleType:'BACKFLOW',gachaPoolName:'-',openTime:1,endTime:2}));
    const cnTable={gachaPoolClient:[...filler('CN'),{gachaPoolId:'SINGLE_91_0_1',gachaRuleType:'SINGLE',gachaPoolName:'单人',openTime:cnDayOf('2026-02-10'),endTime:cnDayOf('2026-02-24')-1},
      {gachaPoolId:'SINGLE_91_0_2',gachaRuleType:'SINGLE',gachaPoolName:'别的',openTime:cnDayOf('2026-03-10'),endTime:cnDayOf('2026-03-24')-1}]};
    const enTable={gachaPoolClient:[...filler('EN'),{gachaPoolId:'SINGLE_EN_91_0_1',gachaRuleType:'SINGLE',gachaPoolName:'Only One',openTime:enDayOf('2026-08-10'),endTime:enDayOf('2026-08-24')-1}]};
    const banners=[{name:'[Limited-Time] Only One',pull_type:'featured',category:'standard',cn_date:'2026/02/10–2026/02/24',global_date:'2026/08/10–2026/08/24'},
      {name:'[Limited-Time] Linked Elsewhere',pull_type:'featured',category:'standard',cn_date:'2026/03/10–2026/03/24',cnPoolId:'SINGLE_90_0_7'}];
    for (const [file,value] of [['cn.json',cnTable],['en.json',enTable],['banners.json',banners]] as const) fs.writeFileSync(path.join(root,file),`${JSON.stringify(value,null,2)}\n`);
    const output=execFileSync(process.execPath,[path.resolve('scripts/sync/backfill-pool-ids.mjs'),path.join(root,'banners.json'),'--cn-table',path.join(root,'cn.json'),'--en-table',path.join(root,'en.json'),'--write'],{encoding:'utf8'});
    assert.match(output,/cnPoolId: 1 -> 2 of 2 records \(1 linked\)/);
    assert.match(output,/globalPoolId: 0 -> 1 of 2 records \(1 linked\)/);
    assert.match(output,/! \[Limited-Time\] Linked Elsewhere: recorded SINGLE_90_0_7, the window matches SINGLE_91_0_2/);
    const written=JSON.parse(fs.readFileSync(path.join(root,'banners.json'),'utf8'));
    assert.deepEqual(written.map((b:any)=>[b.cnPoolId,b.globalPoolId]),[['SINGLE_91_0_1','SINGLE_EN_91_0_1'],['SINGLE_90_0_7',undefined]]);
    // A truncated table is refused rather than read as "no pools".
    fs.writeFileSync(path.join(root,'cn.json'),'{"gachaPoolClient":[]}');
    assert.throws(()=>execFileSync(process.execPath,[path.resolve('scripts/sync/backfill-pool-ids.mjs'),path.join(root,'banners.json'),'--cn-table',path.join(root,'cn.json'),'--en-table',path.join(root,'en.json')],{stdio:'pipe'}),/Truncated or changed cn gacha table/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('an operator the tables cannot describe is held back on its own, and the rest of the catalogue goes on',()=>{
  // A new CN operator whose archive text the mirror does not carry yet.
  const partial=structuredClone(cn);delete partial.handbook.handbookDict.char_4219_yukari;
  const first=reconcileOperators({operators:[],cn:partial,en:empty});
  assert.deepEqual(first.operators.map((o:any)=>o.internalName).sort(),['char_4217_makoto','char_4218_aigis','char_4220_kormr']);
  assert.deepEqual(first.quarantine.map((e:any)=>[e.key,e.action]),[['operator:char_4219_yukari','omitted-new']]);
  assert.match(first.quarantine[0].reason,/has no archive text in the CN handbook table yet, so it is left out/);
  // An existing one whose Global promotion lacks it keeps its previous version, name and all.
  const previous=reconcileOperators({operators:[],cn,en:empty}).operators;
  const en=structuredClone(cn);en.characters.char_4217_makoto.name='Official Global name';delete en.handbook.handbookDict.char_4217_makoto;
  const promoted=reconcileOperators({operators:previous,cn,en});
  assert.deepEqual(promoted.operators,previous);
  assert.deepEqual([promoted.changes,promoted.renames],[[],[]]);
  assert.deepEqual(promoted.quarantine.map((e:any)=>[e.key,e.action]),[['operator:char_4217_makoto','kept-previous']]);
  // No usable name is the same case.
  const nameless=structuredClone(cn);nameless.characters.char_4218_aigis.appellation='';nameless.characters.char_4218_aigis.name='//';
  assert.deepEqual(reconcileOperators({operators:[],cn:nameless,en:empty}).quarantine.map((e:any)=>[e.key,e.action]),[['operator:char_4218_aigis','omitted-new']]);
});

test('an operator whose game text the rebuild refuses is held back on its own; an error that is no refusal fails the stage',()=>{
  // A trait naming a value the game's trait data does not carry (officialTrait refuses it).
  const refused=structuredClone(cn);refused.characters.char_4219_yukari.description='Recovers {nope} HP';refused.characters.char_4219_yukari.trait=null;
  const first=reconcileOperators({operators:[],cn:refused,en:empty});
  assert.deepEqual(first.operators.map((o:any)=>o.internalName).sort(),['char_4217_makoto','char_4218_aigis','char_4220_kormr']);
  assert.deepEqual(first.quarantine.map((e:any)=>[e.key,e.action]),[['operator:char_4219_yukari','omitted-new']]);
  assert.match(first.quarantine[0].reason,/has a trait whose text names a value the game's trait data does not carry, so it is left out/);
  // An existing one promoted to Global keeps its previous version.
  const previous=reconcileOperators({operators:[],cn,en:empty}).operators;
  const en=structuredClone(refused);en.characters.char_4219_yukari.name='Official Global name';
  const promoted=reconcileOperators({operators:previous,cn,en});
  assert.deepEqual(promoted.operators.find((o:any)=>o.internalName==='char_4219_yukari'),previous.find((o:any)=>o.internalName==='char_4219_yukari'));
  assert.deepEqual(promoted.quarantine.filter((e:any)=>e.key==='operator:char_4219_yukari').map((e:any)=>e.action),['kept-previous']);
  // A bug (here a missing table officialModules requires) would hold every operator: it throws instead.
  const broken=structuredClone(cn);delete broken.battleEquip;
  assert.throws(()=>reconcileOperators({operators:[],cn:broken,en:empty}),/battle_equip_table/);
});

test('a gap the rebuild reports is written as the English refresh writes it (gapReason), after every hold',()=>{
  // The Global table's talent has no name: the record's talent stays at its place, reported.
  const previous=reconcileOperators({operators:[],cn,en:empty}).operators;
  const en=structuredClone(cn);en.characters.char_4219_yukari.name='Official Global name';
  for(const candidate of en.characters.char_4219_yukari.talents[0].candidates)candidate.name=null;
  const promoted=reconcileOperators({operators:previous,cn,en});
  const recorded=previous.find((o:any)=>o.internalName==='char_4219_yukari').talents[0];
  assert.deepEqual(promoted.operators.find((o:any)=>o.internalName==='char_4219_yukari').talents[0],recorded);
  assert.deepEqual(promoted.quarantine.filter((e:any)=>e.key==='operator:char_4219_yukari'),[{key:'operator:char_4219_yukari',action:'published-partial',
    reason:`Official Global name's talent ${recorded.name} is published as the record has it: the game's talent at its place has no name.`}]);
});

test('a wiki row never moves a Global pool id: not off the record that holds the pool, not over one the record holds',()=>{
  const enDay=(day:string)=>Date.parse(`${day.replaceAll('/','-')}T04:00:00-07:00`)/1000;
  const cnTables=tables(pool('SINGLE_90_0_1','SINGLE','2026/03/10','某人'));
  const en={...empty,source:'en-mirror',gacha:{gachaPoolClient:[{gachaPoolId:'SINGLE_EN_90_0_1',gachaRuleType:'SINGLE',gachaPoolName:'Someone Else',openTime:enDay('2026/08/13'),endTime:enDay('2026/08/27')-1}]}};
  const row={name:'Some Banner',type:'special',cnstart:'2026/03/10',start:'2026/08/13',operators:'Featured Six'};
  const banners=[{name:'[Headhunting] Some Banner',category:'special',cn_date:'2026/03/10–2026/03/24',cnPoolId:'SINGLE_90_0_1',pull_type:'featured',six_stars:['Featured Six']},
    {name:'Someone Else',category:'special',global_date:'2026/08/13–2026/08/27',globalPoolId:'SINGLE_EN_90_0_1',pull_type:'featured',six_stars:[]}];
  const result=reconcileCalendars({announced:noNews,events:[],banners,operators:sixStar,cn:cnTables,en,eventRows:[],bannerRows:[row],now:Date.parse('2026-08-14T00:00:00Z')});
  assert.deepEqual(result.banners.map((b:any)=>[b.name,b.globalPoolId]),[['[Headhunting] Some Banner',undefined],['Someone Else','SINGLE_EN_90_0_1']]);
  assert.deepEqual(result.quarantine.map((e:any)=>[e.key,e.action]),[['banner:SINGLE_EN_90_0_1','kept-previous']]);
  assert.match(result.quarantine[0].reason,/Someone Else already records that pool/);
});

test('event rows the wiki dates in a form the parser cannot read are reported together, not dropped one by one in silence',()=>{
  const act=(id:string,day:string)=>({id,type:'SIDESTORY',name:id,hasStage:true,startTime:cnDay(day),endTime:cnDay(day)+14*86400});
  const cnTables={...tables(),activity:{basicInfo:Object.fromEntries(['2026/06/01','2026/06/15','2026/07/01','2026/07/15'].map((day,i)=>[`act${i}`,act(`act${i}`,day)]))}};
  const end=(day:string)=>new Date((cnDay(day)+14*86400+8*3600)*1000).toISOString().slice(0,10).replaceAll('-','/');
  const rows=['2026/06/01','2026/06/15','2026/07/01','2026/07/15'].map((day,i)=>({name:`Event ${i}`,type:'side story',cnstart:day,cnend:end(day)}));
  // A normal page: every row applies, one loosely dated row ("Late September") included.
  const fine=reconcileCalendars({announced:noNews,events:[],banners:[],operators:[],cn:cnTables,en:empty,bannerRows:[],now:september,eventRows:[...rows,{name:'Vague',cnstart:'Late September 2026',cnend:''}]});
  assert.equal(fine.events.length,4);assert.deepEqual(fine.quarantine,[]);
  // The page switches its date format: nothing parses.
  const reformatted=reconcileCalendars({announced:noNews,events:[],banners:[],operators:[],cn:cnTables,en:empty,bannerRows:[],now:september,
    eventRows:rows.map(row=>({...row,cnstart:row.cnstart.replaceAll('/','-'),cnend:row.cnend.replaceAll('/','-')}))});
  assert.deepEqual(reformatted.quarantine.map((e:any)=>[e.key,e.action]),[['events:wiki-rows','kept-previous']]);
  assert.match(reformatted.quarantine[0].reason,/Most event rows the wiki lists have no name or no YYYY\/MM\/DD CN start \(e\.g\. "2026-06-01"\)/);
  // Dates that parse but no longer name the days the activities run.
  const shifted=reconcileCalendars({announced:noNews,events:[],banners:[],operators:[],cn:cnTables,en:empty,bannerRows:[],now:september,eventRows:rows.map(row=>({...row,cnend:'2026/12/31'}))});
  assert.deepEqual(shifted.quarantine.map((e:any)=>e.key),['events:wiki-rows']);
  // No day and no count in the words: the rows already past grow by themselves, and the reason is a release input.
  assert.equal(shifted.quarantine[0].reason,"Most event rows the wiki dates to CN days already past match no single CN activity by its opening and closing days, so no CN event is discovered from them; the page's dates have probably changed form. Events keep their previous records.");
});

test('existing CN overview is backfilled and replaced with official Global text on release', () => {
  const imported = reconcileOperators({ operators: [], cn, en: empty }).operators;
  const op = imported.find((o: any) => o.internalName === 'char_4217_makoto');
  assert.match(op.review.official, /结城理/);
  delete op.review;
  const repaired = reconcileOperators({ operators: imported, cn, en: empty });
  const fixed = repaired.operators.find((o: any) => o.internalName === op.internalName);
  assert.match(fixed.review.official, /结城理/);
  assert(repaired.changes.includes(op.internalName));
  const global = structuredClone(cn);
  global.characters[op.internalName].name = 'Makoto Yuki';
  global.handbook.handbookDict[op.internalName].storyTextAudio = [{ storyTitle: 'Profile', stories: [{ storyText: 'Official Global profile', unLockType: 'DIRECT' }] }];
  const released = reconcileOperators({ operators: repaired.operators, cn, en: global });
  assert.equal(released.operators.find((o: any) => o.internalName === op.internalName).review.official, 'Official Global profile');
});

/* The smallest regional tables reconcileSkins reads: one outfit, its brand, and the
   activity that opened with it. Shapes and values are copied from the live skin_table
   and activity_table entries for Surtr's "Prelude to Transcendence". */
const SURTR = 'char_350_surtr@ambienceSynesthesia#6';
function outfitTables(id: string, display: Record<string, unknown>, activity?: { id: string; name: string; startTime: number }, brand = { brandId: 'ambienceSynesthesia', brandCapitalName: 'AMBIENCE SYNESTHESIA' }) {
  const skinGroupId = (display.skinGroupId as string) ?? '2026#ambienceSynesthesia';
  return {
    skins: { charSkins: { [id]: { charId: id.split('@')[0], isBuySkin: true, displaySkin: { drawerList: ['Ask'], skinGroupId, skinGroupName: 'Ambience Synesthesia/VII', obtainApproach: 'Store', ...display } } },
      brandList: { [brand.brandId]: { ...brand, groupList: [{ skinGroupId }] } } },
    activity: { basicInfo: activity ? { [activity.id]: activity } : {} },
  };
}
const surtrCn = outfitTables(SURTR, { skinName: '超然序曲', getTime: 1775516400,
  content: '<color name=#ffffff>音律联觉特供款/超然序曲。史尔特尔出席剧场晚会时的着装。</color>', dialog: '音律联觉特供款/超然序曲。史尔特尔出席剧场晚会时的着装。' },
  { id: 'act51side', name: '人们，我们', startTime: 1775516400 });
const surtrEn = outfitTables(SURTR, { skinName: 'Prelude to Transcendence', getTime: 1789570800,
  content: '<color name=#fffff>Ambience Synesthesia Tailor-Provided/Prelude to Transcendence. Clothes Surtr wore to the theater.</color>',
  dialog: 'Ambience Synesthesia Tailor-Provided/Prelude to Transcendence. Clothes Surtr wore to the theater.' },
  { id: 'act51side', name: 'People, A People', startTime: 1789570800 });
const surtrOp = [{ name: 'Surtr', internalName: 'char_350_surtr', rarity: 6 }];
// No activityId, as on 191 of the 202 live event records; a second event opens the same Global day.
const surtrEvents = [
  { name: '[Rerun] Something Else Rerun', cn: { dateRange: '2025/01/01–2025/01/10' }, global: { dateRange: '2026/09/16–2026/09/26' } },
  { name: '[Side Story] People, A People', cn: { dateRange: '2026/04/07–2026/04/21' }, global: { dateRange: '2026/09/16–2026/09/30' } },
];

test('rich text loses Unity formatting tags and keeps the angle-bracket words the game prints', () => {
  assert.equal(stripRichText('<color name=#fffff>Ambience Synesthesia Tailor-Provided/Prelude.</color>'), 'Ambience Synesthesia Tailor-Provided/Prelude.');
  assert.equal(stripRichText('<color=#ff0000>Hot</color> and <i>only</i> <size=20>big</size> <@ba.vup>+20%</>'), 'Hot and only big +20%');
  assert.equal(stripRichText('<In battle> <When obtained> <Sargon> can only be used during the <break> <to be filled>'),
    '<In battle> <When obtained> <Sargon> can only be used during the <break> <to be filled>');
});

test('an outfit blurb splits into its code line and its description, as the catalogue stores them', () => {
  assert.deepEqual(skinText({ dialog: 'EPOQUE Collection New Arrivals/Charm of the Tiles. Clothes Kestrel wears.' }),
    { code: 'EPOQUE Collection New Arrivals/Charm of the Tiles', description: 'Clothes Kestrel wears.' });
  assert.deepEqual(skinText({ content: '<color name=#ffffff>Whistlewind Series Race Queen Core Line/Queen, No.1. In full race queen form.</color>' }),
    { code: 'Whistlewind Series Race Queen Core Line/Queen, No.1', description: 'In full race queen form.' });
  assert.deepEqual(skinText({ dialog: '音律联觉特供款/超然序曲。史尔特尔出席剧场晚会时的着装。' }), { code: '音律联觉特供款/超然序曲', description: '史尔特尔出席剧场晚会时的着装。' });
  assert.equal(skinText({ dialog: '《怪物猎人》合作服装/露营时间喵！为喜欢在山野林间活动的隐秘队量身定做的服装。' }).code, '《怪物猎人》合作服装/露营时间喵！');
  // Prose first sentences are not codes, including a slash inside the brand's brackets.
  assert.deepEqual(skinText({ dialog: 'MARTHE [Coral Coast] Holiday Series HD01. Comfortable, relaxed.' }), { code: null, description: 'MARTHE [Coral Coast] Holiday Series HD01. Comfortable, relaxed.' });
  assert.equal(skinText({ dialog: 'MARTHE [珊瑚海岸/CoralCoast]悠然假日系列泳衣01款。轻松舒适。' }).code, null);
});

test('Global promotion replaces the CN code, markup, [CN] label and ALL-CAPS series without an activityId', () => {
  // Surtr's live record at arkpedia-data f5b106ba, promoted once already by the old reconciler.
  const live = { name: 'Prelude to Transcendence', series: 'AMBIENCE SYNESTHESIA', seriesImage: '/skin-series-logos/Ambience Synesthesia.webp',
    code: '音律联觉特供款/超然序曲.', model: 'Surtr', illustrator: 'Ask', description: '<color name=#fffff>Ambience Synesthesia Tailor-Provided/Prelude to Transcendence. Clothes Surtr wore to the theater.</color>',
    release: '[CN] People, A People', howToObtain: 'Outfit Store ( 21 Originite Prime )', image: '/six-star-skins/Surtr - Prelude to Transcendence.webp',
    skinId: SURTR, sourceRegion: 'Global', cnReleaseAt: 1775516400, globalReleaseAt: 1789570800 };
  const first = reconcileSkins({ skins: [live], operators: surtrOp, cn: surtrCn, en: surtrEn, events: surtrEvents });
  const skin = first.skins[0];
  assert.equal(skin.code, 'Ambience Synesthesia Tailor-Provided/Prelude to Transcendence');
  assert.equal(skin.description, 'Clothes Surtr wore to the theater.');
  assert.equal(skin.release, 'People, A People');
  assert.equal(skin.series, 'Ambience Synesthesia');
  assert.equal(skin.howToObtain, live.howToObtain);
  assert.deepEqual(first.renames, []);
  // The label names the event that opened with the outfit, picked by name from the two
  // that opened that day, not whatever the CN-era text said.
  const provisional = reconcileSkins({ skins: [{ ...live, release: '[CN] Humans, Our People' }], operators: surtrOp, cn: surtrCn, en: surtrEn, events: surtrEvents });
  assert.equal(provisional.skins[0].release, 'People, A People');
  // Nothing is left for the gate to find, so the next run changes nothing.
  const second = reconcileSkins({ skins: first.skins, operators: surtrOp, cn: surtrCn, en: surtrEn, events: surtrEvents });
  assert.deepEqual(second.skins, first.skins);
  assert.deepEqual(second.changes, []);
});

test('a skin that was Global before the reconciler ran is promoted by its (CN) label and CN description', () => {
  const id = 'char_4023_rfalcn@epoque#52', group = '2026#epoque#3', brand = { brandId: 'epoque', brandCapitalName: 'EPOQUE' };
  const cn = outfitTables(id, { skinName: '三元风情', skinGroupId: group, getTime: 1773097200, dialog: 'EPOQUE系列新款/三元风情。红隼在棋牌茶室游玩时的穿着。' }, { id: 'act20mini', name: '十字路口', startTime: 1773097200 }, brand);
  const en = outfitTables(id, { skinName: 'Charm of the Tiles', skinGroupId: group, getTime: 1786622400, dialog: 'EPOQUE Collection New Arrivals/Charm of the Tiles. Clothes Kestrel wears while having fun at the games teahouse.' }, { id: 'act20mini', name: 'Crossing', startTime: 1786622400 }, brand);
  const live = { name: 'Charm of The Tiles', series: 'EPOQUE', seriesImage: '/skin-series-logos/EPOQUE.webp', code: 'EPOQUE Collection New Arrivals/Charm of the Tiles',
    model: 'Kestrel', illustrator: '釜飯轟々丸', description: '红隼在棋牌茶室游玩时的穿着。', release: '(CN) Crossing', howToObtain: 'Red Wine Championship Committee ( 350 Cork Wine Stopper )',
    image: '/skin-images/EPOQUE - Charm of The Tiles.webp', skinId: id };
  const operators = [{ name: 'Kestrel', internalName: 'char_4023_rfalcn', rarity: 5 }];
  const events = [{ name: '[Story Collection] Crossing', cn: { dateRange: '2026/03/10–2026/03/17' }, global: { dateRange: '2026/08/13–2026/08/20' } }];
  const result = reconcileSkins({ skins: [live], operators, cn, en, events });
  const skin = result.skins[0];
  assert.equal(skin.sourceRegion, 'Global');
  assert.equal(skin.description, 'Clothes Kestrel wears while having fun at the games teahouse.');
  assert.equal(skin.release, 'Crossing');
  // Official "Charm of the Tiles" differs only in case: the published art's name stays.
  assert.equal(skin.name, 'Charm of The Tiles');
  assert.equal(skin.image, '/five-star-skins/Kestrel - Charm of The Tiles.webp');
  assert.deepEqual(result.renames, []);
  // With no event record to name, the label still loses its CN marker.
  assert.equal(reconcileSkins({ skins: [live], operators, cn, en, events: [] }).skins[0].release, 'Crossing');
});

test('a new CN outfit gets its CN code line, a [CN] label from its opening day and the site series spelling', () => {
  const result = reconcileSkins({ skins: [], operators: surtrOp, cn: surtrCn, en: { skins: { charSkins: {}, brandList: {} }, activity: { basicInfo: {} } }, events: surtrEvents });
  assert.deepEqual(result.skins.map((s: any) => [s.code, s.description, s.release, s.series, s.sourceRegion]),
    [['音律联觉特供款/超然序曲', '史尔特尔出席剧场晚会时的着装。', '[CN] People, A People', 'Ambience Synesthesia', 'CN']]);
});

test('series spellings are normalised on every record, and what the reconciler cannot fix keeps its previous version or is left out', () => {
  const id = 'char_4222_rkeep@yun#9', group = '2026#yun', brand = { brandId: 'yun', brandCapitalName: '0011 YUN-SERIES' };
  const display = { skinName: 'Record Keeper outfit', skinGroupId: group, getTime: 1, dialog: '0011/Yun Series New Arrivals/Record Keeper outfit. Official text.' };
  const tables = outfitTables(id, display, undefined, brand);
  const handTyped = { name: 'Record Keeper outfit', series: '0011/Yun', code: '0011/Yun Series New Arrivals/Record Keeper outfit', model: 'Record Keeper',
    description: 'Official text.', release: 'Some event', skinId: id };
  const operators = [{ name: 'Record Keeper', internalName: 'char_4222_rkeep', rarity: 5 }];
  assert.equal(reconcileSkins({ skins: [handTyped], operators, cn: tables, en: tables, events: [] }).skins[0].series, '0011 Yun');
  // A brand the site has never listed still gets a readable name, the same in both regions.
  const fresh = outfitTables(id, display, undefined, { brandId: 'newbrand', brandCapitalName: 'BLOODLINE OF THE NEW YUN-SERIES' });
  assert.equal(reconcileSkins({ skins: [], operators, cn: fresh, en: fresh, events: [] }).skins[0].series, 'Bloodline of the New Yun-Series');
  // A record with no series and no source to take one from stays as it was, reported.
  const seriesless = { ...handTyped, skinId: 'char_0000_gone@x#1', series: '' };
  const kept = reconcileSkins({ skins: [seriesless], operators, cn: tables, en: tables, events: [] });
  assert.deepEqual(kept.skins[0], seriesless);
  assert.deepEqual(kept.quarantine.map((e: any) => [e.key, e.action]), [['outfit:char_0000_gone@x#1', 'kept-previous']]);
  assert.match(kept.quarantine[0].reason, /no series, so \/skins cannot filter it/);
  // An English title over CN placeholder text is not Global yet; CN flavour text reaching a
  // Global record through the last fallback is caught instead of published.
  const placeholder = outfitTables(id, { ...display, dialog: '0011/韵系列新款/档案。' });
  assert.equal(reconcileSkins({ skins: [], operators, cn: tables, en: placeholder, events: [] }).skins[0].sourceRegion, 'CN');
  const flavour = outfitTables(id, { ...display, dialog: '', content: '', description: '她的档案。' });
  // A new outfit is left out; an existing one keeps its previous version, without the rename.
  const newcomer = reconcileSkins({ skins: [], operators, cn: tables, en: flavour, events: [] });
  assert.deepEqual([newcomer.skins, newcomer.quarantine.map((e: any) => [e.key, e.action])], [[], [['outfit:char_4222_rkeep@yun#9', 'omitted-new']]]);
  assert.match(newcomer.quarantine[0].reason, /still carries CN text or a CN release label, so it is left out/);
  const provisional = { ...handTyped, name: 'Provisional outfit', series: '0011 Yun', sourceRegion: 'CN' };
  const previous = reconcileSkins({ skins: [provisional], operators, cn: tables, en: flavour, events: [] });
  assert.deepEqual([previous.skins, previous.renames, previous.changes], [[provisional], [], []]);
  assert.equal(previous.quarantine[0].action, 'kept-previous');
});

test('the importer writes the spellings the /skins dropdown orders, and every record is selectable', () => {
  assert.deepEqual(Object.values(SKIN_SERIES), ALL_SERIES);
  assert.deepEqual(skinSeriesOptions([{ series: 'Brand New' }, { series: 'AMBIENCE SYNESTHESIA' }, { series: 'Coral Coast' }, { series: '0011/Yun' }, { series: 'Ambience Synesthesia' }]),
    ['0011 Yun', 'Coral Coast', 'Ambience Synesthesia', 'Brand New']);
  // The bundled catalogue, including the three records the hard-coded list used to drop.
  const options = new Set(skinSeriesOptions(bundledSkins as { series: string }[]).map(seriesKey));
  const unselectable = (bundledSkins as { name: string; series: string }[]).filter(skin => !options.has(seriesKey(skin.series)) || !seriesKey(skin.series));
  assert.deepEqual(unselectable.map(skin => skin.name), []);
});

test('in January a yearly banner page the wiki has not created yet reads as no rows; later, or for any other page, it stops the sync', () => {
  // What the wiki API returns, with HTTP 200, for a page that does not exist.
  const missing = { error: { code: 'missingtitle', info: "The page you specified doesn't exist." } };
  const january = new Date('2027-01-15T12:00:00Z');
  assert.equal(wikiText('Headhunting/Banners/2027', missing, january), '');
  assert.deepEqual(parseWikiRows(wikiText('Headhunting/Banners/2027', missing, january), 'Banners cell'), []);
  // The whole of January in UTC, and not a second more.
  assert.equal(wikiText('Headhunting/Banners/2027', missing, new Date('2027-01-01T00:00:00Z')), '');
  assert.equal(wikiText('Headhunting/Banners/2027', missing, new Date('2027-01-31T23:59:59Z')), '');
  for (const late of ['2027-02-01T00:00:00Z', '2027-09-23T12:00:00Z', '2027-12-31T23:59:59Z']) {
    assert.throws(() => wikiText('Headhunting/Banners/2027', missing, new Date(late)), /Missing structured wiki page: Headhunting\/Banners\/2027/, late);
  }
  // On New Year's Eve the next year's page is not asked for; if it were, it is not excused.
  assert.throws(() => wikiText('Headhunting/Banners/2027', missing, new Date('2026-12-31T23:59:59Z')), /Missing structured wiki page/);
  // Only the current year's page, and only the yearly banner page.
  assert.throws(() => wikiText('Headhunting/Banners/2026', missing, january), /Missing structured wiki page: Headhunting\/Banners\/2026/);
  for (const page of ['Headhunting/Banners/Upcoming', 'Event/Upcoming']) assert.throws(() => wikiText(page, missing, january), new RegExp(`Missing structured wiki page: ${page}`));
  // Only a page that does not exist is excused: a failed or empty read of the yearly page still stops it.
  assert.throws(() => wikiText('Headhunting/Banners/2027', { error: { code: 'ratelimited' } }, january), /Missing structured wiki page/);
  assert.throws(() => wikiText('Headhunting/Banners/2027', { parse: { wikitext: { '*': '' } } }, january), /Missing structured wiki page/);
  const page = '{{Banners cell\n|name = Test banner\n}}';
  assert.equal(wikiText('Headhunting/Banners/2027', { parse: { wikitext: { '*': page } } }, new Date('2027-09-23T12:00:00Z')), page);
});

test('a moved wiki page is followed to its new title, and one that still redirects stops the sync in any month', () => {
  // Every structured page request is built here.
  const url = new URL(wikiParseUrl('Headhunting/Banners/2027'));
  assert.equal(url.searchParams.get('redirects'), '1');
  assert.equal(url.searchParams.get('page'), 'Headhunting/Banners/2027');
  // The shape of a parse answer once redirects=1 has followed a move to the new title.
  const rows = '{{Banners cell\n|name = Test banner\n}}';
  const followed = { parse: { title: 'Headhunting/Banners/2024', redirects: [{ from: 'Headhunting/Banners/Former-2024', to: 'Headhunting/Banners/2024' }], wikitext: { '*': rows } } };
  assert.equal(wikiText('Headhunting/Banners/Former-2024', followed, new Date('2027-06-01T00:00:00Z')), rows);
  // A redirect the request could not follow (a double redirect) is not an empty year, not even in January.
  for (const text of ['#REDIRECT [[Headhunting/Banners/2020]]', '  #redirect[[Headhunting/Banners/2027 (new)]]\n']) {
    for (const now of ['2027-01-15T12:00:00Z', '2027-06-01T00:00:00Z']) {
      assert.throws(() => wikiText('Headhunting/Banners/2027', { parse: { wikitext: { '*': text } } }, new Date(now)), /Headhunting\/Banners\/2027 is still a redirect/, `${now} ${text}`);
    }
  }
  // A page that only mentions a redirect further down is read as usual.
  const mentions = `${rows}\n<!-- #REDIRECT notes -->`;
  assert.equal(wikiText('Headhunting/Banners/2027', { parse: { wikitext: { '*': mentions } } }, new Date('2027-06-01T00:00:00Z')), mentions);
});

/* The release of 2026-09-25 quarantined this banner (banner:LINKAGE_65_0_1, kept-previous):
   the wiki's Headhunting-Banners-2026 row switched from 'Misumi Uika, Togawa Sakiko, Wakaba
   Mutsumi' to the Western order, and the operator records keep the Japanese one. The record
   and the row are the real ones; the operators' internal names are invented. */
test('a wiki lineup matches its operator records whatever order and separator it writes the names in',()=>{
  const ops=[{name:'Togawa Sakiko',internalName:'char_9201_sakiko',rarity:6},{name:'Misumi Uika',internalName:'char_9202_uika',rarity:5},{name:'Wakaba Mutsumi',internalName:'char_9203_mutsumi',rarity:5}];
  const record={name:'[The Dream Ball of Marionettes] Cantilena Puppae',category:'limited',year:2025,cn_date:'2025/09/04–2025/09/18',global_date:'2026/02/10–2026/02/24',
    cnPoolId:'LINKAGE_65_0_1',banner_image:'/headhunting-banner-images/Cantilena Puppae.webp',six_stars:['Togawa Sakiko'],five_stars:['Misumi Uika','Wakaba Mutsumi'],pull_type:'limited',linked_event:null};
  const row=(operators:string)=>({type:'crossover',name:'Cantilena Puppae',cnstart:'2025/09/04 16:00:00',cnend:'2025/09/18 03:59:59',globalstart:'2026/02/10 08:00:00',globalend:'2026/02/24 03:59:59',operators});
  const run=(operators:string)=>reconcileCalendars({announced:noNews,events:[],banners:[record],operators:ops,cn:tables(pool('LINKAGE_65_0_1','LINKAGE','2025/09/04','白日梦下的木偶舞会')),en:empty,eventRows:[],bannerRows:[row(operators)],now:september});
  for(const operators of ['Uika Misumi, Sakiko Togawa, Mutsumi Wakaba','Misumi Uika, Togawa Sakiko, Wakaba Mutsumi','Uika-Misumi, Sakiko·Togawa, Mutsumi  Wakaba']){
    const result=run(operators);
    assert.deepEqual(result.quarantine,[],operators);
    const [banner]=result.banners;
    assert.deepEqual([banner.six_stars,banner.five_stars,banner.lineupSource],[['Togawa Sakiko'],['Misumi Uika','Wakaba Mutsumi'],'wiki'],operators);
  }
  // A name still unknown in any order is reported as before, and the lineup kept.
  const typo=run('Uika Misumi, Sakiko Togawa, Mutsumi Wakabaa');
  assert.deepEqual(typo.quarantine.map((e:any)=>[e.key,e.action]),[['banner:LINKAGE_65_0_1','kept-previous']]);
  assert.match(typo.quarantine[0].reason,/names Mutsumi Wakabaa, which no operator record matches/);
});
test('an order-free name matches only when one record has those words',()=>{
  const find=lineupNameLookup([['Alpha Beta Gamma','first'],['Gamma Beta Alpha','second'],['Misumi Uika','uika'],['Old Name','uika']]);
  assert.equal(find('Uika Misumi'),'uika');
  assert.equal(find('Name Old'),'uika','an alias of the same record is not a second record');
  // The same name is always its own record, even where another record has its words.
  assert.equal(find('Gamma Beta Alpha'),'second');
  assert.equal(find('alpha-beta gamma'),'first');
  // A third order two records share names neither.
  assert.equal(find('Beta Alpha Gamma'),undefined);
  assert.equal(find('Uika'),undefined,'some of the words are not the name');
});


test('an existing translated outfit receives missing regional release dates without rewriting its art or flavour text', () => {
  const existing = { skinId:SURTR,name:'Prelude to Transcendence',model:'Surtr',series:'Ambience Synesthesia',code:'Official code',description:'Official flavour',release:'People, A People',image:'/existing.webp',sourceRegion:'Global' };
  const result = reconcileSkins({skins:[existing],operators:surtrOp,cn:surtrCn,en:surtrEn,events:surtrEvents});
  const skin = result.skins[0];
  assert.equal(skin.globalReleaseAt,1789570800);
  assert.equal(skin.cnReleaseAt,1775516400);
  assert.equal(skin.image,existing.image);
  assert.equal(skin.description,existing.description);
  assert.equal(reconcileSkins({skins:result.skins,operators:surtrOp,cn:surtrCn,en:surtrEn,events:surtrEvents}).changes.length,0);
});

test('catalogue removes a persisted event link contradicted by both regional calendars', () => {
  const event = { name: '[Side Story – Carnival] Ato', cn: { dateRange: '2025/08/02–2025/08/23' }, global: { dateRange: '2026/01/16–2026/02/06' } };
  const old = { name: 'Lungmen Spec Operators', category: 'standard', pull_type: 'featured', linked_event: event.name, cn_date: '2019/06/22–2019/08/05', global_date: '2020/03/11–2020/03/25', six_stars: [], five_stars: [] };
  const result = reconcileCalendars({ events: [event], banners: [old], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: noNews });
  assert.equal(result.banners[0].linked_event, null);
  assert.equal(old.linked_event, event.name, 'input remains intact');
});

test('catalogue wiki enrichment preserves a saved Global announcement beyond maintenance opening', () => {
  const operators = reconcileOperators({ operators: [], cn, en: empty }).operators;
  const pool = { ...structuredClone(cn).gacha.gachaPoolClient[0], gachaPoolName: rows.bannerRows[0].name };
  const globalStart = new Date((pool.openTime - 7 * 3600) * 1000).toISOString().slice(0, 10).replaceAll('-', '/');
  const run = (banners: object[]) => reconcileCalendars({ announced: noNews, events: [], banners, operators, cn,
    en: { ...empty, source: 'client-mirror', gacha: { gachaPoolClient: [pool] } }, eventRows: [],
    bannerRows: [{ ...rows.bannerRows[0], start: globalStart }] });
  const initial = run([{ name: rows.bannerRows[0].name, cn_date: '2026/09/04–2026/09/18', global_date: null, cnPoolId: pool.gachaPoolId }]);
  const banner = initial.banners[0];
  banner.globalScheduleStatus = 'announced';
  banner.global_window = { ...banner.global_window, startAt: new Date((pool.openTime + 3 * 3600) * 1000).toISOString(), timingSource: 'https://www.arknights.global/news/4814' };
  const expected = structuredClone(banner.global_window);
  const next = run(initial.banners);
  assert.deepEqual(next.banners[0].global_window, expected);
  assert.equal(next.banners[0].globalScheduleStatus, 'announced');
});

test('an existing activity with missing artwork gets a media plan even without a matching wiki calendar row', () => {
  const event = { name: '[Rerun] A Story Rerun', activityId: 'act1sre', poster: null, cn: { dateRange: '2026/01/01–2026/01/10' }, global: { dateRange: null } };
  const cnTables = { ...empty, activity: { basicInfo: { act1sre: { id: 'act1sre' } } } };
  const result = reconcileCalendars({ announced: noNews, events: [event], banners: [], operators: [], cn: cnTables, en: empty, eventRows: [], bannerRows: [] });
  assert.equal(result.events[0].poster, '/event-poster/A Story Rerun.webp');
  assert(result.media.some((entry: { path: string }) => entry.path === 'event-poster/A Story Rerun.webp'));
});
