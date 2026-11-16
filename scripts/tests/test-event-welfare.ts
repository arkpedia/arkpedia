import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalEventWelfare, eventRewardOperators, eventWelfareOperators, withWelfareEventLinks, type FreeReward } from '../../lib/pulls/freeRewards';

/* An event page's Operators tab lists the welfare operators the Reward Tracker links to that
   page (lib/pulls/freeRewards.ts eventWelfareOperators): one per operator, with how it is earned. */
const row = (over: Partial<FreeReward>): FreeReward => ({ id: 'x', group: 'Welfare operators', name: 'Botani · Event missions: Clear PA-4', forecast: false,
  rewards: [{ id: 'char_4223_botany', name: 'Botani', count: 1, rarity: 5 }], ...over });
const page = '/events/%5BSide%20Story%5D%20People%2C%20A%20People';

test('lists the welfare operators linked to the page, once each, with their task', () => {
  const rewards = [
    row({ id: 'a', href: page }),
    row({ id: 'b', href: page, name: 'Botani · Record Restoration: 3 stars', source: 'trail' }),
    row({ id: 'c', href: '/events/other', rewards: [{ id: 'char_x', name: 'Other', count: 1, rarity: 4 }] }),
    row({ id: 'd', href: page, group: 'Event sign-in and gifts', rewards: [{ id: 'char_y', name: 'Gift', count: 1, rarity: 3 }] }),
  ];
  // The first row wins; with no `event` the source is the row's own name (welfareCardFacts).
  assert.deepEqual(eventWelfareOperators(rewards, page), [{ name: 'Botani', rarity: 5, task: 'Clear PA-4', source: 'Botani · Event missions: Clear PA-4', characterId: 'char_4223_botany' }]);
});

test('game name order resolves by character ID in new and already-published event rows', async () => {
  const catalogue = (await import('../../data/community-operator-catalogue.json')).default;
  const rewards = (await import('../../data/free-rewards.json')).default.rewards as FreeReward[];
  const href = `/events/${encodeURIComponent('[Side Story – Crossover] Somniloquium Serenum')}`;
  const raw = eventWelfareOperators(rewards, href);
  assert.equal(raw.length, 2);
  for (const rows of [raw, raw.map(({ characterId: _id, ...legacy }) => legacy)]) {
    const welfare = canonicalEventWelfare(rows, rewards, catalogue);
    assert.deepEqual(welfare.map(op => [op.name, op.task]), [['Yūtenji Nyamu', 'Clear SS-4'], ['Yahata Umiri', 'Clear SS-5']]);
    const stores = [{ type: 'Missions', name: 'Missions', items: welfare.map(op => ({ iconPath: `/five-star-icons/${encodeURIComponent(op.name + ' - Base.webp')}` })) }];
    assert.deepEqual(eventRewardOperators(stores, welfare), [], 'mission rewards cannot duplicate the welfare operators');
  }
  const unresolved = [{ name: 'Unknown', rarity: 5, task: null, source: 'Missions', characterId: 'char_unknown' }];
  assert.deepEqual(canonicalEventWelfare(unresolved, [], catalogue), unresolved);
});

test('a legacy row without a link is matched through its event (withWelfareEventLinks)', () => {
  const linked = withWelfareEventLinks([row({ id: 'e', event: 'People, A People' })], [{ name: '[Side Story] People, A People' }]);
  assert.equal(eventWelfareOperators(linked, page).length, 1);
});

test("reward operators: an operator's icon in a reward list, encoded or not, once, never a welfare one", () => {
  const stores = [
    { type: 'Login event', name: 'Limited Sign-In Event', items: [{ iconPath: '/one-star-icons/GALLUS%C2%B2%20-%20Base.webp' }, { iconPath: '/material-icons/Orundum.webp' }, { iconPath: null }] },
    { type: 'Login event', name: '2026 CELEBRATION SIGN-IN EVENT OPEN', items: [{ iconPath: '/one-star-icons/GALLUS²%20-%20Base.webp' }] },
    { type: 'Missions', name: 'Event missions', items: [{ iconPath: '/six-star-icons/Viy - Base.webp' }] },
    { type: '', name: 'A store', items: [{ iconPath: '/four-star-icons/Someone - Base.webp' }] },
  ];
  assert.deepEqual(eventRewardOperators(stores, [{ name: 'Viy', rarity: 6, task: 'Clear 17-13', source: 'x' }]), [
    { name: 'GALLUS²', rarity: 1, task: null, source: 'Login event' },
    { name: 'Someone', rarity: 4, task: null, source: 'A store' },
  ]);
});
