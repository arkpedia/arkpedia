import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPullCurrency, rewardSummary, rowOf } from '../../lib/events/rewardSummary';
import type { ResolvedRewardStore } from '../../lib/events/rewardTotals';

/*
 * The All card (lib/events/rewardSummary.ts): a row per kind of reward, as the community
 * compilations lay an event out, with the pull currencies once, in Headhunting.
 */
const context = {
  groups: [{ tag: 'Tier 5', names: ['D32 Steel'] }, { tag: 'Tier 3', names: ['Semi-Synthetic Solvent'] }],
  operators: new Set(['Kroos the Keen Glint']),
  outfits: new Set(['Indigo / Serene Day']),
  furniture: new Set(['Poetry Scroll']),
  kinds: new Map([['封缄诺言寻访凭证', 'permit'], ['GALLUS²', 'operator']]),
};
const store = (type: string, items: [string, number, string][]): ResolvedRewardStore => ({
  type, name: type, items: items.map(([name, quantity, stock]) => ({ name, quantity, stock, price: null, currency: '', iconPath: null })),
});

test('each reward lands in its row', () => {
  const rows: [string, string][] = [
    ['D32 Steel', 'Tier 5 materials'], ['Semi-Synthetic Solvent', 'Tier 3 materials'], ['Orundum', 'Headhunting'],
    ['Sing while Drinking Headhunting Permit (ten-roll)', 'Headhunting'], ['Supporter Chip', 'Chips'], ['Guard Dualchip', 'Chips'],
    ['Chip Catalyst', 'Chip catalysts'], ['Skill Summary - 3', 'Skill summaries'], ['Module Data Block', 'Module materials'],
    ['Strategic Battle Record', 'EXP'], ['LMD', 'LMD'], ['Expedited Plan', 'Recruitment'], ['Top Emergency Sanity Potion', 'Sanity'],
    ['Furniture Part', 'Furniture parts'], ['Kroos the Keen Glint', 'Operators'], ['Indigo / Serene Day', 'Outfits'],
    ['Poetry Scroll', 'Furniture'], ['Pure Gold', 'Other'],
    // Named in the CN client's words: placed by what the tables say they are.
    ['封缄诺言寻访凭证', 'Headhunting'], ['GALLUS²', 'Operators'],
  ];
  for (const [name, row] of rows) assert.equal(rowOf(name, context), row, name);
  assert.ok(isPullCurrency('Originite Prime') && isPullCurrency('Headhunting Permit') && isPullCurrency('Kernel Headhunting Permit'));
  assert.ok(!isPullCurrency('Recruitment Permit') && !isPullCurrency('Expedited Plan'));
});

test('every limited permit is a pull currency by its name, as data/event-rewards.json spells it', () => {
  // The suffix the tables give a banner's ten-roll permit; without it these reached Headhunting
  // only by the tables' kind, and a store row naming one carries no kind.
  const noKinds = { ...context, kinds: new Map<string, string>() };
  for (const name of ['Sing while Drinking Headhunting Permit (ten-roll)', 'Expert Headhunting Permit (ten-roll)',
    'Memorial-Limited Headhunting Permit (ten-roll)', 'Awakening Commemoration Permit (ten-roll)', '封缄诺言寻访凭证 (ten-roll)']) {
    assert.ok(isPullCurrency(name), name);
    assert.equal(rowOf(name, noKinds), 'Headhunting', name);
  }
});

test('totals count the store at its stock limits, and the pull currencies are listed once, in Headhunting', () => {
  const summary = rewardSummary([
    store('Events Store', [['Headhunting Permit', 1, '3'], ['LMD', 100, '∞'], ['D32 Steel', 1, '2']]),
    store('Login event', [['Orundum', 600, '1'], ['Originite Prime', 3, '1']]),
    store('First clears', [['Originite Prime', 28, '1']]),
  ], context, []);
  const row = (label: string) => summary.rows.find(r => r.label === label)!;
  assert.deepEqual(row('Headhunting').items.map(i => [i.name, i.count]), [['Orundum', 600], ['Originite Prime', 31], ['Headhunting Permit', 3]]);
  assert.equal(summary.rows.find(r => r.label === 'LMD'), undefined, 'unlimited stock is not a total');
  assert.deepEqual(summary.rows.map(r => r.label), ['Tier 5 materials', 'Headhunting']);
  // Once: a second list of the pull currencies by source repeated the Headhunting row.
  assert.equal('pulls' in summary, false);
  assert.deepEqual(summary.sources, ['Events Store', 'Login event', 'First clears']);
});

test('a reward in two blocks keeps the icon one of them has, whichever comes first', () => {
  const blocks = [
    { type: 'Events Store', name: 'Store', items: [{ name: 'Duel Trophy', quantity: 1, price: 10, currency: 'Token', stock: '1', iconPath: null }] },
    { type: 'Milestones', name: 'Track', items: [{ name: 'Duel Trophy', quantity: 1, price: null, currency: '', stock: '1', iconPath: '/material-icons/furni_enemyduel_diceAll_01.webp' }] },
  ];
  const summary = rewardSummary(blocks as never, context, []);
  const tile = summary.rows.flatMap(r => r.items).find(i => i.name === 'Duel Trophy')!;
  assert.deepEqual([tile.count, tile.iconPath], [2, '/material-icons/furni_enemyduel_diceAll_01.webp']);
});

test('EXP and pull totals use the displayed finite rewards, including ten-rolls and fractional OP', () => {
  const summary = rewardSummary([store('Rewards', [['Strategic Battle Record', 10, '1'], ['Tactical Battle Record', 20, '1'], ['Orundum', 600, '1'], ['Originite Prime', 29, '1'], ['Expert Headhunting Permit (ten-roll)', 2, '1']])], context, []);
  assert.deepEqual(summary.rows.find(row => row.label === 'EXP')!.total, {value: 40000, unit: 'EXP'});
  assert.ok(Math.abs(summary.rows.find(row => row.label === 'Headhunting')!.total!.value - 29.7) < 1e-8);
});

test('operator selectors have no invented pull equivalent', async () => {
  const {withRewardRowTotal} = await import('../../lib/events/rewardRowTotals');
  const row = withRewardRowTotal({label:'Headhunting',items:[{name:'Special Event Transfer Permit',count:1,iconPath:null},{name:'Headhunting Permit',count:3,iconPath:null}]});
  assert.equal(row.total!.value,3);
});

test('free skin names resolve to full outfit artwork across reward naming formats', async () => {
  const {rewardSkin} = await import('../../lib/events/rewardArtwork');
  const skin = {name:'Picnic Times',model:'Aroma',image:'/five-star-skins/Aroma - Picnic Times.webp'} as import('../../lib/skins/skinTypes').Skin;
  assert.equal(rewardSkin('Aroma / Picnic Times',[skin]),skin);
  assert.equal(rewardSkin('CN reward name',[skin],'/five-star-icons/Aroma%20-%20Picnic%20Times.webp'),skin);
  assert.equal(rewardSkin('Unknown outfit',[skin]),undefined);
});
