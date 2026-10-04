import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableBannerFreePulls, goalsAtBannerEnd, parsePullPlan, planBudgets, planHorizon, savingsAfterPlanAt, validPlanDate, type SavedPullPlan } from '../../lib/pulls/plan';
import type { UpcomingBanner } from '../../lib/pulls/pulls';
import type { Skin } from '../../lib/skins/skinTypes';
import { ALL_BANNERS, bundledBacklogSources } from '../../lib/pulls/sources';
import { publicFileExists } from '../../lib/assets/publicAssets';
import { openSkinCollections } from '../../lib/pulls/currentPlan';
const now = new Date('2026-09-01T12:00:00Z');
function banner(name: string, start = '2026-09-02', end = '2026-09-15', freeTicket = 0): UpcomingBanner {
  return { ...ALL_BANNERS[0], name, start, end, freeDaily: 0, freeTicket, freePulls: freeTicket };
}
const a = banner('First'); const b = banner('Second', '2026-09-16', '2026-09-29');
const saved: SavedPullPlan = { version: 1, orundum: '12345', originite: '60', permits: '10', reservedOP: '42', until: '2026-09-29', manualEventDate: '', bannerName: b.name, monthlyCard: true, includeBacklog: true, annihilationDone: false, doneEvents: ['event'], doneKeys: ['main_0'], clearedReruns: ['rerun'], future: { sidestory: 2 }, goals: [{ banner: a.name, spendOn: a.end, pulls: 80, ticketUsed: false }] };
test('every planner resource icon is published', () => {
  for (const path of [
    '/material-icons/Orundum.webp',
    '/material-icons/Originite Prime.webp',
    '/material-icons/Headhunting Permit.webp',
    '/material-icons/Distinction Certificate.webp',
  ]) assert.ok(publicFileExists(path), `Missing pull planner asset: ${path}`);
});
test('saved plans round trip all resource, content, and goal settings', () => {
  assert.deepEqual(parsePullPlan(JSON.stringify(saved)), saved);
});
test('imports reject wrong versions, invalid dates, duplicate goals, unsafe values and oversized input', () => {
  for (const value of [{...saved, version: 2}, {...saved, originite: '-2'}, {...saved, permits: 'Infinity'}, {...saved, goals: [...saved.goals, ...saved.goals]}, {...saved, until: '2026-02-30'}, {...saved, monthlyCard: 'yes'}, {...saved, goals: [{...saved.goals[0], pulls: 1.5}]}, {...saved, goals: [{...saved.goals[0], ticketUsed: 'yes'}]}, {...saved, future: JSON.parse('{"__proto__": 1}')}]) assert.throws(() => parsePullPlan(JSON.stringify(value)));
  assert.throws(() => parsePullPlan(' '.repeat(250001)));
  assert.throws(() => parsePullPlan('{invalid'), /valid JSON/);
  assert.equal(validPlanDate('2028-02-29'), true);
  assert.equal(validPlanDate('2026-02-29'), false);
});
test('spending dates set order and earlier budgets reduce later savings', () => {
  const rows = planBudgets([{banner: b.name, spendOn: b.end, pulls: 60}, {banner: a.name, spendOn: a.end, pulls: 80}], [a,b], now, () => 100);
  assert.equal(rows[0].goal.banner, a.name);
  assert.equal(rows[0].remaining, 20);
  assert.equal(rows[1].available, 20);
  assert.equal(rows[1].shortfall, 40);
  assert.equal(rows[1].remaining, -40);
});
test('negative balances are carried forward instead of inventing savings', () => {
  const rows = planBudgets([{banner: a.name, spendOn: a.end, pulls: 120}, {banner: b.name, spendOn: b.end, pulls: 50}], [a,b], now, () => 100);
  assert.equal(rows[1].available, -20);
  assert.equal(rows[1].shortfall, 70);
});
test('free tickets cover only their own banner; unused freebies never carry forward', () => {
  const free = banner('Free', a.start, a.end, 10);
  const rows = planBudgets([{banner: free.name, spendOn: free.end, pulls: 5}, {banner: b.name, spendOn: b.end, pulls: 100}], [free,b], now, () => 100);
  assert.equal(rows[0].paid, 0);
  assert.equal(rows[0].remaining, 100);
  assert.equal(rows[1].available, 100);
});
test('daily freebies unlock by spending date and exclude past unclaimed days', () => {
  const free = {...banner('Free', '2026-09-01', '2026-09-14', 10), freeDaily: 14};
  assert.equal(availableBannerFreePulls(free, new Date('2026-09-07T23:59:59Z'), new Date('2026-09-05T12:00:00Z')), 13);
  assert.equal(availableBannerFreePulls(free, new Date('2026-09-07T23:59:59Z'), new Date('2026-09-05T12:00:00Z'), true), 3);
  assert.equal(availableBannerFreePulls(free, new Date('2026-09-30'), new Date('2026-09-20')), 0);
});
test('cumulative funds retain fractions and income is not added again per banner', () => {
  const rows = planBudgets([{banner:a.name, spendOn:a.end, pulls:1},{banner:b.name, spendOn:b.end, pulls:1}], [a,b], now, date => date < new Date('2026-09-16') ? Math.floor(780/600) : Math.floor(1200/600));
  assert.equal(rows[0].remaining, 0);
  assert.equal(rows[1].available, 1);
  assert.equal(rows[1].remaining, 0);
});
test('past budgets are not charged to current holdings again; unknown future budgets stay reserved', () => {
  const rows=planBudgets([{banner:a.name, spendOn:'2026-08-30', pulls:500},{banner:'Missing', spendOn:'2026-09-15', pulls:50},{banner:b.name, spendOn:b.end, pulls:70}], [a,b], now, () =>100);
  assert.match(rows[0].issue!, /passed/);
  assert.equal(rows[0].paid,0);
  assert.match(rows[1].issue!, /missing/);
  assert.equal(rows[2].available,50);
});
test('changed banner windows are visible and never grant invalid free pulls', () => {
  const rows=planBudgets([{banner:a.name, spendOn:'2026-09-25', pulls:50}], [a], now, () =>100);
  assert.match(rows[0].issue!, /outside/);
  assert.equal(rows[0].free,0);
  assert.equal(rows[0].paid,50);
});

test('schedule corrections update reward snapshots without changing their rewards', async () => {
  const { resolvePullSchedule } = await import('../../lib/pulls/schedule');
  const old = {...a, name:'Rage of the Many', op:27};
  const [updated] = resolvePullSchedule([old], [{name:'Rage of The Many',global_date:'2026/09/16–2026/09/30'}]);
  assert.equal(updated.start, '2026-09-16');
  assert.equal(updated.end, '2026-09-30');
  assert.equal(updated.op, 27);
  assert.deepEqual(resolvePullSchedule([old], [{name:old.name,global_date:null}]), []);
  assert.deepEqual(resolvePullSchedule([old], [{name:old.name,global_date:'2026/02/30–2026/03/10'}]), []);
});

test('skin selections preserve older plans, deduplicate imports and reject malformed lists', () => {
  assert.equal(parsePullPlan(JSON.stringify(saved)).skinIds, undefined);
  assert.deepEqual(parsePullPlan(JSON.stringify({...saved, skinIds:['Surtr / Test', 'Surtr / Test']})).skinIds, ['Surtr / Test']);
  for (const skinIds of ['bad', [5], ['x'.repeat(201)], Array(2001).fill('a')]) assert.throws(() => parsePullPlan(JSON.stringify({...saved, skinIds})));
});

test('skin reserves use catalogue OP prices only, retain extra savings and flag missing prices', async () => {
  const { pullSkinCatalogue, skinReservation } = await import('../../lib/pulls/skins');
  const { default: skins } = await import('../../data/skins.json');
  const catalogue = pullSkinCatalogue(skins);
  assert.ok(catalogue.length > 300);
  assert.ok(catalogue.every(s => Number.isInteger(s.op) && s.op > 0));
  // Outfits with no Originite Prime price (rewards, certificates, free) are not offered.
  const unpriced = skins.filter(s => !/Originite Prime/.test(s.howToObtain ?? ''));
  assert.ok(unpriced.length > 0);
  for (const skin of unpriced) assert.ok(!catalogue.some(s => s.id === `${skin.model} / ${skin.name}`), skin.name);
  assert.equal(new Set(catalogue.map(s => s.id)).size, catalogue.length);
  const first = catalogue.find(s => s.op === 24)!;
  const second = catalogue.find(s => s.op === 15)!;
  const result = skinReservation([first.id, first.id, second.id, 'Missing / Outfit'], catalogue, 10);
  assert.equal(result.cost, 39);
  assert.equal(result.reserved, 49);
  assert.deepEqual(result.missing, ['Missing / Outfit']);
  assert.equal(skinReservation([], catalogue, 10).reserved, 10);
});


test('planner artwork preserves raw filenames with brackets, accents and URL punctuation', async () => {
  const { pullArtworkUrl } = await import('../../lib/pulls/artwork');
  assert.equal(pullArtworkUrl('/banners/[Limited-Time] Test.webp'), '/banners/%5BLimited-Time%5D%20Test.webp');
  const raw = '/skins/Liberté #1?.webp';
  const encoded = pullArtworkUrl(raw)!;
  assert.equal(decodeURIComponent(encoded), raw);
  assert.equal(new URL(encoded, 'https://arkpedia.test').hash, '');
  assert.equal(new URL(encoded, 'https://arkpedia.test').search, '');
  assert.equal(pullArtworkUrl(null), null);
});

test('forecast range deducts earlier paid budgets without charging the current banner twice', async () => {
  const { priorForecastSpending } = await import('../../lib/pulls/plan');
  const first = banner('Earlier', '2026-09-02', '2026-09-20', 10);
  const current = banner('Current', '2026-09-10', '2026-09-25');
  const rows = planBudgets([{banner:first.name, spendOn:first.end, pulls:116}, {banner:current.name, spendOn:current.end, pulls:80}], [first,current], now, () => 229);
  const spent = priorForecastSpending(rows, current.name, current.end);
  assert.equal(spent, 106); // 116 total minus 10 banner-only free pulls
  assert.deepEqual([203-spent, 229-spent], [97,123]);
  assert.equal(229-spent, rows[1].available);
  assert.equal(priorForecastSpending(rows, first.name, first.end), 0);
  assert.equal(priorForecastSpending(rows, '', '2026-09-15'), 0);
  assert.equal(priorForecastSpending(rows, '', '2026-09-20'), 106);
  assert.equal(priorForecastSpending(rows, '', '2026-09-25'), 186);
});

test('forecast deduction preserves shortfalls and does not re-spend expired goals', async () => {
  const { priorForecastSpending } = await import('../../lib/pulls/plan');
  const rows = planBudgets([{banner:a.name, spendOn:'2026-08-30', pulls:999}, {banner:'Missing', spendOn:a.end, pulls:300}, {banner:b.name, spendOn:b.end, pulls:20}], [a,b], now, () => 229);
  assert.equal(229-priorForecastSpending(rows, b.name, b.end), -71);
});

test('Wishing Wall scenarios use the supplied draw model, including the next-day bonus', async () => {
  const { wishingWallOrundum } = await import('../../lib/pulls/wishingWall');
  assert.equal(wishingWallOrundum(14, 'minimum'), 2800);
  assert.equal(wishingWallOrundum(14, 'average'), 8170);
  assert.equal(wishingWallOrundum(14, 'lucky'), 11200);
  assert.equal(wishingWallOrundum(0, 'average'), 0);
  assert.equal(wishingWallOrundum(1, 'average'), 578);
  // Independently enumerate all five strips for two days. The final strip is
  // ignored unless the first day's maximum unlocks the bonus draw.
  const values = [200,300,400,500,600,800]; let sum = 0;
  for (const a of values) for (const b of values) for (const c of values) for (const d of values) for (const e of values) {
    const first = Math.max(a,b);
    sum += first + (first < 400 ? Math.max(c,d,e) : Math.max(c,d));
  }
  assert.equal(wishingWallOrundum(2, 'average'), Math.round(sum / 6**5));
});

test('Wishing Wall scenarios preserve reward timing and other event rewards, resetting bonus odds per event', async () => {
  const { bannerHaul } = await import('../../lib/pulls/pulls');
  const wall = {...a, wishDays:14, wishOrundum:2800};
  const end = new Date(`${wall.end}T23:59:59Z`);
  const options = {cleared: new Set<string>()};
  const minimum = bannerHaul([wall], end, options);
  for (const [mode, expected] of [['minimum',2800],['average',8170],['lucky',11200]] as const) {
    const actual = bannerHaul([wall], end, {...options, wishingWallMode:mode});
    assert.equal(actual.wishOrundum, expected);
    assert.equal(actual.op, minimum.op); assert.equal(actual.permits, minimum.permits);
    assert.equal(bannerHaul([wall], new Date(wall.start), {...options, wishingWallMode:mode}).wishOrundum, 0);
    assert.equal(bannerHaul([{...wall, wishOrundum:0}], end, {...options, wishingWallMode:mode}).wishOrundum, 0);
  }
  assert.equal(bannerHaul([{...wall,wishDays:1,wishOrundum:200}, {...wall,name:'Other wall',wishDays:1,wishOrundum:200}], end, {...options,wishingWallMode:'average'}).wishOrundum, 1156);
});

test('Wishing Wall choice round trips and legacy saves retain the minimum default', () => {
  assert.equal(parsePullPlan(JSON.stringify(saved)).wishingWallMode, undefined);
  for (const wishingWallMode of ['minimum','average','lucky'] as const) assert.equal(parsePullPlan(JSON.stringify({...saved,wishingWallMode})).wishingWallMode, wishingWallMode);
  for (const wishingWallMode of ['maximum',null,800,[],{}]) assert.throws(() => parsePullPlan(JSON.stringify({...saved,wishingWallMode})), /Wishing Wall/);
});

test('only explicitly listed shop outfits are offered, never inferred Fashion Review or rerun stock', async () => {
  const { pullSkinCollections } = await import('../../lib/pulls/skinCollections');
  const { pullSkinCatalogue } = await import('../../lib/pulls/skins');
  const skin = (name: string) => ({ name, model: name, release:'Event', fashionReviewDate:'2020/01/01', howToObtain:'Outfit Store ( 18 Originite Prime )', image:null, series:'', seriesImage:null, code:null, illustrator:null, description:null });
  const skins = [skin('New'), skin('Return'), skin('Unlisted')];
  const event = (name: string, dateRange: string | null) => ({name,year:2026,poster:null,cn:{dateRange:'2026/01/10–2026/01/20',note:null},global:{dateRange,note:null},tw:{dateRange:null,note:null},hasFashionReview:true});
  const events = [event('Event','2026/09/10–2026/09/20'), event('Event Rerun','2026/10/10–2026/10/20'), event('Unknown',null)];
  const source = {event:'Event',source:'fixture',sourceRegion:'cn',eventStart:'2026-01-10',rotations:[
    {label:'Shop',start:'2026-01-08',end:'2026-01-25',dateBasis:'shop',new:['New / New'],returning:['Return / Return']},
  ]};
  const catalogue = pullSkinCatalogue(skins);
  const [collection] = openSkinCollections(pullSkinCollections(events, skins, catalogue, new Set(), [source], []), '2026-09-21');
  assert.deepEqual(collection.skinIds, ['New / New', 'Return / Return']);
  assert.deepEqual(collection.featuredIds, ['New / New']);
  assert.equal(collection.start, '2026-09-08'); // Opens before the event.
  assert.equal(collection.end, '2026-09-25'); // Remains after the event ends.
  assert.equal(collection.estimated, true); // CN list is not confirmed Global stock.
  assert.equal(openSkinCollections(pullSkinCollections(events,skins,catalogue,new Set(),[source], []),'2026-09-25').length,1);
  assert.deepEqual(openSkinCollections(pullSkinCollections(events,skins,catalogue,new Set(),[source], []),'2026-09-26'), []);
  assert.deepEqual(openSkinCollections(pullSkinCollections(events,skins,catalogue,new Set(),[], []),'2026-09-01'), []);
  assert.deepEqual(openSkinCollections(pullSkinCollections(events,skins,catalogue,new Set(),[{...source,event:'Unknown'}], []),'2026-09-01'), []);
  assert.throws(() => openSkinCollections(pullSkinCollections(events,skins,[],new Set(),[source], []), '2026-09-01'), /missing OP metadata/);
  const confirmed = {...source,sourceRegion:'global'};
  assert.equal(openSkinCollections(pullSkinCollections(events,skins,catalogue,new Set(),[confirmed], []),'2026-09-01')[0].estimated,false);
  assert.equal(openSkinCollections(pullSkinCollections(events,skins,catalogue,new Set(['Event']),[confirmed], []),'2026-09-01')[0].estimated,true);
});

test("a projected CN shop leaves out a new outfit Global already sold some other way", async () => {
  const { pullSkinCollections } = await import('../../lib/pulls/skinCollections');
  const { pullSkinCatalogue } = await import('../../lib/pulls/skins');
  const skin = (name: string, globalReleaseAt?: number) => ({ name, model: name, release:'Event', howToObtain:'Outfit Store ( 18 Originite Prime )', image:null, series:'', seriesImage:null, code:null, illustrator:null, description:null, ...(globalReleaseAt ? { globalReleaseAt } : {}) });
  // "Early" went on sale in a confirmed Global shop, "Released" came out on Global on
  // 2026-09-16, both before the projected shop opens on 2026-10-08; "Fresh" is new.
  const skins = [skin('Early'), skin('Released', Date.parse('2026-09-16T11:00:00Z') / 1000), skin('Fresh'), skin('Back')];
  const event = (name: string, dateRange: string) => ({name,year:2026,poster:null,cn:{dateRange:'2026/05/01–2026/05/15',note:null},global:{dateRange,note:null},tw:{dateRange:null,note:null}});
  const events = [event('Celebration', '2026/10/14–2026/10/28')];
  const source = {event:'Celebration',source:'fixture',sourceRegion:'cn',eventStart:'2026-05-01',rotations:[
    {label:'Early shop',start:'2026-04-25',end:'2026-05-23',dateBasis:'shop',new:['Early / Early','Released / Released','Fresh / Fresh'],returning:['Back / Back']},
  ]};
  const confirmed = [{ event:'Duel', kind:'shop', label:'New outfits', startAt:'2026-09-23T11:00:00Z', endAt:'2026-10-21T11:00:00Z', skinIds:['Early / Early'], newRelease:true }];
  const collections = pullSkinCollections(events, skins, pullSkinCatalogue(skins), new Set(), [source], confirmed);
  const projectedShop = collections.find((collection) => collection.name.startsWith('Celebration'))!;
  assert.equal(projectedShop.start, '2026-10-08');
  assert.deepEqual(projectedShop.skinIds, ['Fresh / Fresh', 'Back / Back']);
  assert.deepEqual(projectedShop.featuredIds, ['Fresh / Fresh']);
  // The confirmed Global shop keeps its own.
  assert.deepEqual(collections.find((collection) => collection.name.startsWith('Duel'))!.skinIds, ['Early / Early']);
});

/* A CN shop in the shape of People, A People's: new outfits for a month, returning
   outfits in two batches with a gap between them. Invented names, so the rules hold
   whatever the live manifest lists and whatever its outfits are called by then. */
function rotationFixture() {
  const skin = (id: string): Skin => { const [model, name] = id.split(' / '); return { name, model, release:'Event', howToObtain:'Outfit Store ( 18 Originite Prime )', image:null, series:'', seriesImage:null, code:null, illustrator:null, description:null }; };
  const ids = { new: ['A / New'], early: ['B / Early', 'C / Early'], later: ['D / Later', 'E / Later', 'A / New'] };
  const skins = [...new Set([...ids.new, ...ids.early, ...ids.later])].map(skin);
  const events = [{name:'[Side Story] Fixture',year:2026,poster:null,cn:{dateRange:'2026/04/07–2026/04/21',note:null},global:{dateRange:'2026/09/16–2026/09/30',note:null},tw:{dateRange:null,note:null}}];
  const source = {event:'[Side Story] Fixture',source:'https://ak.hypergryph.com/news/1',sourceRegion:'cn',eventStart:'2026-04-07',rotations:[
    {label:'New outfits',start:'2026-04-07',end:'2026-05-06',dateBasis:'shop',new:ids.new,returning:[]},
    {label:'Early returns',start:'2026-04-07',end:'2026-04-21',dateBasis:'shop',new:[],returning:ids.early},
    {label:'Later returns',start:'2026-04-24',end:'2026-05-22',dateBasis:'shop',new:[],returning:ids.later},
  ]};
  return { skins, events, source, ids };
}

test('a recorded rotation keeps each batch its own roster, deadline and saved identifier', async () => {
  const { pullSkinCatalogue } = await import('../../lib/pulls/skins');
  const { pullSkinCollections } = await import('../../lib/pulls/skinCollections');
  const { skins, events, source, ids } = rotationFixture();
  const catalogue = pullSkinCatalogue(skins);
  const collections = openSkinCollections(pullSkinCollections(events, skins, catalogue, new Set(), [source], []), '2026-09-09');
  // Each CN date moves by the Global opening's offset (2026-04-07 -> 2026-09-16).
  assert.deepEqual(collections.map(c => [c.start, c.end, c.skinIds]), [
    ['2026-09-16', '2026-10-15', ids.new], ['2026-09-16', '2026-09-30', ids.early], ['2026-10-03', '2026-10-31', ids.later],
  ]);
  assert.ok(collections.every(c => c.estimated && c.source === source.source && c.sourceRegion === 'cn'));
  assert.deepEqual(collections.map(c => c.featuredIds), [ids.new, [], []]);
  assert.deepEqual(collections.map(c => c.name), ['[Side Story] Fixture · New outfits', '[Side Story] Fixture · Returning outfits — batch 1', '[Side Story] Fixture · Returning outfits — batch 2']);
  // Saved plans store these ids, so they follow the label and the Global opening, never the display name.
  assert.deepEqual(collections.map(c => c.id), ['New outfits', 'Early returns', 'Later returns'].map(label => `[Side Story] Fixture / 2026-09-16 / ${label}`));
  const afterFirstShop = openSkinCollections(pullSkinCollections(events, skins, catalogue, new Set(), [source], []), '2026-10-01');
  assert.deepEqual(afterFirstShop.map(c => c.id.split(' / ').at(-1)), ['New outfits', 'Later returns']);
  assert.deepEqual(openSkinCollections(pullSkinCollections(events, skins, catalogue, new Set(), [source], []), '2026-11-01'), []);
});

test('every recorded rotation resolves to scheduled outfits the planner can price', async () => {
  const { getAllSkins } = await import('../../lib/skins/skins');
  const { getAllEvents } = await import('../../lib/schedule/schedule');
  const { pullSkinCatalogue } = await import('../../lib/pulls/skins');
  const { pullSkinCollections } = await import('../../lib/pulls/skinCollections');
  const { default: manifest } = await import('../../data/skin-shop-rotations.json');
  const skins=getAllSkins(), events=getAllEvents(), catalogue=pullSkinCatalogue(skins);
  for (const source of manifest.entries) {
    assert.ok(events.some(event=>event.name===source.event), `Schedule match: ${source.event}`);
    assert.match(source.source, /^https:\/\/(arknights\.wiki\.gg\/wiki\/|ak\.hypergryph\.com\/news\/)/);
    for (const rotation of source.rotations) {
      assert.ok(rotation.start <= rotation.end);
      const ids=[...rotation.new,...rotation.returning];
      assert.equal(new Set(ids).size,ids.length);
      for (const id of ids) assert.ok(catalogue.some(s=>s.id===id),id);
    }
  }
  // With nothing expired yet, every rotation of a Global-scheduled event is a shop of
  // its own: its roster, and its new outfits featured -- less an outfit Global already sold
  // before the shop opens (its globalReleaseAt), which is not new there. A rotation left with
  // nothing is no shop: Global sold Lemuen's and Necrass's Critical Phase Transition outfits
  // on 2026-09-23, ahead of the event, which turned this test red on the day's data.
  const shopsOf=(list: Skin[])=>openSkinCollections(pullSkinCollections(events,list,catalogue,new Set(),manifest.entries,[]),'2000-01-01');
  const expectShops=(list: Skin[])=>{
    const collections=shopsOf(list);
    const onGlobal=new Map(list.filter(s=>s.globalReleaseAt).map(s=>[`${s.model} / ${s.name}`, new Date(s.globalReleaseAt!*1000).toISOString().slice(0,10)]));
    const shift=(date: string, days: number)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
    for (const source of manifest.entries) {
      const event=events.find(event=>event.name===source.event)!;
      for (const window of (event.global.dateRange || '').split(';')) {
        const opening=window.split(/[–—]/)[0].trim().replaceAll('/', '-');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(opening)) continue;
        const offset=Math.round((Date.parse(`${opening}T00:00:00Z`)-Date.parse(`${source.eventStart}T00:00:00Z`))/86_400_000);
        for (const rotation of source.rotations) {
          const start=shift(rotation.start, offset);
          const fresh=rotation.new.filter(id=>!(onGlobal.has(id) && onGlobal.get(id)!<start));
          const ids=[...new Set([...fresh,...rotation.returning])];
          const collection=collections.find(c=>c.id===`${event.name} / ${opening} / ${rotation.label}`);
          if (!ids.length) { assert.equal(collection, undefined, `${source.event} / ${rotation.label}: nothing left to sell`); continue; }
          assert.ok(collection, `${source.event} / ${rotation.label}`);
          assert.deepEqual(collection.skinIds,ids);
          assert.deepEqual(collection.featuredIds,fresh);
          assert.equal(collection.estimated, source.sourceRegion!=='global' || rotation.dateBasis!=='shop');
        }
      }
    }
    return collections;
  };
  expectShops(skins);
  // The day's case, whatever the bundled records say: an outfit sold early drops out of the
  // shop's new outfits, and a rotation whose every new outfit was sold early is not listed.
  const early=Date.parse('2026-09-23T15:00:00Z')/1000;
  const soldEarly=new Set(['Lemuen / Requiem Vesperis', 'Necrass / As Clear As Crystal', 'Saria / Unstained Unshaken']);
  const after=expectShops(skins.map(s=>soldEarly.has(`${s.model} / ${s.name}`) ? { ...s, globalReleaseAt: early } : s));
  if (events.some(e=>e.name==='[Celebration] Critical Phase Transition' && /^\d{4}\/\d{2}\/\d{2}/.test(e.global.dateRange || ''))) {
    assert.ok(!after.some(c=>c.id.startsWith('[Celebration] Critical Phase Transition / ') && c.id.endsWith(' / Early shop')));
  }
});

test('planner shares verified Global shops with the skins page and never revives CN projections', async () => {
  const { getAllSkins } = await import('../../lib/skins/skins');
  const { getAllEvents } = await import('../../lib/schedule/schedule');
  const { pullSkinCatalogue } = await import('../../lib/pulls/skins');
  const { pullSkinCollections } = await import('../../lib/pulls/skinCollections');
  const { default: confirmed } = await import('../../data/skin-availability-windows.json');
  const skins = getAllSkins(), catalogue = pullSkinCatalogue(skins), events = getAllEvents();
  const today = '2026-09-22';
  const collections = openSkinCollections(pullSkinCollections(events, skins, catalogue), today);
  const lastDay = (endAt: string) => new Date(Date.parse(endAt) - 1).toISOString().slice(0, 10);
  const shops = confirmed.entries.filter(window => window.kind === 'shop' && window.skinIds.length);
  for (const window of shops.filter(window => lastDay(window.endAt) >= today)) {
    const collection = collections.find(collection => collection.name === `${window.event} · ${window.label}`)!;
    assert.ok(collection, window.event);
    assert.equal(collection.start, window.startAt.slice(0, 10));
    assert.equal(collection.end, lastDay(window.endAt));
    assert.equal(collection.estimated, false);
    assert.equal(collection.sourceRegion, 'global');
    assert.equal(collection.source, window.source);
    assert.deepEqual(collection.skinIds, window.skinIds);
    assert.deepEqual(collection.featuredIds, window.newRelease ? window.skinIds : []);
  }
  // Rewards and random draws are not OP shops: the verified collections are the shop windows, exactly.
  assert.equal(collections.filter(collection => collection.sourceRegion === 'global').length, shops.filter(window => lastDay(window.endAt) >= today).length);
  // A verified Global event keeps none of its CN projections, open or expired.
  const normalize = (name: string) => name.replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  for (const event of new Set(confirmed.entries.map(window => normalize(window.event)))) {
    assert.ok(collections.every(collection => collection.sourceRegion === 'global' || normalize(collection.name.split(' · ')[0]) !== event), event);
    const closed = confirmed.entries.filter(window => normalize(window.event) === event).map(window => window.endAt).sort().at(-1)!;
    const after = new Date(Date.parse(closed) + 86_400_000).toISOString().slice(0, 10);
    assert.ok(!openSkinCollections(pullSkinCollections(events, skins, catalogue), after).some(collection => normalize(collection.name.split(' · ')[0]) === event), `expired confirmation revived ${event}`);
  }
  // A verified window replaces only its own event's projections.
  const { skins: fixtureSkins, events: fixtureEvents, source } = rotationFixture();
  const other = { ...source, event: '[Side Story] Unconfirmed', rotations: source.rotations.slice(0, 1) };
  const both = [...fixtureEvents, { ...fixtureEvents[0], name: other.event }];
  const verified = { event: 'Fixture', kind: 'shop', label: 'New outfits', startAt: '2026-09-16T15:00:00Z', endAt: '2026-10-07T11:00:00Z', source: 'https://www.arknights.global/news/1', skinIds: ['A / New'], newRelease: true };
  const mixed = openSkinCollections(pullSkinCollections(both, fixtureSkins, pullSkinCatalogue(fixtureSkins), new Set(), [source, other], [verified]), '2026-09-01');
  assert.deepEqual(mixed.map(collection => `${collection.name} (${collection.sourceRegion})`).sort(), ['Fixture · New outfits (global)', '[Side Story] Unconfirmed · New outfits (cn)'].sort());
  const midnight = { ...verified, endAt: '2026-09-23T00:00:00Z' };
  assert.equal(openSkinCollections(pullSkinCollections([], fixtureSkins, pullSkinCatalogue(fixtureSkins), new Set(), [], [midnight]), '2026-09-22')[0].end, '2026-09-22');
  assert.deepEqual(openSkinCollections(pullSkinCollections([], fixtureSkins, pullSkinCatalogue(fixtureSkins), new Set(), [], [midnight]), '2026-09-23'), []);
});

test('skin OP deadlines accumulate earlier purchases and reserve unknown-date skins once', async () => {
  const { skinPurchasePlan } = await import('../../lib/pulls/skins');
  const skin = (id: string, op: number) => ({id,op,name:id,operator:id,image:null});
  const collection = (id: string, end: string, skinIds: string[]) => ({id,name:id,start:'2026-09-01',end,skinIds,featuredIds:skinIds,estimated:false});
  const a = skin('A', 18), b = skin('B', 24), unknown = skin('Unknown', 15);
  const plan = skinPurchasePlan([a,b,unknown], [collection('Late','2026-10-01',['A','B']), collection('Early','2026-09-15',['A'])], 5);
  assert.deepEqual(plan.windows.map(row => [row.collection.id,row.cost,row.reserved]), [['Early',18,38],['Late',24,62]]);
  assert.deepEqual(plan.unscheduled, [unknown]);
});

test('skin cards sort by debut newest first, without promoting Fashion Review returns', async () => {
  const { skinReleaseDates } = await import('../../lib/pulls/skinCollections');
  const { pullSkinCatalogue } = await import('../../lib/pulls/skins');
  const skin = (name: string, release: string) => ({name,release,model:name,howToObtain:'Outfit Store ( 18 Originite Prime )',image:null,series:'',seriesImage:null,code:null,illustrator:null,description:null,fashionReviewDate:'2030/01/01'});
  const skins = [skin('Old','Event'),skin('New','Event Rerun'),skin('Unknown','Unknown'),skin('CN','CN Event')];
  const event = (name: string, dateRange: string | null, cnDate: string | null = null) => ({name,year:2026,poster:null,cn:{dateRange:cnDate,note:null},global:{dateRange,note:null},tw:{dateRange:null,note:null}});
  const events = [event('Event','2024/01/01–2024/01/14'),event('Event Rerun','2025/01/01–2025/01/14'),event('CN Event',null,'2026/01/01–2026/01/14')];
  const catalogue=pullSkinCatalogue(skins,skinReleaseDates(events,skins));
  assert.deepEqual(catalogue.map(skin=>[skin.name,skin.releaseDate]),[['CN','2026-01-01'],['New','2025-01-01'],['Old','2024-01-01'],['Unknown','']]);
});

test('estimated banners follow the event opening while preserving their own offsets and durations', async () => {
  const { resolveBannerEventWindow } = await import('../../lib/gacha/bannerSchedule');
  const event={name:'Event',cn:{dateRange:'2026/05/01–2026/05/08'},global:{dateRange:'2026/10/14–2026/10/21'}};
  const banner={global_date:'2026/10/04–2026/10/18',cn_date:'2026/05/01–2026/05/15',global_date_estimated:true,schedule_anchor:'Event'};
  assert.equal(resolveBannerEventWindow(banner,[event]).global_date,'2026/10/14–2026/10/28');
  assert.equal(resolveBannerEventWindow({...banner,cn_date:'2026/05/15–2026/05/29'},[event]).global_date,'2026/10/28–2026/11/11');
  assert.equal(resolveBannerEventWindow(banner,[{...event,global:{dateRange:'2026/10/20–2026/10/27'}}]).global_date,'2026/10/20–2026/11/03');
  assert.equal(resolveBannerEventWindow({...banner,global_date_estimated:false},[event]).global_date,banner.global_date);
  assert.equal(resolveBannerEventWindow({...banner,schedule_anchor:undefined},[event]).global_date,banner.global_date);
  assert.equal(resolveBannerEventWindow(banner,[]).global_date,null);
  assert.equal(resolveBannerEventWindow(banner,[{...event,global:{dateRange:null}}]).global_date,null);
  assert.equal(resolveBannerEventWindow({...banner,cn_date:'2026/02/30–2026/03/14'},[event]).global_date,null);
});

test('planner banner windows are the shared banner records, and unconfirmed ones are marked estimated', async () => {
  const { getPullSchedule } = await import('../../lib/pulls/schedule');
  const { resolvePullBannerWindows } = await import('../../lib/pulls/bannerWindows');
  const { getAllHeadhuntingBanners } = await import('../../lib/gacha/headhuntingBannerData');
  const banners=getAllHeadhuntingBanners(), planned=getPullSchedule();
  let confirmed=0;
  for (const plan of planned) {
    const shared=banners.find(b=>b.name===plan.name);
    if (!shared) continue;
    // A confirmed window may still be flagged while its event is only predicted; an
    // unconfirmed one is always flagged.
    if (!shared.global_window?.timingSource) assert.equal(plan.datesEstimated, true, plan.name);
    // A confirmed window is used as it is; an estimate follows the shared calendar.
    const expected=shared.global_window?.timingSource ? (confirmed++, shared.global_date) : resolvePullBannerWindows([shared])[0].global_date;
    if (expected) assert.equal(`${plan.start}–${plan.end}`.replace(/-/g,'/'), expected, plan.name);
  }
  assert.ok(confirmed > 0, 'the schedule holds banners with a confirmed Global window');
});

test('client sync confirms an estimated banner even when its dates were already correct', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const root=mkdtempSync(join(tmpdir(),'arkpedia-banner-sync-'));
  try {
    for (const dir of ['data/events','en/gamedata/excel','cn/gamedata/excel']) mkdirSync(join(root,dir),{recursive:true});
    const start=new Date();start.setUTCDate(start.getUTCDate()+7);start.setUTCHours(12,0,0,0);
    const end=new Date(start.getTime()+14*86400000);
    const ymd=(d:Date)=>d.toISOString().slice(0,10).replace(/-/g,'/');
    const range=`${ymd(start)}–${ymd(end)}`;
    writeFileSync(join(root,'data/events/events_2026.json'),'[]');
    // The dev integration also reconciles operator releases after calendar sync.
    writeFileSync(join(root,'data/operator-release-links.json'),'[]');
    writeFileSync(join(root,'data/operator-independent-releases.json'),'{}');
    writeFileSync(join(root,'data/headhunting_banners.json'),JSON.stringify([
      {name:'Confirmed',global_date:range,cn_date:null,schedule_anchor:'Event'},
      {name:'Unannounced',global_date:range,cn_date:null,schedule_anchor:'Event'},
    ]));
    for (const region of ['en','cn']) {
      writeFileSync(join(root,region,'gamedata/excel/activity_table.json'),'{"basicInfo":{}}');
      writeFileSync(join(root,region,'gamedata/excel/gacha_table.json'),JSON.stringify({gachaPoolClient:region==='en'?[{gachaPoolName:'Confirmed',openTime:start.getTime()/1000,endTime:end.getTime()/1000}]:[]}));
    }
    execFileSync(process.execPath,[resolve('scripts/sync/sync-event-windows.mjs')],{cwd:root,env:{...process.env,ARKPEDIA_EN:'en',ARKPEDIA_CN:'cn'},stdio:'pipe'});
    const [confirmed,unannounced]=JSON.parse(readFileSync(join(root,'data/headhunting_banners.json'),'utf8'));
    assert.equal(confirmed.global_date,range);
    assert.match(confirmed.global_window.timingSource, /gacha_table\.json$/);
    assert.equal(unannounced.global_window, undefined);
  } finally { rmSync(root,{recursive:true,force:true}); }
});


test('saved custom spending dates follow banner deadlines without changing goals', () => {
  const goals = [{ banner: 'First', spendOn: '2026-09-03', pulls: 80, targets: [{name: 'A', copies: 2}] }, { banner: 'Missing', spendOn: '2026-10-01', pulls: 50 }];
  const normalized = goalsAtBannerEnd(goals, [a]);
  assert.equal(normalized[0].spendOn, a.end);
  assert.equal(goals[0].spendOn, '2026-09-03');
  assert.deepEqual(normalized[0].targets, goals[0].targets);
  assert.equal(normalized[0].pulls, 80);
  assert.deepEqual(normalized[1], goals[1]);
  const moved = {...a, end: '2026-09-20'};
  assert.equal(goalsAtBannerEnd(normalized, [moved])[0].spendOn, moved.end);
  const row = planBudgets(normalized.slice(0,1), [a], now, date => date.getUTCDate())[0];
  assert.equal(row.available, 15);
  const localized = {...a, name: 'Official Global title', aliases: [a.name]};
  const migrated = goalsAtBannerEnd(goals, [localized]);
  assert.equal(migrated[0].banner, localized.name);
  assert.deepEqual(migrated[0].targets, goals[0].targets);
  assert.equal(planBudgets(goals.slice(0,1), [localized], now, date => date.getUTCDate())[0].banner?.name, localized.name);
});

test('event rewards include bannerless reruns and custom exchanges by the event end', async () => {
  const {resolvePullEventSchedule} = await import('../../lib/pulls/schedule');
  const {bannerHaul} = await import('../../lib/pulls/pulls');
  const {default: rewardSources} = await import('../../data/pull-event-rewards.json');
  // Rows chosen by what they are, given windows of their own: the live calendar and
  // the names in it change with every refresh.
  const rerunReward = rewardSources.find(r => /rerun/i.test(r.event) && r.op > 0 && !ALL_BANNERS.some(b => b.event === r.event));
  const exchange = rewardSources.find(r => r.shopPermits > 0 && r !== rerunReward && !/rerun/i.test(r.event));
  assert.ok(rerunReward, 'a rerun with no banner of its own pays Originite');
  assert.ok(exchange, 'an event sells permits');
  const calendar = [
    {name: rerunReward.event, global: {dateRange: '2030/01/01–2030/01/10'}},
    {name: exchange.event, global: {dateRange: '2030/01/05–2030/01/19'}},
  ] as unknown as Parameters<typeof resolvePullEventSchedule>[0];
  const events = resolvePullEventSchedule(calendar, bundledBacklogSources());
  const rerun = events.find(e => e.name === rerunReward.event)!;
  const custom = events.find(e => e.name === exchange.event)!;
  assert.ok(rerun);
  assert.ok(custom);
  const byDate = [rerun.end, custom.end].sort().at(-1)!;
  const by = new Date(`${byDate}T23:59:59Z`);
  const haul = bannerHaul(events, by, {cleared:new Set()});
  const ended = events.filter(e => new Date(`${e.end}T23:59:59Z`) <= by);
  const countable = ended.filter(e => !e.inBacklog);
  assert.equal(haul.op, countable.reduce((sum, event) => sum + event.op, 0));
  assert.equal(haul.permits, ended.reduce((sum, event) => sum + (event.shopPermits ?? 0), 0));
  assert.equal(haul.wishOrundum, ended.reduce((sum, event) => sum + event.wishOrundum, 0));
  assert.deepEqual(haul.counted.map(event => event.name), countable.map(event => event.name));
  assert.ok(haul.shops.some(event => event.name === custom.name));
  assert.equal(custom.shopPermits, exchange.shopPermits);
  const cleared = bannerHaul(events, by, {cleared:new Set([rerun.name])});
  assert.equal(cleared.op, haul.op - (rerun.inBacklog ? 0 : rerun.op));
  assert.equal(cleared.permits, haul.permits);
  const rerunEnd = new Date(`${rerun.end}T23:59:59Z`);
  assert.equal(bannerHaul([rerun], new Date(rerunEnd.getTime() - 1), {cleared:new Set()}).op, 0);
  assert.equal(bannerHaul([rerun], rerunEnd, {cleared:new Set()}).op, rerun.inBacklog ? 0 : rerun.op);
});

test('event date corrections are independent of banners and invalid windows are omitted', async () => {
  const {resolvePullEventSchedule} = await import('../../lib/pulls/schedule');
  const {default: rewardSources} = await import('../../data/pull-event-rewards.json');
  const reward = rewardSources.find(r => r.op > 0)!;
  assert.ok(reward, 'an event pays Originite');
  const move = (dateRange: string) => resolvePullEventSchedule([{name: reward.event, global: {dateRange}}] as unknown as Parameters<typeof resolvePullEventSchedule>[0], bundledBacklogSources());
  assert.equal(move('2026/12/16–2026/12/23')[0].end, '2026-12-23');
  assert.equal(move('2026/12/01–2026/12/08')[0].end, '2026-12-08');
  assert.equal(move('2026/12/08–2026/12/01').length, 0);
  assert.equal(move('2026/02/30–2026/03/08').length, 0);
});

test('archived OP never suppresses scheduled shops or invents expired shop stock', async () => {
  const {bannerHaul, remainingBacklog, eventWasCleared} = await import('../../lib/pulls/pulls');
  const event = {...a, event:'Event', name:'Event rerun', rerun:true, inBacklog:true, op:28, shopPermits:3, legacyNames:['Old banner']};
  const haul = bannerHaul([event], new Date('2026-12-31'), {cleared:new Set()});
  assert.equal(haul.op, 0); assert.equal(haul.permits, 3); assert.equal(haul.skipped.length, 1);
  assert.equal(remainingBacklog(bundledBacklogSources(), new Set(), new Set(), false).permits, 0);
  assert.equal(eventWasCleared(event, new Set(['Old banner'])), true);
  assert.equal(bannerHaul([{...event,inBacklog:false}], new Date('2026-12-31'), {cleared:new Set(['Old banner'])}).op, 0);
});

test('workspace settings preserve old saves and round trip new income choices and first clears', () => {
  const plan = { ...saved, yellowCerts:'516', incomeSettings:{daily:false,weekly:true,annihilation:false,certificates:true}, doneKeys:[...saved.doneKeys,'resource:wk_melee_1','annihilation:camp_r_01'], skinIds:['existing skin id'], reservedOP:'18' };
  assert.deepEqual(parsePullPlan(JSON.stringify(plan)), plan);
  assert.equal(parsePullPlan(JSON.stringify(saved)).incomeSettings, undefined);
  assert.equal(parsePullPlan(JSON.stringify(saved)).yellowCerts, undefined);
  assert.throws(() => parsePullPlan(JSON.stringify({...saved,yellowCerts:'-258'})));
  assert.throws(() => parsePullPlan(JSON.stringify({...saved,incomeSettings:{daily:'yes'}})));
});

test('income switches preserve reset counts for monthly cards without paying disabled missions', async () => {
  const {selectedIncome} = await import('../../lib/pulls/incomeSettings');
  const input = {days:30,weeks:4,months:1,daily:3000,weekly:2000,annihilation:7200,orundum:12200};
  assert.deepEqual(selectedIncome(input,{daily:false,weekly:true,annihilation:false,certificates:false}),{...input,daily:0,annihilation:0,orundum:2000});
  assert.equal(input.orundum,12200);
});

test('certificate exchanges respect owned funds, full sets and Global monthly shop resets', async () => {
  const {certificatePulls} = await import('../../lib/pulls/incomeSettings');
  const from = new Date('2026-09-15T12:00:00Z');
  assert.equal(certificatePulls(from,new Date('2026-09-30T23:59:59Z'),516,true),38);
  assert.equal(certificatePulls(from,new Date('2026-10-01T06:59:59Z'),516,true),38);
  assert.equal(certificatePulls(from,new Date('2026-10-01T07:00:00Z'),516,true),76);
  assert.equal(certificatePulls(from,new Date('2026-12-01T07:00:00Z'),258,true),38);
  assert.equal(certificatePulls(from,new Date('2026-12-01'),257,true),0);
  assert.equal(certificatePulls(from,new Date('2026-12-01'),516,false),0);
  assert.equal(certificatePulls(from,new Date('2026-08-01'),516,true),0);
});

test('individual first clears reconcile with old aggregate rewards and never double deduct', async () => {
  const {remainingBacklog} = await import('../../lib/pulls/pulls');
  const {ONE_TIME} = await import('../../lib/pulls/sources');
  const {default:firstClears} = await import('../../data/pull-first-clears.json');
  const sources = bundledBacklogSources();
  const base = remainingBacklog(sources,new Set(),new Set(),false);
  const resource = firstClears.resources[0], map = firstClears.annihilation[0];
  const partial = remainingBacklog(sources,new Set(),new Set([resource.id,map.id]),false);
  assert.equal(partial.originitePrime,base.originitePrime-resource.amount);
  assert.equal(partial.annihilationOrundum,base.annihilationOrundum-map.amount);
  const allIndividual = remainingBacklog(sources,new Set(),new Set([...firstClears.resources,...firstClears.annihilation].map(s=>s.id)),false);
  const allLegacy = remainingBacklog(sources,new Set(),new Set(['daily']),true);
  assert.deepEqual(allIndividual,allLegacy);
  assert.deepEqual(remainingBacklog(sources,new Set(),new Set(['daily',resource.id,map.id]),true),allLegacy);
  assert.equal(firstClears.resources.reduce((sum,s)=>sum+s.amount,0),ONE_TIME.originiteByStageType.daily);
});


test('green certificates count future Global monthly refreshes and preserve currency units', async () => {
  const {greenCertificateIncome} = await import('../../lib/pulls/incomeSettings');
  const from = new Date('2026-09-15T12:00:00Z');
  assert.deepEqual(greenCertificateIncome(from, new Date('2026-10-01T06:59:59Z'), true), {months:0,orundum:0,permits:0});
  assert.deepEqual(greenCertificateIncome(from, new Date('2026-10-01T07:00:00Z'), true), {months:1,orundum:600,permits:4});
  assert.deepEqual(greenCertificateIncome(from, new Date('2027-01-31T12:00:00Z'), true), {months:4,orundum:2400,permits:16});
  assert.deepEqual(greenCertificateIncome(from, from, true), {months:0,orundum:0,permits:0});
  assert.deepEqual(greenCertificateIncome(from, new Date('2027-01-31'), false), {months:0,orundum:0,permits:0});
  assert.deepEqual(greenCertificateIncome(from, new Date('2026-08-01'), true), {months:0,orundum:0,permits:0});
});

test('green certificate setting round trips without changing old plans', () => {
  const settings = {daily:true,weekly:true,annihilation:true,certificates:false,greenCertificates:true};
  assert.deepEqual(parsePullPlan(JSON.stringify({...saved,incomeSettings:settings})).incomeSettings, settings);
  assert.throws(() => parsePullPlan(JSON.stringify({...saved,incomeSettings:{...settings,greenCertificates:'yes'}})));
});

test('empty plans keep forecast savings, not only holdings today', () => {
  assert.equal(savingsAfterPlanAt(336, [], '2027-01-31'), 336);
});
test('forecast savings deduct paid pulls only through the selected date', () => {
  const limited = banner('Limited', '2026-09-02', '2026-09-15', 24);
  const rows = planBudgets([
    {banner: limited.name, spendOn: limited.end, pulls: 60},
    {banner: b.name, spendOn: b.end, pulls: 80},
  ], [limited,b], now, () => 200);
  assert.equal(savingsAfterPlanAt(200, rows, '2026-09-10'), 200);
  assert.equal(savingsAfterPlanAt(200, rows, limited.end), 164);
  assert.equal(savingsAfterPlanAt(336, rows, '2027-01-31'), 220);
  assert.equal(savingsAfterPlanAt(10, rows, '2027-01-31'), -106);
});


test('current catalogue discovers banners and replaces stale lineups and artwork', async () => {
  const { resolvePullSchedule } = await import('../../lib/pulls/schedule');
  const [fresh] = resolvePullSchedule([], [{name:'New pool',global_date:'2027/02/19–2027/03/05',six_stars:['Makoto Yuki'],cnPoolId:'LINKAGE_77_0_1'}]);
  assert.equal(fresh.poolId, 'LINKAGE_77_0_1');
  assert.deepEqual(fresh.sixStars, ['Makoto Yuki']);
  assert.equal(fresh.freePulls, 0); // no invented rewards without a source
  assert.equal(fresh.datesEstimated, true);
  const [updated] = resolvePullSchedule([{...a, name:'Old name',freePulls:24}], [{name:'New name',aliases:['Old name'],global_date:'2027/02/19–2027/03/05',global_window:{timingSource:'client'},six_stars:['New featured'],rate_up_six_stars:['Returning'],banner_image:'/new.webp'}]);
  assert.equal(updated.freePulls, 24);
  assert.equal(updated.image, '/new.webp');
  assert.deepEqual(updated.sixStars, ['New featured']);
  assert.deepEqual(updated.alsoRatedUp, ['Returning']);
  assert.equal(updated.datesEstimated, false);
});

test('banner forecasts reuse calendar event windows without extending banners to event endings', async () => {
  const { resolvePullBannerWindows } = await import('../../lib/pulls/bannerWindows');
  // A crossover whose Global dates are not announced: the calendar predicts the event.
  const banner: { name: string; linked_event: string; global_date: string | null; cn_date: string; global_date_estimated?: boolean; global_window?: { timingSource: string } } = { name:'Crossover banner', linked_event:'Crossover event', global_date:null, cn_date:'2026/05/01–2026/05/15' };
  type Events = NonNullable<Parameters<typeof resolvePullBannerWindows>[1]>;
  type Calendar = NonNullable<Parameters<typeof resolvePullBannerWindows>[2]>;
  const events = [{ name:'Crossover event', cn:{dateRange:'2026/05/01–2026/05/15'}, global:{dateRange:null} }] as unknown as Events;
  const calendar = [{ name:'Crossover event', dateRange:'2027/02/19–2027/03/05', isPredicted:true }] as unknown as Calendar;
  const [forecast] = resolvePullBannerWindows([banner], events, calendar);
  assert.equal(forecast.global_date, '2027/02/19–2027/03/05');
  assert.equal(forecast.global_date_estimated, true);
  const movedCalendar = calendar.map(e => ({...e, dateRange:'2027/03/01–2027/03/30'}));
  const [moved] = resolvePullBannerWindows([banner], events, movedCalendar);
  assert.equal(moved.global_date, '2027/03/01–2027/03/15');
  const confirmed = {...banner,global_date:'2027/04/01–2027/04/15',global_window:{timingSource:'client'}};
  assert.equal(resolvePullBannerWindows([confirmed],events,movedCalendar)[0].global_date, confirmed.global_date);
  assert.equal(resolvePullBannerWindows([banner],[],[])[0].global_date, null);
});

test('versioned catalogue artwork retains its query after filename escaping', async () => {
  const { pullArtworkUrl } = await import('../../lib/pulls/artwork');
  assert.equal(pullArtworkUrl('/banners/Pool [175].webp?v=abc123'), '/banners/Pool%20%5B175%5D.webp?v=abc123');
});

// The banner plan's footer reports through its last banner, whatever the Pull calculation's date.
test('the plan reaches its last spending date, never before today, and nowhere without goals', () => {
  const goals = [{ banner: 'A', spendOn: '2026-11-04', pulls: 60 }, { banner: 'B', spendOn: '2026-12-15', pulls: 80 }, { banner: 'C', spendOn: '2026-10-20', pulls: 10 }];
  assert.equal(planHorizon(goals, '2026-10-03'), '2026-12-15');
  assert.equal(planHorizon([{ banner: 'A', spendOn: '2026-09-01', pulls: 1 }], '2026-10-03'), '2026-10-03', 'a plan whose dates have passed is judged as of today');
  assert.equal(planHorizon([], '2026-10-03'), null);
  // Through its horizon, every goal's budget is paid.
  assert.equal(savingsAfterPlanAt(200, [{ goal: goals[0], paid: 60 }, { goal: goals[1], paid: 80 }, { goal: goals[2], paid: 10 }] as never, planHorizon(goals, '2026-10-03')!), 50);
});

// The Skin wishlist's Include is saved with the plan; a plan from before it has none, which the
// page reads as on (the wishlist was always held back).
test('the skin wishlist setting survives a save and is absent from older plans', () => {
  assert.equal(parsePullPlan(JSON.stringify(saved))!.includeSkins, undefined);
  assert.equal(parsePullPlan(JSON.stringify({ ...saved, includeSkins: false }))!.includeSkins, false);
  assert.equal(parsePullPlan(JSON.stringify({ ...saved, includeSkins: true }))!.includeSkins, true);
  assert.throws(() => parsePullPlan(JSON.stringify({ ...saved, includeSkins: 'no' })));
});
