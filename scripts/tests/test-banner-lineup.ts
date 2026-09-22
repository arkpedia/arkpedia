import assert from 'node:assert/strict';
import test from 'node:test';
import banners from '../../data/headhunting_banners.json';
import { getBannerLineup } from '../../lib/gacha/bannerLineup';
import { getFeaturedOperatorRates, splitEventBannerRates } from '../../lib/gacha/eventBannerRates';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

const limited = banners.find(banner => banner.name === '[Celebration] Sealed With Time') as HeadhuntingBanner;
const featuredNames = ['Closure', "Kal'tsit - Esperanta", 'Crackborne'];
const returningNames = ['Exusiai the New Covenant', 'Lappland the Decadenza', 'Wiš\'adel'];

test('Sealed With Time keeps its returning limited operators outside the featured lineup', () => {
  assert(limited);
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

test('ordinary banners keep their complete lineup and never gain a returning-limited group', () => {
  for (const banner of banners as HeadhuntingBanner[]) {
    if (banner.pull_type === 'limited') continue;
    assert.equal(getBannerLineup(banner).returning.length, 0, banner.name);
    const rates = getFeaturedOperatorRates(banner);
    assert.deepEqual(splitEventBannerRates(rates), { featured: rates, returning: [] }, banner.name);
  }
});

test('duplicate scraped names do not duplicate or promote returning operators', () => {
  const groups = getBannerLineup({ ...limited, rate_up_six_stars: [...limited.rate_up_six_stars!, 'Closure', returningNames[0]] });
  assert.deepEqual(groups.returning.map(op => op.name), returningNames);
});
