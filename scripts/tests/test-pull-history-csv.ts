import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerPulls, type PullHistory, type PullRecord } from '../../lib/account/pulls';
import { PULL_HISTORY_CSV_COLUMNS, pullHistoryCsv, pullHistoryCsvFilename, pullLabels } from '../../lib/account/pullHistoryCsv';
import type { GameAccountMap } from '../../lib/planner/gameAccount';

/* The imported Pull History as CSV (lib/account/pullHistoryCsv.ts): one row per pull, oldest first,
   with the names, rarities and pity the Account page shows. */
const pull = (at: number, pool: string, char: string, star: number | null = 3): PullRecord => ({ at, pool, char, star });
// Newest first, as the record keeps it: a single on S, a ten-pull (three rows here) on L, two singles on L.
const history: PullHistory = {
  rows: [
    pull(1790000500, 'S', 'char_six', 6),
    pull(1790000400, 'L', 'char_five', 5), pull(1790000400, 'L', 'char_six', 6), pull(1790000400, 'L', 'char_new', 4),
    pull(1790000200, 'L', 'char_three'),
    pull(1790000100, 'L', 'char_raw', null),
  ],
  pools: { L: 'Limited, "Rerun"', S: 'Pool S as Yostar names it', X: 'unused' },
  names: { char_new: 'New Operator', char_three: 'Yostar Three' },
  readAt: '2026-10-05T12:00:00.000Z',
  error: null,
};
const map = {
  chars: {
    char_six: { name: 'Młynar', rarity: 6, modules: {} },
    char_five: { name: 'Five Star', rarity: 5, modules: {} },
    char_three: { name: 'Three Star', rarity: 3, modules: {} },
  },
  pools: { S: 'Standard Banner' },
} as unknown as GameAccountMap;

const parse = (csv: string) => csv.slice(1).trimEnd().split('\r\n').map((line) => line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)!.slice(0, -1)
  .map((cell) => cell.replace(/,$/, '')).map((cell) => (cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell)));

test('one row per pull, oldest first, with a byte-order mark and CRLF lines, as the simulator\'s export writes', () => {
  const csv = pullHistoryCsv(history, map);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert(csv.endsWith('\r\n') && !/[^\r]\n/.test(csv));
  const [header, ...rows] = parse(csv);
  assert.deepEqual(header, [...PULL_HISTORY_CSV_COLUMNS]);
  assert.equal(rows.length, history.rows.length);
  assert.deepEqual(rows.map((row) => row[0]), ['1', '2', '3', '4', '5', '6']);
  // Unix seconds as ISO 8601 UTC, without milliseconds.
  assert.deepEqual(rows.map((row) => row[1]), ['2026-09-21T14:15:00Z', '2026-09-21T14:16:40Z', '2026-09-21T14:20:00Z', '2026-09-21T14:20:00Z', '2026-09-21T14:20:00Z', '2026-09-21T14:21:40Z']);
  // A ten-pull's rows reversed with the rest, as bannerPulls reads them.
  assert.deepEqual(rows.map((row) => row[4]), ['char_raw', 'Three Star', 'New Operator', 'Młynar', 'Five Star', 'Młynar']);
});

test('names and rarities are the page\'s: the id map first, then the Account Center, then the raw id', () => {
  const rows = parse(pullHistoryCsv(history, map)).slice(1);
  const labels = pullLabels(history, map);
  for (const [i, record] of [...history.rows].reverse().entries()) {
    assert.deepEqual([rows[i][2], rows[i][3], rows[i][4], rows[i][5]], [labels.bannerName(record.pool), record.pool, labels.operatorName(record), String(labels.rarity(record))]);
  }
  // The map's name beats the Account Center's, which beats the id; an unknown rarity reads 3.
  assert.deepEqual([labels.operatorName(pull(1, 'L', 'char_three')), labels.operatorName(pull(1, 'L', 'char_new')), labels.operatorName(pull(1, 'L', 'char_raw'))], ['Three Star', 'New Operator', 'char_raw']);
  assert.equal(labels.rarity(pull(1, 'L', 'char_raw', null)), 3);
  assert.equal(labels.rarity(pull(1, 'L', 'char_new', 4)), 4);
  // A banner by its record, else as Yostar names it, else its pool id.
  assert.deepEqual(['S', 'L', 'Z'].map(labels.bannerName), ['Standard Banner', 'Limited, "Rerun"', 'Z']);
});

test('pity counts per banner as the page\'s "since the last 6★" does, and the totals run on', () => {
  const rows = parse(pullHistoryCsv(history, map)).slice(1);
  // L: raw(1) three(2) new(3) six(4, counting itself) five(1); S: six(1).
  assert.deepEqual(rows.map((row) => [row[4], row[6]]), [['char_raw', '1'], ['Three Star', '2'], ['New Operator', '3'], ['Młynar', '4'], ['Five Star', '1'], ['Młynar', '1']]);
  // Each banner's latest row that is no six-star carries the number the page shows on its line.
  const shown = bannerPulls(history.rows, pullLabels(history, map).rarity);
  const latestOnL = rows.filter((row) => row[3] === 'L').at(-1)!;
  assert.equal(Number(latestOnL[6]), shown.find((banner) => banner.pool === 'L')!.sinceSix);
  assert.equal(shown.find((banner) => banner.pool === 'S')!.sinceSix, 0);
  // The ten-pull's rows are flagged; the singles are not.
  assert.deepEqual(rows.map((row) => row[7]), ['0', '0', '1', '1', '1', '0']);
  assert.deepEqual(rows.map((row) => [row[8], row[9]]), [['0', '0'], ['0', '0'], ['0', '0'], ['1', '0'], ['1', '1'], ['2', '1']]);
});

test('a name with a comma or a quote is quoted, and the file is named by the day it is saved', () => {
  const csv = pullHistoryCsv(history, map);
  assert(csv.includes(',"Limited, ""Rerun""",L,'));
  assert.equal(pullHistoryCsvFilename(new Date('2026-10-06T23:30:00Z')), 'arkpedia-pull-history-2026-10-06.csv');
  // No pulls: the header alone.
  assert.equal(pullHistoryCsv({ ...history, rows: [] }, map), `﻿${PULL_HISTORY_CSV_COLUMNS.join(',')}\r\n`);
});
