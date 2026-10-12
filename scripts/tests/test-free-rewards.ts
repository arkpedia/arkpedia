import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeRewardAvailable, freeRewardTotals, type FreeReward } from '../../lib/pulls/freeRewards';
import { remainingBacklog } from '../../lib/pulls/pulls';
import catalogue from '../../data/free-rewards.json';

const gift: FreeReward = { id: 'free:gift', group: 'Sign-in', name: 'Day 1', forecast: false, startAt: 10, endAt: 20,
  rewards: [{ id: '4002', name: 'OP', count: 2, op: 2 }, { id: '4003', name: 'Orundum', count: 200, orundum: 200 },
    { id: 'selector', name: 'Selector', count: 1 }, { id: 'kernel', name: 'Kernel permit', count: 10, restricted: true }] };

test('free reward totals respect exclusive end dates, claims and currency types', () => {
  assert.equal(freeRewardAvailable(gift, 9), false);
  assert.equal(freeRewardAvailable(gift, 10), true);
  assert.equal(freeRewardAvailable(gift, 20), false);
  assert.deepEqual(freeRewardTotals([gift], new Set(), 10), { op: 2, orundum: 200, permits: 0 });
  assert.deepEqual(freeRewardTotals([gift], new Set([gift.id]), 10), { op: 0, orundum: 0, permits: 0 });
  assert.deepEqual(freeRewardTotals([gift], new Set(), 20), { op: 0, orundum: 0, permits: 0 });
});
test('Paradox and permanent free rewards share claimed keys without counting scheduled login rewards twice', () => {
  const sources = { chapters: [], playable: [], originiteByStageType: {}, annihilationOrundum: 0, annihilation: [], resources: [], paradox: [{ id: 'paradox:mem_a', name: 'A', amount: 200 }], freeRewards: [{ ...gift, forecast: true, startAt: undefined, endAt: undefined }] };
  assert.deepEqual(remainingBacklog(sources, new Set(), new Set(), false), { originitePrime: 2, annihilationOrundum: 0, orundum: 760, permits: 0 });
  assert.deepEqual(remainingBacklog(sources, new Set(), new Set(['paradox:mem_a', 'free:gift']), false), { originitePrime: 0, annihilationOrundum: 0, orundum: 0, permits: 0 });
});
const rewards: FreeReward[] = catalogue.rewards;
test('catalogue includes beginner selectors and pinboard rewards, excludes paid packages and keeps restricted tickets out of savings', () => {
  assert.ok(catalogue.paradox.length > 0);
  assert.equal(new Set(rewards.map(reward => reward.id)).size, catalogue.rewards.length);
  assert.ok(rewards.some(reward => reward.group === 'Beginner rewards' && reward.rewards.some(item => item.name.includes('Transfer Permit'))));
  assert.ok(rewards.some(reward => reward.group === 'Pinboard missions'));
  assert.ok(!rewards.some(reward => reward.id.includes('new_bp_') || reward.id.includes('GP_L_')));
  for (const reward of rewards) {
    if (reward.forecast) assert.ok(!('startAt' in reward) && !('endAt' in reward));
    for (const item of reward.rewards) if ('restricted' in item && item.restricted) assert.ok(!('permits' in item));
  }
});

test('published reward art distinguishes colliding permits and covers beginner item rewards', async () => {
  const { freeRewardIcons } = await import('../../lib/pulls/rewardIcons');
  const { publicFileExists } = await import('../../lib/assets/publicAssets');
  const icons = freeRewardIcons(rewards);
  assert.ok(icons.voucher_recruitR6_pick5301);
  assert.ok(icons.voucher_item_4pick1_5301);
  assert.ok(icons.advanced_material_issue_voucher);
  assert.ok(icons.char_102_texas);
  assert.notEqual(icons.LINKAGE_TKT_GACHA_10_4801, icons.LINKAGE_TKT_GACHA_10_1701);
  assert.ok(Object.values(icons).every(publicFileExists));
  assert.equal(icons.GP_freeL_5, undefined, 'the client names the free claim but supplies no pack icon');
});

test('older page releases use the published bundled icon pin while new releases keep their own art projection', async () => {
  const { rewardTrackerArt } = await import('../../lib/pulls/rewardIcons');
  const { default: revisions } = await import('../../data/assets/revisions.json');
  const release = { release: 'old', baseUrl: 'https://example.test/old', assets: { 'arkpedia-image-assets': 'old-pin', 'arkpedia-skin-assets': 'outfit-pin' } };
  const fallback = rewardTrackerArt(rewards, undefined, release);
  assert.equal(fallback.__contentRelease?.assets['arkpedia-image-assets'], revisions['arkpedia-image-assets']);
  assert.equal(fallback.__contentRelease?.assets['arkpedia-skin-assets'], 'outfit-pin');
  assert.equal(release.assets['arkpedia-image-assets'], 'old-pin');
  const icons = { '4003': '/material-icons/Orundum.webp' };
  const current = rewardTrackerArt(rewards, icons, release);
  assert.equal(current.rewardIcons, icons);
  assert.equal(current.__contentRelease, release);
});
