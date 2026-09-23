import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getFeaturedOperatorRates } from '../../lib/gacha/eventBannerRates';
import { ALL_SERIES, seriesKey, skinSeriesOptions } from '../../lib/skins/skinSeriesConfig';
import bundledSkins from '../../data/skins.json';
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
import { reconcileOperators, reconcileSkins, reconcileCalendars, operatorReleaseDates, parseWikiRows, skinText, SKIN_SERIES } from '../sync/catalogue-model.mjs';
// @ts-expect-error Plain Node helper shared by the importers.
import { stripRichText } from '../lib/gametext.mjs';
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
  const calendar=reconcileCalendars({events:[],banners:[],operators:ops,cn,en:empty,eventRows:[],bannerRows:[row]});
  assert.deepEqual(calendar.banners[0].six_stars,['New limited']);assert.deepEqual(calendar.banners[0].rate_up_six_stars,['Returning limited']);
  assert.equal(calendar.banners[0].pull_type,'limited');
  assert.equal(getFeaturedOperatorRates(calendar.banners[0])[0].percent,35);
  const joint=reconcileCalendars({events:[],banners:[],operators:ops,cn,en:empty,eventRows:[],bannerRows:[{...row,type:'jo',limited:''}]});
  assert.equal(joint.banners[0].pull_type,'joint');
  assert.equal(getFeaturedOperatorRates(joint.banners[0])[0].percent,50);
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

test('series spellings are normalised on every record, and the reconciler refuses what it cannot fix', () => {
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
  assert.throws(() => reconcileSkins({ skins: [{ ...handTyped, skinId: 'char_0000_gone@x#1', series: '' }], operators, cn: tables, en: tables, events: [] }), /without a series/);
  // An English title over CN placeholder text is not Global yet; CN flavour text reaching a
  // Global record through the last fallback is caught instead of published.
  const placeholder = outfitTables(id, { ...display, dialog: '0011/韵系列新款/档案。' });
  assert.equal(reconcileSkins({ skins: [], operators, cn: tables, en: placeholder, events: [] }).skins[0].sourceRegion, 'CN');
  const flavour = outfitTables(id, { ...display, dialog: '', content: '', description: '她的档案。' });
  assert.throws(() => reconcileSkins({ skins: [], operators, cn: tables, en: flavour, events: [] }), /still carry CN text/);
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
