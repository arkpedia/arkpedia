import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerPulls, mergePulls, parsePullHistory, pullSessions, rarityCounts, type PullRecord } from '../../lib/account/pulls';
import { parseAccount } from '../../lib/account/accountStore';
import { bannerPoolNames } from '../../lib/gacha/bannerPools';
import type { PullRow } from '../../lib/account-import/yostar';

/* The pull history the account record keeps (lib/account/pulls.ts): Yostar lists only 90 days,
   so an import adds to it, a ten-pull at a time. */
const row = (at: number, poolId: string, charId: string, star = 3): PullRow => ({ at, poolId, poolName: `Pool ${poolId}`, charId, charName: charId, star });
const tenPull = (at: number, poolId: string, chars: string[]) => chars.map((char) => row(at, poolId, char));
const NOW = new Date('2026-10-05T12:00:00Z');

test('an import adds the pulls it read to those kept, replacing each ten-pull it has whole', () => {
  // The first import: one ten-pull on L, one single on S.
  const first = mergePulls(undefined, { rows: [row(300, 'S', 'char_a'), ...tenPull(200, 'L', ['char_b', 'char_b', 'char_c'])], error: null }, NOW)!;
  assert.deepEqual(first.rows.map((pull) => `${pull.at} ${pull.pool} ${pull.char}`), ['300 S char_a', '200 L char_b', '200 L char_b', '200 L char_c']);
  assert.deepEqual([first.pools, first.readAt, first.error], [{ S: 'Pool S', L: 'Pool L' }, NOW.toISOString(), null]);
  // Ninety days on, the Account Center no longer lists the single, lists the ten-pull in another
  // order, and has a new one. The single is kept, the ten-pull is not doubled, the new one joins.
  const second = mergePulls(first, { rows: [...tenPull(400, 'L', ['char_d']), ...tenPull(200, 'L', ['char_c', 'char_b', 'char_b'])], error: null }, NOW)!;
  assert.deepEqual(second.rows.map((pull) => `${pull.at} ${pull.pool} ${pull.char}`), ['400 L char_d', '300 S char_a', '200 L char_c', '200 L char_b', '200 L char_b']);
  // Two copies of one operator in a ten-pull stay two.
  assert.equal(second.rows.filter((pull) => pull.at === 200 && pull.char === 'char_b').length, 2);
});

test('a read that failed keeps every pull and says why; an import that did not ask changes nothing', () => {
  const kept = mergePulls(undefined, { rows: [row(100, 'L', 'char_a')], error: null }, NOW)!;
  const failed = mergePulls(kept, { rows: null, error: 'the Account Center answered HTTP 500' }, new Date('2026-10-06T00:00:00Z'))!;
  assert.deepEqual([failed.rows, failed.readAt, failed.error], [kept.rows, kept.readAt, 'the Account Center answered HTTP 500']);
  // A file import (no read at all) leaves the history as it was, and none stays none.
  assert.equal(mergePulls(kept, null), kept);
  assert.equal(mergePulls(undefined, null), undefined);
  // A first import whose read failed still records the failure, so the page can say so.
  assert.deepEqual(mergePulls(undefined, { rows: null, error: 'x' }, NOW), { rows: [], pools: {}, names: {}, readAt: null, error: 'x' });
});

test("the page's summaries: presses, each banner with what it gave and the pulls since its last six-star, the rarity counts", () => {
  const history = mergePulls(undefined, { rows: [
    ...tenPull(500, 'L', ['char_5', 'char_3', 'char_3']),
    row(400, 'S', 'char_6'),
    ...tenPull(300, 'L', ['char_6', 'char_3']),
    row(100, 'L', 'char_3'),
  ], error: null }, NOW)!;
  const rarity = (pull: PullRecord) => Number(pull.char.slice(5));
  assert.deepEqual(pullSessions(history.rows).map((session) => [session.at, session.pool, session.rows.length]), [[500, 'L', 3], [400, 'S', 1], [300, 'L', 2], [100, 'L', 1]]);
  const [limited, single] = bannerPulls(history.rows, rarity);
  assert.deepEqual([limited.pool, limited.pulls, limited.first, limited.last, limited.six.length, limited.five.length], ['L', 6, 100, 500, 1, 1]);
  // The list is newest first, a ten-pull's rows too: in 300's, char_6 was its later pull, so only
  // 500's three came after the six-star.
  assert.equal(limited.sinceSix, 3);
  assert.deepEqual([single.pool, single.sinceSix], ['S', 0]);
  assert.deepEqual(rarityCounts(history.rows, rarity), { total: 7, six: 2, five: 1, four: 0, three: 4 });
});

test('a stored history is read back, and anything malformed in it is dropped', () => {
  const history = mergePulls(undefined, { rows: [row(100, 'L', 'char_a', 6)], error: null }, NOW)!;
  const record = { version: 1, server: 'en', importedAt: NOW.toISOString(), doctor: null, operators: [], skins: [], cleared: [], pulls: history };
  assert.deepEqual(parseAccount(JSON.stringify(record))?.pulls, history);
  // A record from before the history has none; a broken one is not a history.
  assert.equal(parseAccount(JSON.stringify({ ...record, pulls: undefined }))?.pulls, undefined);
  assert.equal(parsePullHistory({ rows: 'no' }), undefined);
  assert.deepEqual(parsePullHistory({ rows: [{ at: 1, pool: 'L', char: 'char_a', star: 4 }, { at: -1, pool: 'L', char: 'x' }, { at: 2, pool: '<b>', char: 'x' }], pools: { L: 'Limited', '<i>': 'x' } }),
    { rows: [{ at: 1, pool: 'L', char: 'char_a', star: 4 }], pools: { L: 'Limited' }, names: {}, readAt: null, error: null });
});

test('a banner is named by the record that holds its Global pool, the first if two do', () => {
  assert.deepEqual(bannerPoolNames([
    { name: '[Carnival] Hanabi Exiled', globalPoolId: 'LIMITED_EN_37_0_5' },
    { name: 'No pool yet', globalPoolId: null },
    { name: 'A rerun record', globalPoolId: 'LIMITED_EN_37_0_5' },
    { name: 'Odd', globalPoolId: 'not an id!' },
  ]), { LIMITED_EN_37_0_5: '[Carnival] Hanabi Exiled' });
});
