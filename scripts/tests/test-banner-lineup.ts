import assert from 'node:assert/strict';
import test from 'node:test';
import banners from '../../data/headhunting_banners.json';
import { getBannerLineup } from '../../lib/gacha/bannerLineup';
import { getFeaturedOperatorRates, splitEventBannerRates } from '../../lib/gacha/eventBannerRates';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

/* Shaped like [Celebration] Sealed With Time: two featured limited six-stars, one
   featured five-star, and returning limited operators listed as rate-ups. The real
   banner's featured operators are CN-only and change their English names when Global
   announces them, so the lineup rules are pinned on invented names instead. */
const limited = {
  name: '[Celebration] Fixture Anniversary', category: 'limited', pull_type: 'limited',
  cn_date: '2026/05/01–2026/05/15', global_date: '2026/10/14–2026/10/28', year: 2026,
  six_stars: ['Featured Six A', 'Featured Six B'], five_stars: ['Featured Five'], four_stars: [],
  rate_up_six_stars: ['Returner A', 'Returner B', 'Returner C'],
} as unknown as HeadhuntingBanner;
const featuredNames = ['Featured Six A', 'Featured Six B', 'Featured Five'];
const returningNames = ['Returner A', 'Returner B', 'Returner C'];

test('a limited banner keeps its returning limited operators outside the featured lineup', () => {
  const { featured, returning } = getBannerLineup(limited);
  assert.deepEqual(featured.map(op => op.name), featuredNames);
  assert.deepEqual(returning.map(op => op.name), returningNames);
  assert.equal(featured.at(-1)?.rarity, 5);
});

test('event and home lineups agree, including previously published event payloads', () => {
  const rates = getFeaturedOperatorRates(limited);
  for (const payload of [rates, rates.map(({ returningLimited: _, ...op }) => op)]) {
    const groups = splitEventBannerRates(payload);
    assert.deepEqual(groups.featured.map(op => op.name), featuredNames);
    assert.deepEqual(groups.returning.map(op => op.name), returningNames);
    assert.deepEqual(groups.featured.map(op => op.percent), [35, 35, 50]);
    assert(groups.returning.every(op => op.percent === null));
  }
});

test('every published limited banner separates the same returning operators on both displays', () => {
  const published = (banners as HeadhuntingBanner[]).filter(banner => banner.pull_type === 'limited');
  assert.ok(published.some(banner => banner.rate_up_six_stars?.length), 'a limited banner lists returning operators');
  for (const banner of published) {
    const { featured, returning } = getBannerLineup(banner);
    assert.ok(!returning.some(op => featured.some(other => other.name === op.name)), banner.name);
    const groups = splitEventBannerRates(getFeaturedOperatorRates(banner));
    const shown = new Set(groups.returning.map(op => op.name).filter(name => !featured.some(op => op.name === name)));
    assert.deepEqual([...shown], returning.map(op => op.name), banner.name);
  }
});

test('ordinary banners keep their complete lineup and never gain a returning-limited group', () => {
  for (const banner of banners as HeadhuntingBanner[]) {
    if (banner.pull_type === 'limited') continue;
    assert.equal(getBannerLineup(banner).returning.length, 0, banner.name);
    const rates = getFeaturedOperatorRates(banner);
    assert.deepEqual(splitEventBannerRates(rates), { featured: rates, returning: [] }, banner.name);
  }
});

test('duplicate scraped names do not duplicate or promote returning operators', () => {
  const groups = getBannerLineup({ ...limited, rate_up_six_stars: [...limited.rate_up_six_stars!, 'Featured Six A', returningNames[0]] });
  assert.deepEqual(groups.returning.map(op => op.name), returningNames);
});
