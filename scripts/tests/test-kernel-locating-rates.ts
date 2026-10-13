import assert from 'node:assert/strict';
import test from 'node:test';
import { fiveStarWeightedPool, simulatorPullable, sixStarWeightedPool } from '../../lib/gacha/gachaEngine';
import { getMechanicType } from '../../lib/gacha/realGachaBanners';
import type { BannerConfig, GachaItem } from '../../lib/gacha/gachaTypes';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

// A Kernel Locating banner as kernel-locating.mjs publishes it from the official post: 12
// six-stars and 24 five-stars, of which the reader locks in two and three. The client's own
// pool (FESCLASSIC_EN_40_0_3, dynMeta.pickUpPerCharPercent) gives each chosen 6-star 25% of
// the 6-star rate and each chosen 5-star 16.67% of the 5-star rate: half to the chosen, half
// to the rest.
const ops = (prefix: string, count: number): GachaItem[] => Array.from({ length: count }, (_, i) => ({ name: `${prefix} ${i + 1}`, icon: null }));
const six = ops('Six', 12), five = ops('Five', 24);
const chosen: BannerConfig = { type: 'kernelLocating', label: 'Kernel Locating #13', description: '',
  sixStarFeatured: six.slice(0, 2), otherSixStarPool: six.slice(2), fiveStarFeatured: five.slice(0, 3), otherFiveStarPool: five.slice(3),
  fourStarPool: ops('Four', 4), threeStarPool: ops('Three', 4) };
const weight = (pool: { item: GachaItem; weight: number }[], name: string) => pool.find(entry => entry.item.name === name)?.weight ?? 0;
const total = (pool: { weight: number }[]) => pool.reduce((sum, entry) => sum + entry.weight, 0);

test('a published Kernel Locating record is the Kernel Locating mechanic', () => {
  const record = { name: 'Kernel Locating #13 (Global)', pull_type: 'kernel', lineupSource: 'announcement' } as HeadhuntingBanner;
  assert.equal(getMechanicType(record), 'kernelLocating');
  assert.equal(simulatorPullable(record, chosen), true);
  assert.equal(simulatorPullable({ lineupSource: 'pending' }, chosen), false);
});

test('the chosen two 6-stars take 25% each and the chosen three 5-stars 1/6 each, as the client states', () => {
  const sixPool = sixStarWeightedPool(chosen), fivePool = fiveStarWeightedPool(chosen);
  assert.ok(Math.abs(total(sixPool) - 1) < 1e-9 && Math.abs(total(fivePool) - 1) < 1e-9);
  for (const item of chosen.sixStarFeatured) assert.ok(Math.abs(weight(sixPool, item.name) - 0.25) < 1e-9, item.name);
  for (const item of chosen.otherSixStarPool) assert.ok(Math.abs(weight(sixPool, item.name) - 0.05) < 1e-9, item.name);
  for (const item of chosen.fiveStarFeatured) assert.ok(Math.abs(weight(fivePool, item.name) - 1 / 6) < 1e-4, item.name);
  for (const item of chosen.otherFiveStarPool) assert.ok(Math.abs(weight(fivePool, item.name) - 0.5 / 21) < 1e-9, item.name);
});
