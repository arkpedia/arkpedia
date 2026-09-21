import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecurringWikiRows, reconcileRecurringBanners } from '../sync/sync-recurring-banners.mjs';

const wiki = `
{{Banners cell
|type = standard
|no = 175
|start = 2026/09/11 04:00:00
|end = 2026/09/25 03:59:59
|operators = Five A, Six A, Five B, Six B, Five C}}
{{Banners cell
|type = kernel
|no = 61
|start = 2026/09/08 04:00:00
|end = 2026/09/22 03:59:59
|operators = Six C, Five D, Five E, Six D, Five F}}
`;

const wikiRows = parseRecurringWikiRows(wiki);
const roster = new Map([
  ['Six A', 6], ['Six B', 6], ['Six C', 6], ['Six D', 6],
  ['Five A', 5], ['Five B', 5], ['Five C', 5], ['Five D', 5], ['Five E', 5], ['Five F', 5],
]);
const characters = {
  six_c: { name: 'Six C' }, six_d: { name: 'Six D' },
  five_d: { name: 'Five D' }, five_e: { name: 'Five E' }, five_f: { name: 'Five F' },
};
const gachaTable = { gachaPoolClient: [
  { gachaPoolId: 'standard', gachaRuleType: 'DOUBLE', openTime: 1789124400, endTime: 1790333999 },
  { gachaPoolId: 'kernel', gachaRuleType: 'CLASSIC_DOUBLE', openTime: 1788865200, endTime: 1790074799,
    dynMeta: { main6RarityCharId: 'six_c', sub6RarityCharId: 'six_d', rare5CharList: ['five_d', 'five_e', 'five_f'] } },
] };

test('parses recurring rows and requires matching shipped client windows', () => {
  const result = reconcileRecurringBanners({ banners: [], gachaTable, characters, wikiRows, roster });
  assert.deepEqual(result.additions, ['Standard Pool #175 (Global)', 'Kernel #61 (Global)']);
  assert.deepEqual(result.banners[0].six_stars, ['Six A', 'Six B']);
  assert.equal(result.banners[0].global_window.startAt, '2026-09-11T11:00:00.000Z');
  assert.equal(result.banners[1].global_window.endAt, '2026-09-22T11:00:00.000Z');
});

test('does not add wiki rows before the Global client ships their window', () => {
  const result = reconcileRecurringBanners({ banners: [], gachaTable: { gachaPoolClient: [] }, characters, wikiRows, roster });
  assert.deepEqual(result.additions, []);
});

test('rejects a Kernel rate-up mismatch between sources', () => {
  const changed = structuredClone(gachaTable);
  changed.gachaPoolClient[1].dynMeta.rare5CharList[0] = 'five_a';
  characters.five_a = { name: 'Five A' };
  assert.throws(() => reconcileRecurringBanners({ banners: [], gachaTable: changed, characters, wikiRows, roster }), /disagree/);
});
