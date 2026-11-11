import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OBTAIN_METHODS, obtainFilter, obtainMethodsOf, welfareMatches, welfareSourceOf } from '../../lib/operators/obtainMethods';

/*
 * The Operators page's Obtain filter (lib/operators/obtainMethods.ts): the rules the Obtain
 * Method page held alone, plus "Recruitment" for every operator Recruitment can give, beside
 * "Recruitment only" for the ones nothing else does.
 */
const flags = (over: Record<string, unknown> = {}) => ({
  Limited: 'No', 'Standard Headhunting': 'No', 'Kernel Headhunting': 'No', Recruitment: 'No', Welfare: 'No', ...over,
});

test('recruitment counts every recruitable operator, recruitment-only only those no pool also gives', () => {
  assert.deepEqual(obtainMethodsOf(flags({ Recruitment: 'Yes' })), ['recruitment', 'recruitment-only']);
  assert.deepEqual(obtainMethodsOf(flags({ Recruitment: 'Yes', 'Standard Headhunting': 'Yes' })), ['standard', 'recruitment']);
  assert.deepEqual(obtainMethodsOf(flags({ Recruitment: 'Yes', 'Kernel Headhunting': 'Yes' })), ['kernel', 'recruitment']);
});

test('headhunting membership is independent of rarity', () => {
  assert.deepEqual(obtainMethodsOf(flags({ 'Standard Headhunting': 'Yes' })), ['standard']);
  assert.deepEqual(obtainMethodsOf(flags({ 'Kernel Headhunting': 'Yes' })), ['kernel']);
  assert.deepEqual(obtainMethodsOf(flags({ 'Standard Headhunting': 'Yes', 'Kernel Headhunting': 'Yes' })), ['standard', 'kernel']);
  assert.deepEqual(obtainMethodsOf(flags({ Limited: 'Yes' })), ['limited']);
});

test('welfare carries its source, and a record with no obtain data has none', () => {
  const welfare = { 'Unlock Type': 'Record Restore', 'Unlock Location': 'Some Event' };
  assert.deepEqual(obtainMethodsOf(flags({ Welfare: welfare })), ['welfare']);
  assert.deepEqual(welfareSourceOf(flags({ Welfare: welfare })), { type: 'Record Restore', note: 'Some Event' });
  const shop = { 'Unlock Type': 'Credit Store', 'Unlock Location': 'Credit Store' };
  assert.equal(welfareSourceOf(flags({ Welfare: shop }))?.note, 'Credit Store', 'a shop is named by its type');
  assert.equal(welfareMatches(welfareSourceOf(flags({ Welfare: shop })) ?? undefined, 'Credit Shop'), true);
  assert.equal(welfareMatches(welfareSourceOf(flags({ Welfare: shop })) ?? undefined, 'Record Restore'), false);
  assert.equal(welfareMatches(undefined, 'Record Restore'), false);
  assert.deepEqual(obtainMethodsOf(null), []);
  assert.deepEqual(obtainMethodsOf('Yes'), []);
});

test('the address names a method, or means every operator', () => {
  for (const { key } of OBTAIN_METHODS) assert.equal(obtainFilter(key), key);
  assert.equal(obtainFilter('banana'), '');
  assert.equal(obtainFilter(''), '');
});
