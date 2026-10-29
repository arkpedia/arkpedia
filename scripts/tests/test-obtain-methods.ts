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
  assert.deepEqual(obtainMethodsOf(flags({ Recruitment: 'Yes' }), 4), ['recruitment', 'recruitment-only']);
  assert.deepEqual(obtainMethodsOf(flags({ Recruitment: 'Yes', 'Standard Headhunting': 'Yes' }), 5), ['recruitment']);
  assert.deepEqual(obtainMethodsOf(flags({ Recruitment: 'Yes', 'Kernel Headhunting': 'Yes' }), 6), ['kernel', 'recruitment']);
});

test('the 6★ pools and Limited are read as the Obtain Method page read them', () => {
  assert.deepEqual(obtainMethodsOf(flags({ 'Standard Headhunting': 'Yes' }), 6), ['standard']);
  assert.deepEqual(obtainMethodsOf(flags({ 'Standard Headhunting': 'Yes' }), 5), [], 'only the 6★ pool is a list');
  assert.deepEqual(obtainMethodsOf(flags({ Limited: 'Yes' }), 6), ['limited']);
});

test('welfare carries its source, and a record with no obtain data has none', () => {
  const welfare = { 'Unlock Type': 'Record Restore', 'Unlock Location': 'Some Event' };
  assert.deepEqual(obtainMethodsOf(flags({ Welfare: welfare }), 6), ['welfare']);
  assert.deepEqual(welfareSourceOf(flags({ Welfare: welfare })), { type: 'Record Restore', note: 'Some Event' });
  const shop = { 'Unlock Type': 'Credit Store', 'Unlock Location': 'Credit Store' };
  assert.equal(welfareSourceOf(flags({ Welfare: shop }))?.note, 'Credit Store', 'a shop is named by its type');
  assert.equal(welfareMatches(welfareSourceOf(flags({ Welfare: shop })) ?? undefined, 'Credit Shop'), true);
  assert.equal(welfareMatches(welfareSourceOf(flags({ Welfare: shop })) ?? undefined, 'Record Restore'), false);
  assert.equal(welfareMatches(undefined, 'Record Restore'), false);
  assert.deepEqual(obtainMethodsOf(null, 6), []);
  assert.deepEqual(obtainMethodsOf('Yes', 6), []);
});

test('the address names a method, or means every operator', () => {
  for (const { key } of OBTAIN_METHODS) assert.equal(obtainFilter(key), key);
  assert.equal(obtainFilter('banana'), '');
  assert.equal(obtainFilter(''), '');
});
