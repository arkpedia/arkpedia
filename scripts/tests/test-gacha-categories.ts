import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/gacha-release.json';
import { CATEGORIES, displayCategory, groupSimulatorBanners } from '../../lib/gacha/bannerCategories';
import { getMechanicType } from '../../lib/gacha/realGachaBanners';
import { bannerTimingLabel } from '../../lib/gacha/bannerTimingLabel';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

test('Limited includes every crossover and limited record once without changing records or mechanics', () => {
  const banners = fixture.props.banners as unknown as HeadhuntingBanner[];
  const original = JSON.stringify(banners);
  const groups = groupSimulatorBanners(banners, Date.parse('2026-09-25T00:00:00Z'));
  assert.ok(!CATEGORIES.includes('crossover' as never));
  const crossover = banners.filter(b => getMechanicType(b) === 'crossover');
  assert.ok(crossover.length);
  assert.ok(groups.limited.some(b => getMechanicType(b) === 'limited'));
  for (const b of crossover) {
    assert.equal(displayCategory(b), 'limited');
    assert.equal(groups.limited.filter(value => value === b).length, 1);
    assert.equal(getMechanicType(b), 'crossover');
  }
  assert.equal(JSON.stringify(banners), original);
});

test('timing labels distinguish client datamines, estimates, official windows and CN', () => {
  const b = { global_date: '2026/10/30–2026/11/13', cn_date: '2026/05/15–2026/05/29' } as HeadhuntingBanner;
  assert.equal(bannerTimingLabel({ ...b, globalScheduleStatus: 'datamined' }), `Datamined Global · ${b.global_date}`);
  assert.equal(bannerTimingLabel({ ...b, global_date_estimated: true }), `Estimated Global · ${b.global_date}`);
  assert.equal(bannerTimingLabel({ ...b, globalScheduleStatus: 'announced' }), b.global_date);
  assert.equal(bannerTimingLabel({ ...b, global_date: null }), `CN · ${b.cn_date}`);
});
