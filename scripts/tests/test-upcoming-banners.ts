import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';
import { isBannerLive, upcomingBanners } from '../../lib/gacha/upcomingBanners';

// Ported from kukkikaze/Arkpedia PR #75 (14459217). The /gacha Upcoming tab and its LIVE
// NOW badge used to read `new Date()` during render, so once a banner opened or closed
// after the server rendered the page, the reader's browser disagreed with the markup
// (React #425/#418/#423, reproduced on arkpedia-dev with the clock set just after Rage of
// The Many closed). The split is now a pure function of an instant the caller passes.
const banner = (name: string, global_date: string | null, extra: Partial<HeadhuntingBanner> = {}): HeadhuntingBanner => ({
  name, category: '', cn_date: null, global_date, six_stars: [], five_stars: [], pull_type: 'limited', year: 0, linked_event: null, ...extra,
});

// Date-only Global windows open at 15:00Z (routine pools at 11:00Z) and close at 11:00Z,
// exclusive -- lib/schedule/gameWindow.ts. Rage of The Many is the real boundary:
// 2026-09-16T15:00Z to 2026-09-30T11:00Z.
const rage = banner('Rage of The Many', '2026/09/16–2026/09/30');
const standard = banner('Standard Pool', '2026/09/24–2026/10/08', { pull_type: 'standard' });
const next = banner('Next Limited', '2026/10/01–2026/10/15');
const exact = banner('Exact Window', '2026/10/01–2026/10/15', { global_window: { startAt: '2026-10-01T08:00:00Z', endAt: '2026-10-15T03:00:00Z' } });
const later = banner('Later', '2026/10/15–2026/10/29');
const ended = banner('Ended', '2026/09/01–2026/09/15');
const cnOnly = banner('CN Only', null, { cn_date: '2026/10/20–2026/11/03' });
const undated = banner('Undated', null);
// Newest first, the order the page's props arrive in.
const all = [cnOnly, later, next, exact, standard, rage, ended, undated];
const at = (iso: string) => Date.parse(iso);
const names = (now: number) => upcomingBanners(all, now).map((b) => b.name);

test('a banner is live from its opening instant until, not including, its closing instant', () => {
  assert.equal(isBannerLive(rage, at('2026-09-16T14:59:59.999Z')), false);
  assert.ok(names(at('2026-09-16T14:59:59.999Z')).includes(rage.name), 'not started yet is still Upcoming');
  assert.equal(isBannerLive(rage, at('2026-09-16T15:00:00Z')), true);
  assert.equal(isBannerLive(rage, at('2026-09-30T10:59:59.999Z')), true);
  assert.ok(names(at('2026-09-30T10:59:59.999Z')).includes(rage.name));
  assert.equal(isBannerLive(rage, at('2026-09-30T11:00:00Z')), false);
  assert.ok(!names(at('2026-09-30T11:00:00Z')).includes(rage.name), 'an ended banner leaves the Upcoming tab');
  assert.equal(isBannerLive(standard, at('2026-09-24T10:59:59.999Z')), false);
  assert.equal(isBannerLive(standard, at('2026-09-24T11:00:00Z')), true);
  assert.equal(isBannerLive(exact, at('2026-10-01T08:00:00Z')), true, 'an exact announced time wins over the date-only default');
  assert.equal(isBannerLive(undated, at('2026-09-25T00:00:00Z')), false);
});

test('live banners come first by closing time, then upcoming ones by opening time', () => {
  assert.deepEqual(names(at('2026-09-25T12:00:00Z')), ['Rage of The Many', 'Standard Pool', 'Exact Window', 'Next Limited', 'Later', 'CN Only']);
  assert.deepEqual(names(at('2026-10-01T15:00:00Z')), ['Standard Pool', 'Exact Window', 'Next Limited', 'Later', 'CN Only']);
  assert.deepEqual(names(at('2026-11-03T00:00:00Z')), []);
});

test('the Upcoming split never reads the clock itself; the instant is always the argument', () => {
  const RealDate = Date;
  class NoClock extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) throw new Error('read the clock');
      super(...(args as ConstructorParameters<typeof Date>));
    }
    static now(): number { throw new Error('read the clock'); }
  }
  globalThis.Date = NoClock as DateConstructor;
  try {
    assert.equal(names(at('2026-09-25T12:00:00Z')).length, 6);
    assert.equal(isBannerLive(rage, at('2026-09-25T12:00:00Z')), true);
  } finally {
    globalThis.Date = RealDate;
  }
});

test('a Joint Operation or an Orienteering waits for Global: no forecast from CN, on no upcoming list, until Global dates it', async () => {
  const { estimateBannerFromCn, waitsForGlobal } = await import('../../lib/gacha/bannerSchedule');
  const { resolvePullBannerWindows } = await import('../../lib/pulls/bannerWindows');
  const { getPullSchedule } = await import('../../lib/pulls/schedule');
  const { getAllHeadhuntingBanners } = await import('../../lib/gacha/headhuntingBannerData');
  // Running on CN on 2026-10-06; Global has not dated either.
  const orienteering = banner('Orienteering #8', null, { pull_type: 'orienteering', cn_date: '2026/09/29–2026/10/13', linked_event: 'Vector Breakthrough' });
  const joint = banner('Joint Operation #24', null, { pull_type: 'joint', cn_date: '2026/10/06–2026/10/20' });
  const featured = banner('A CN featured banner', null, { pull_type: 'featured', cn_date: '2026/10/09–2026/10/23' });
  // No Global window from CN for the two; a featured banner still gets its estimate.
  assert.equal(estimateBannerFromCn(orienteering, 175).global_date, null);
  assert.equal(estimateBannerFromCn(joint, 175).global_date, null);
  assert.equal(estimateBannerFromCn(featured, 175).global_date_estimated, true);
  // Nor from its event's predicted window, which is how the Pull Planner dates a linked banner.
  type Events = NonNullable<Parameters<typeof resolvePullBannerWindows>[1]>;
  type Calendar = NonNullable<Parameters<typeof resolvePullBannerWindows>[2]>;
  const events = [{ name: 'Vector Breakthrough', cn: { dateRange: '2026/09/29–2026/10/20' }, global: { dateRange: null } }] as unknown as Events;
  const calendar = [{ name: 'Vector Breakthrough', dateRange: '2027/03/23–2027/04/13', isPredicted: true }] as unknown as Calendar;
  assert.deepEqual(resolvePullBannerWindows([orienteering], events, calendar).map((b) => [b.global_date, b.global_date_estimated]), [[null, false]]);
  // Off the Upcoming tab, even while its CN window is open, and whatever estimate it was given.
  const now = at('2026-10-06T12:00:00Z');
  assert.deepEqual(upcomingBanners([orienteering, joint, { ...joint, name: 'Estimated JO', global_date: '2027/04/01–2027/04/15', global_date_estimated: true }, featured], now).map((b) => b.name), ['A CN featured banner']);
  // Once Global dates it, it is a Global banner like any other.
  const dated = { ...orienteering, global_date: '2027/03/23–2027/04/06' };
  assert.equal(waitsForGlobal(dated), false);
  assert.deepEqual(upcomingBanners([dated], now).map((b) => b.name), ['Orienteering #8']);
  assert.equal(resolvePullBannerWindows([dated], events, calendar)[0].global_date, '2027/03/23–2027/04/06');
  // The real data: the bundled records include ones still waiting, and none of them is in the
  // banner list every page reads, nor in the Pull Planner's schedule.
  const { default: bundled } = await import('../../data/headhunting_banners.json');
  const waiting = (bundled as HeadhuntingBanner[]).filter((b) => waitsForGlobal(b)).map((b) => b.name);
  assert.ok(waiting.length > 0, 'the bundled banners include some still waiting for Global');
  const listed = new Set(getAllHeadhuntingBanners().map((b) => b.name));
  assert.deepEqual(waiting.filter((name) => listed.has(name)), []);
  const planned = new Set(getPullSchedule().map((b) => b.name));
  assert.deepEqual(waiting.filter((name) => planned.has(name)), []);
});
