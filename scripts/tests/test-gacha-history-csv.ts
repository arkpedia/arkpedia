import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HISTORY_CSV_COLUMNS, historyCsvFilename, pullHistoryCsv } from '../../lib/gacha/historyCsv';
import type { PulledItem } from '../../lib/gacha/gachaTypes';

const pulled = (name: string, rarity: PulledItem['rarity'], extra: Partial<PulledItem> = {}): PulledItem => ({ name, icon: null, rarity, isFeatured: false, ...extra });
const rows = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n').map((line) => line.split(','));

test('the pull history exports one row per operator, oldest first, in columns a spreadsheet charts', () => {
  const history = [pulled('Fang', 3), pulled('Texas', 5), pulled('Surtr', 6, { isFeatured: true }), pulled('Lancet-2', 3), pulled('Exusiai', 6, { featuredGuaranteeEvent: 'guarantee' })];
  const [head, ...body] = rows(pullHistoryCsv(history, { name: 'Test Banner', type: 'featured' }));
  assert.deepEqual(head, [...HISTORY_CSV_COLUMNS]);
  assert.deepEqual(body.map((row) => [row[0], row[1], row[2], row[3], row[6], row[7], row[8], row[9]]), [
    ['1', 'Fang', '3', '0', '0', '1', '0', '0'],
    ['2', 'Texas', '5', '0', '0', '2', '0', '1'],
    // The pity column counts the pulls a six-star took, itself included, then starts over.
    ['3', 'Surtr', '6', '1', '0', '3', '1', '1'],
    ['4', 'Lancet-2', '3', '0', '0', '1', '1', '1'],
    ['5', 'Exusiai', '6', '0', '1', '2', '2', '1'],
  ]);
  assert.deepEqual([body[0][10], body[0][11]], ['Test Banner', 'featured']);
});

test('a guaranteed bonus shares its pull number and adds no pity; names with commas or quotes are quoted', () => {
  const csv = pullHistoryCsv([pulled('Lancet-2', 3), pulled('Ch\'en, the "Holungday"', 6, { isBonus: true }), pulled('Fang', 3)], { name: 'Limited, Rerun', type: 'limited' });
  assert.ok(csv.startsWith('﻿'), 'UTF-8 for spreadsheets');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[2], '1,"Ch\'en, the ""Holungday""",6,0,0,1,0,,1,0,"Limited, Rerun",limited');
  assert.equal(lines[3].split(',').slice(0, 1).join(), '2');
  assert.equal(lines[3].split(',')[7], '2', 'the bonus did not reset the count of real pulls');
});

test('the file is named for the banner and the day', () => {
  assert.equal(historyCsvFilename('[Limited] Ashes to Ashes, Ages on Ages', new Date('2026-10-06T12:00:00Z')), 'arkpedia-pulls-limited-ashes-to-ashes-ages-on-ages-2026-10-06.csv');
  assert.equal(historyCsvFilename('海渊巡游', new Date('2026-10-06T12:00:00Z')), 'arkpedia-pulls-banner-2026-10-06.csv');
});
