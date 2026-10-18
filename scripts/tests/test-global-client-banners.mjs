import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { globalBannerNotices, reconcileGlobalClientBanners } from '../sync/global-client-banners.mjs';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/global-client-banners.json', import.meta.url)));
const now = Date.parse('2026-10-15T00:00:00Z');
const predecessor = { name: 'Orienteering #6', pull_type: 'orienteering', globalPoolId: 'SPECIAL_EN_40_0_6', six_stars: ['Historical Global'] };
const forecast = { name: 'Orienteering #7', pull_type: 'orienteering', cnPoolId: 'SPECIAL_73_0_3', cn_date: '2026/05/15–2026/05/29',
  global_date: '2026/10/18–2026/11/01', six_stars: ['CN choice'], five_stars: ['CN five'], banner_image: '/cn.webp' };
const run = (banners, table = fixture, extra = {}) => reconcileGlobalClientBanners({ banners, gachaTable: table, operators: [], clientSource: fixture.source, now, ...extra });
// Explicitly synthetic future pool: the pinned source above does NOT ship #7.
const future = { ...structuredClone(fixture.gachaPoolClient.find(p => p.gachaPoolId === predecessor.globalPoolId)),
  gachaPoolId: 'SPECIAL_EN_FIXTURE_7', openTime: Date.parse('2026-10-30T15:00:00Z') / 1000, endTime: Date.parse('2026-11-13T10:59:59Z') / 1000,
  dynMeta: { rarityPickCharDict: { TIER_6: ['s1', 's2', 's3'], TIER_5: ['f1', 'f2', 'f3'] } } };
const table = { gachaPoolClient: [...fixture.gachaPoolClient, future] };
const operators = [6, 5].flatMap(rarity => [1, 2, 3].map(n => ({ internalName: `${rarity === 6 ? 's' : 'f'}${n}`, name: `EN ${rarity} ${n}`, rarity })));

test('the pinned October 14 extraction has six Global editions and no #7; forecasts stay provisional and CN records intact', () => {
  assert.equal(fixture.gachaPoolClient.filter(p => p.gachaRuleType === 'SPECIAL').length, 6);
  const banners = structuredClone([predecessor, forecast]);
  run(banners);
  assert.deepEqual(banners[0], predecessor);
  assert.equal(banners[1].global_date, forecast.global_date);
  assert.equal(banners[1].global_date_estimated, true);
  assert.equal(banners[1].globalLineupPending, true);
  assert.equal(banners[1].globalPoolId, undefined);
  assert.deepEqual(banners[1].six_stars, forecast.six_stars);
  assert.equal(run(banners).changed, false);
});

test('a future EN pool replaces a drifted forecast by edition, with EN candidates and exact exclusive instants', () => {
  const banners = structuredClone([predecessor, forecast]);
  run(banners, table, { operators });
  const b = banners[1];
  assert.equal(b.globalPoolId, future.gachaPoolId);
  assert.equal(b.cnPoolId, forecast.cnPoolId);
  assert.equal(b.global_date, '2026/10/30–2026/11/13');
  assert.equal(b.global_window.startAt, '2026-10-30T15:00:00.000Z');
  assert.equal(b.global_window.endAt, '2026-11-13T11:00:00.000Z');
  assert.equal(b.globalScheduleStatus, 'datamined');
  assert.equal(b.global_date_estimated, false);
  assert.equal(b.globalLineupPending, undefined);
  assert.deepEqual(b.six_stars, ['EN 6 1', 'EN 6 2', 'EN 6 3']);
  assert.equal(b.lineupSource, 'client');
  assert.deepEqual(banners[0], predecessor);
  assert.equal(run(banners, table, { operators, clientSource: fixture.source.replace('3aaa25b', 'another') }).changed, false, 'new source revisions alone do not churn data');
});

test('new editions are added once; missing EN candidates never expose CN choices and recover on the next run', () => {
  const fresh = [structuredClone(predecessor)];
  assert.deepEqual(run(fresh, table, { operators }).additions, ['Orienteering #7']);
  assert.equal(run(fresh, table, { operators }).changed, false);
  const banners = structuredClone([predecessor, forecast]);
  const first = run(banners, table);
  assert.equal(banners[1].lineupSource, 'pending');
  assert.deepEqual(banners[1].six_stars, []);
  assert.equal(banners[1].banner_image, null);
  const second = run(banners, table);
  assert.equal(second.changed, false);
  assert.deepEqual(second.quarantine, first.quarantine);
  run(banners, table, { operators });
  assert.equal(banners[1].lineupSource, 'client');
});

test('foreign regions, conflicting edition IDs, and ambiguous predecessors cannot claim a Global forecast', () => {
  for (const records of [[forecast], [predecessor, { ...forecast, globalPoolId: 'OTHER_EN_POOL' }], [predecessor, predecessor, forecast]]) {
    const banners = structuredClone(records);
    assert.equal(run(banners, table, { operators }).quarantine.length, 1);
    assert.ok(!banners.some(b => b.globalPoolId === future.gachaPoolId));
  }
  const banners = structuredClone([predecessor, forecast]);
  run(banners, { gachaPoolClient: [fixture.gachaPoolClient.find(p => p.gachaPoolId === predecessor.globalPoolId), { ...future, gachaPoolId: 'SPECIAL_JP_FIXTURE_7' }] }, { operators });
  assert.equal(banners[1].globalPoolId, undefined);
});

test('current named Limited timing is reconciled without changing its mechanic or lineup, and changes to instants are applied', () => {
  const banner = { name: '[Celebration] Sealed With Time', pull_type: 'limited', six_stars: ['Six'], five_stars: ['Five'], global_date_estimated: true };
  const banners = [banner];
  run(banners);
  assert.equal(banner.globalPoolId, 'LIMITED_EN_42_0_1');
  assert.equal(banner.global_window.startAt, '2026-10-14T12:00:00.000Z');
  assert.equal(banner.globalScheduleStatus, 'datamined');
  assert.equal(banner.pull_type, 'limited');
  assert.deepEqual(banner.six_stars, ['Six']);
  assert.equal(run(banners).changed, false);
  banner.globalScheduleStatus = 'announced';
  assert.equal(run(banners).changed, false, 'a matching announced window stays announced');
  const changed = structuredClone(fixture);
  changed.gachaPoolClient.find(p => p.gachaPoolId === banner.globalPoolId).openTime += 3600;
  run(banners, changed);
  assert.equal(banner.global_window.startAt, '2026-10-14T13:00:00.000Z');
  assert.equal(banner.globalScheduleStatus, 'datamined');
});

test('named official announcements override maintenance start times and remain idempotent', () => {
  const posts = [{ url: 'https://www.arknights.global/news/4814', lines: [
    '02 LIMITED HEADHUNTING OPEN – SEALED WITH TIME',
    'DURATION: October 14, 2026, 08:00 - October 28, 2026, 03:59 (UTC-7)',
  ] }];
  assert.equal(globalBannerNotices(posts)[0].startAt, '2026-10-14T15:00:00.000Z');
  const banners = [{ name: '[Celebration] Sealed With Time', pull_type: 'limited', six_stars: ['Six'], five_stars: ['Five'] }];
  run(banners, fixture, { posts });
  assert.equal(banners[0].globalScheduleStatus, 'announced');
  assert.equal(banners[0].global_window.startAt, '2026-10-14T15:00:00.000Z');
  assert.equal(banners[0].global_window.endAt, '2026-10-28T11:00:00.000Z');
  assert.equal(banners[0].global_window.timingSource, posts[0].url);
  assert.equal(run(banners, fixture, { posts }).changed, false);
  assert.equal(run(banners).changed, false, 'missing announcement cache cannot replace the saved official opening with maintenance time');
  const moved = structuredClone(fixture);
  const pool = moved.gachaPoolClient.find(p => p.gachaPoolId === banners[0].globalPoolId);
  pool.openTime += 86400;
  pool.endTime += 86400;
  run(banners, moved);
  assert.equal(banners[0].globalScheduleStatus, 'datamined', 'a saved announcement for other days cannot confirm a moved client window');
  assert.equal(banners[0].global_window.startAt, '2026-10-15T12:00:00.000Z');
});

test('a later wiki/CN enrichment cannot restore CN candidates over the shipped EN pool', () => {
  const banners = structuredClone([predecessor, forecast]);
  run(banners, table, { operators });
  const expected = structuredClone(banners);
  Object.assign(banners[1], { six_stars: forecast.six_stars, five_stars: forecast.five_stars, lineupSource: 'wiki' });
  run(banners, table, { operators });
  assert.deepEqual(banners, expected);
});

test('the automatic release reads announcements before reconciling banners and applying windows', () => {
  const script = fs.readFileSync(new URL('../sync/refresh-stage-data.sh', import.meta.url), 'utf8');
  const news = script.indexOf('stage official-news --'), banners = script.indexOf('stage recurring-banners --'), windows = script.indexOf('stage event-windows --');
  assert.ok(news >= 0 && news < banners && banners < windows);
  assert.equal(script.match(/stage official-news --/g).length, 1);
});

test('a datamined Global pool replaces a withdrawn forecast', () => {
  const banners = structuredClone([predecessor, { ...forecast, global_date: null, globalForecastWithdrawn: true }]);
  run(banners, table, { operators });
  assert.equal(banners[1].globalForecastWithdrawn, undefined);
  assert.equal(banners[1].global_date, '2026/10/30–2026/11/13');
});
