import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPullCurrency, rewardSummary, rowOf } from '../../lib/events/rewardSummary';
import type { ResolvedRewardStore } from '../../lib/events/rewardTotals';

/*
 * The All card (lib/events/rewardSummary.ts): a row per kind of reward, and the pull currencies
 * by where they came from, as the community compilations lay an event out.
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
    ['Sing while Drinking Headhunting Permit', 'Headhunting'], ['Supporter Chip', 'Chips'], ['Guard Dualchip', 'Chips'],
    ['Chip Catalyst', 'Chip catalysts'], ['Skill Summary - 3', 'Skill summaries'], ['Module Data Block', 'Module materials'],
    ['Strategic Battle Record', 'EXP'], ['LMD', 'LMD'], ['Expedited Plan', 'Recruitment'], ['Top Emergency Sanity Potion', 'Sanity'],
    ['Furniture Part', 'Furniture parts'], ['Kroos the Keen Glint', 'Operators'], ['Indigo / Serene Day', 'Outfits'],
    ['Poetry Scroll', 'Furniture'], ['Pure Gold', 'Other'],
    // Named in the CN client's words: placed by what the tables say they are.
    ['封缄诺言寻访凭证', 'Headhunting'], ['GALLUS²', 'Operators'],
  ];
  for (const [name, row] of rows) assert.equal(rowOf(name, context), row, name);
  assert.ok(isPullCurrency('Originite Prime') && isPullCurrency('Ten-roll Headhunting Permit') && !isPullCurrency('Recruitment Permit'));
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
