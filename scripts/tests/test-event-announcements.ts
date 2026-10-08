import assert from 'node:assert/strict';
import { test } from 'node:test';
import { announcedRewards } from '../../lib/events/announcements';
import { tableRewardStores, type TableRewardGroup } from '../../lib/events/tableRewards';
import { totalRewards } from '../../lib/events/rewardTotals';
import { getAllOperators } from '../../lib/operators/operators';

const event = '[Celebration] Critical Phase Transition';
const group = (kind: TableRewardGroup['kind'], title: string, region?: string): TableRewardGroup => ({ kind, title, region, source: 'test', items: [] });

test('preview replaces CN sign-in, keeps early Global gifts, and counts free pulls once', () => {
  const { groups } = announcedRewards(event, [group('login', 'CN sign-in', 'CN'), group('first-clear', 'Stages', 'CN')]);
  assert.equal(groups.some(g => g.title === 'CN sign-in'), false);
  assert.equal(groups.some(g => g.title === 'Stages'), true);
  const totals = totalRewards(tableRewardStores(groups, () => null));
  assert.equal(totals.find(i => i.name === 'Orundum')?.total, 6600);
  assert.equal(totals.find(i => i.name === 'Daily free headhunting roll')?.total, 14);
  assert.equal(totals.find(i => i.name === 'Special Event Transfer Permit')?.total, 1);
  assert.equal(totals.some(i => i.name === '2026 Celebration Operator Permit'), false, 'paid tickets do not enter free totals');
});

test('early Global login gifts alone do not hide the event sign-in preview', () => {
  const existing = group('login', 'TO LOOK BACK ON TERRA LIMITED LOGIN EVENT', 'Global');
  const { groups } = announcedRewards(event, [existing]);
  assert.equal(groups.filter(g => g.title === existing.title && g.kind === 'login').length, 1);
  assert.equal(groups.some(g => g.title === 'Celebration sign-in · 10 days'), true);
});

test('event Global sign-in and packs supersede previews after content refresh', () => {
  const login = group('login', 'Event sign-in', 'Global');
  const packs = { ...group('packs', 'Global sale', 'Global'), packs: [{ name: 'Global pack', contents: [] }] };
  const { groups } = announcedRewards(event, [login, packs]);
  assert.equal(groups.some(g => g.title === 'Celebration sign-in · 10 days'), false);
  assert.deepEqual(groups.filter(g => g.kind === 'packs'), [packs]);
  assert.equal(groups.some(g => g.title === 'Recommended Monthly Card'), true);
  assert.equal(groups.some(g => g.kind === 'login' && g.title === 'To Look Back on Terra'), true);
});

test('three selectors have their independently announced pools, all resolved to 6-star operators', () => {
  const { tickets } = announcedRewards(event, []);
  assert.deepEqual(tickets['Special Event Transfer Permit'].operators, ['Saileach', 'Surtr', 'Pozëmka', 'Mudrock', 'Reed the Flame Shadow', 'Suzuran', 'Passenger', 'Mizuki']);
  assert.equal(tickets['2026 Celebration Operator Permit'].operators.length, 35);
  assert.equal(tickets['Top Operator Transfer Permit - Kernel'].operators.length, 48);
  const roster = getAllOperators();
  for (const ticket of Object.values(tickets)) {
    assert.equal(new Set(ticket.operators).size, ticket.operators.length);
    for (const name of ticket.operators) assert.equal(roster.find(op => op.name === name)?.rarity, 6, name);
    assert.equal(ticket.operators.includes('Closure'), false);
    assert.equal(ticket.operators.includes("Kal'tsit - Esperanta"), false);
  }
});

test('an unrelated event retains its own rewards without supplements', () => {
  const groups = [group('login', 'Other')];
  assert.deepEqual(announcedRewards('Other event', groups), { groups, tickets: {} });
});
