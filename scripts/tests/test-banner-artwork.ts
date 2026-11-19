import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBannerArtwork } from '../../lib/gacha/bannerArtworkServer';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

const pool: HeadhuntingBanner = {
  name: 'Standard Pool #180 (Global)', pull_type: 'standard', category: 'standard_pool',
  global_date: '2026/11/20–2026/12/04', cn_date: null, linked_event: null, year: 2026,
  six_stars: ['Stainless', 'Qiubai'], five_stars: ['Melanite', 'Sand Reckoner', 'Wind Chimes'],
};
const shopRow = {
  no: '181', type: 'standard', start: '2026/12/04 04:00:00', end: '2026/12/18 03:59:59',
  operators: 'Melanite, Qiubai, Sand Reckoner, Stainless, Wind Chimes', store: '0,1,1,0,0',
};

test('the lineup fallback is built only when the banner has no published art', () => {
  assert.ok(buildBannerArtwork([pool], [], [])[pool.name]);
  assert.deepEqual(buildBannerArtwork([{ ...pool, banner_image: '/banner.webp' }], [], []), {});
});

test('the shop 6-star uses Base and the other uses Elite 2 regardless of lineup order', () => {
  const next = { ...pool, name: 'Standard Pool #181 (Global)', global_date: '2026/12/04–2026/12/18' };
  const artwork = buildBannerArtwork([pool, next], [], [shopRow]);
  assert.deepEqual(artwork[pool.name].slice(0, 2), [
    { name: 'Qiubai', rarity: 6, art: '/six-star-skins/Qiubai - Elite 2.webp', elite: 2, shop: false },
    { name: 'Stainless', rarity: 6, art: '/six-star-skins/Stainless - Base.webp', elite: 0, shop: true },
  ]);
  assert.equal(artwork[pool.name].find(operator => operator.name === 'Sand Reckoner')?.shop, true);
  assert.deepEqual(artwork[next.name].slice(0, 2).map(({ name, elite }) => [name, elite]), [['Stainless', 2], ['Qiubai', 0]]);
});

test('mismatched shop data does not guess a promotion, and pending lineups stay empty', () => {
  const next = { ...pool, name: 'Standard Pool #181 (Global)', global_date: '2026/12/04–2026/12/18' };
  const artwork = buildBannerArtwork([next], [], [{ ...shopRow, operators: shopRow.operators.replace('Qiubai', 'Viviana') }]);
  assert.ok(artwork[next.name].filter(operator => operator.rarity === 6).every(operator => operator.elite === null && !operator.shop));
  assert.deepEqual(buildBannerArtwork([{ ...next, globalLineupPending: true }], [], [shopRow]), {});
});
