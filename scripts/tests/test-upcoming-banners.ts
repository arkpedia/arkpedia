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
