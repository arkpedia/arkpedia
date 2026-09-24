import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import loadedBanners from '../../data/headhunting_banners.json';
import path from 'node:path';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

const banner = (fields: Partial<HeadhuntingBanner>) => ({
  category: 'special', cn_date: null, global_date: null, six_stars: [], five_stars: [], pull_type: 'featured', year: 2026, linked_event: null, ...fields,
}) as HeadhuntingBanner;

/* What sync-catalogue creates the day a CN pool reaches the client before the wiki has a
   row for it: records under the pool's Chinese name, with no Global window. Shaped as in
   the review's rehearsal, which injected three such pools. */
const clientCreated = [
  banner({ name: '[Limited] 测试限定', category: 'limited', pull_type: 'limited', cn_date: '2026/09/22–2026/10/06', cnPoolId: 'LIMITED_78_0_1', six_stars: ["Wiš'adel"], nameStatus: 'cn-official' }),
  banner({ name: '[Headhunting] 测试寻访', cn_date: '2026/09/22–2026/10/06', cnPoolId: 'SINGLE_78_0_2', nameStatus: 'cn-official' }),
  banner({ name: 'Joint Operation (NORM_78_0_3)', pull_type: 'joint', cn_date: '2026/09/22–2026/10/06', cnPoolId: 'NORM_78_0_3', nameStatus: 'cn-official' }),
];
const own = banner({ name: 'Rage of The Many', global_date: '2026/09/16–2026/09/30', linked_event: '[Side Story] People, A People' });

/* The event pages call getBannerForEvent with the banners the module loaded, so the
   client-created records go into that data first -- as sync-catalogue writes them into
   data/headhunting_banners.json -- and the module is loaded after. */
(loadedBanners as unknown as HeadhuntingBanner[]).push(...clientCreated);
const linker = import('../../lib/gacha/headhuntingBanners').then(module => module.getBannerForEvent);

test('a banner created under its Chinese name is never the banner of an unrelated Global event', async () => {
  const getBannerForEvent = await linker;
  // The seven event pages that showed "[Limited] 测试限定" in that rehearsal.
  const events: [string, string | null][] = [
    ['Duel Channel: Ivy Vine', '2026/09/20–2026/10/04'], ['Stronghold Protocol Alliance 2nd Half', '2026/09/17–2026/10/01'],
    ['Contingency Contract Obliteration', '2026/10/13–2026/10/27'], ['Positional Football Championship', '2026/11/01–2026/11/15'],
    ['[Crossover] Magic and Friendship', null], ["[Event] Dolly's Playground", null], ["[Rerun] The Masses' Travels Rerun", '2026/10/24–2026/11/03'],
  ];
  for (const [name, range] of events) {
    assert.equal(getBannerForEvent(name, range), null, name); // an event page: the loaded data
    assert.equal(getBannerForEvent(name, range, [...clientCreated, own]), null, name); // the schedule: its live table
  }
  // The event that has a banner still finds it.
  assert.equal(getBannerForEvent('[Side Story] People, A People', '2026/09/16–2026/09/30', [...clientCreated, own]), own);
});

test('only explicit evidence links an event to a banner: linked_event, or the one featured banner opening that Global day', async () => {
  const getBannerForEvent = await linker;
  const featured = banner({ name: 'Some Featured', global_date: '2026/11/01–2026/11/15' });
  assert.equal(getBannerForEvent('[Side Story] Anything', '2026/11/01–2026/11/15', [featured]), featured);
  // An estimate on either side is not a Global day.
  assert.equal(getBannerForEvent('[Side Story] Anything', null, [featured]), null);
  assert.equal(getBannerForEvent('[Side Story] Anything', '2026/11/01–2026/11/15', [{ ...featured, global_date_estimated: true }]), null);
  // Two banners opening that day: nothing tells which one belongs to the event.
  const limited = banner({ name: 'Some Limited', pull_type: 'limited', global_date: '2026/11/01–2026/11/15' });
  assert.equal(getBannerForEvent('[Side Story] Anything', '2026/11/01–2026/11/15', [featured, limited]), null);
  // A CN-only banner is never matched by a date, only by an explicit link.
  const cnOnly = { ...featured, nameStatus: 'cn-official' as const };
  assert.equal(getBannerForEvent('[Side Story] Anything', '2026/11/01–2026/11/15', [cnOnly]), null);
  assert.equal(getBannerForEvent('[Side Story] Anything', null, [{ ...cnOnly, linked_event: '[Side Story] Anything' }])?.name, 'Some Featured');
  // A name is not evidence: a banner that shares an event's words is not its banner.
  assert.equal(getBannerForEvent('[Side Story] Some Featured', null, [featured]), null);
  // The banners passed in are the ones searched (the schedule page passes the live table).
  assert.equal(getBannerForEvent('[Side Story] People, A People', null, []), null);
});

test('adding client-created CN banners changes no event\'s banner in the loaded data', async () => {
  const getBannerForEvent = await linker;
  // A property of the function, not of today's data: it holds for whatever data is loaded.
  const banners = JSON.parse(fs.readFileSync('data/headhunting_banners.json', 'utf8')) as HeadhuntingBanner[];
  const events = fs.readdirSync('data/events').filter(file => /^events_\d+\.json$/.test(file))
    .flatMap(file => JSON.parse(fs.readFileSync(`data/events/${file}`, 'utf8'))) as { name: string; global?: { dateRange?: string | null; note?: string | null } }[];
  for (const event of events) {
    const range = /estimated|predicted/i.test(event.global?.note || '') ? null : event.global?.dateRange;
    const found = getBannerForEvent(event.name, range, [...banners, ...clientCreated]);
    assert.ok(!clientCreated.some(b => b.name === found?.name), `${event.name} took ${found?.name}`);
    assert.equal(found?.name ?? null, getBannerForEvent(event.name, range, banners)?.name ?? null, event.name);
  }
});

test('an estimated Global date is never passed as evidence, on any page', async () => {
  const { confirmedGlobalRange } = await import('../../lib/gacha/headhuntingBanners');
  const getBannerForEvent = await linker;
  // The note the event records carry for an estimate (Sur le lac lune vivante's).
  const estimated = { dateRange: '2027/02/19–2027/03/04', note: 'ESTIMATED Global date, not officially confirmed' };
  assert.equal(confirmedGlobalRange(estimated), null);
  assert.equal(confirmedGlobalRange({ ...estimated, note: null }), estimated.dateRange);
  const guessed = banner({ name: 'Guessed Into That Day', global_date: '2027/02/19–2027/03/05' });
  assert.equal(getBannerForEvent('[Side Story] Anything', confirmedGlobalRange(estimated), [guessed]), null);
  // Every page call hands getBannerForEvent a range that is null for an estimate.
  const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  const calls = ['pages', 'components', 'lib'].flatMap(sources).flatMap(file => fs.readFileSync(file, 'utf8').split('\n')
    .filter(line => line.includes('getBannerForEvent(') && !line.includes('export function getBannerForEvent')).map(line => `${file}: ${line.trim()}`));
  assert.ok(calls.length >= 3, calls.join('\n'));
  for (const call of calls) assert.match(call, /isPredicted \? null :|confirmedGlobalRange\(/, call);
});
