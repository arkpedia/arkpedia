import assert from 'node:assert/strict';
import test from 'node:test';
import { isOperatorReleased, operatorRelease, operatorReleaseLabel } from '../../lib/operators/operatorAvailability';
import { getAllOperators } from '../../lib/operators/operators';
import { portraitStatus } from '../../lib/operators/operatorPortrait';
import { OPERATOR_NAME_ALIASES_VERSION, type SearchableOperatorRecord } from '../../lib/operators/operatorSearch';
import { buildOperatorNameAliases } from '../lib/operator-name-aliases';
import operatorSearch from '../../public/operator-search.json';

const opening = Date.parse('2026-09-16T15:00:00Z');
test('official release corrections cover the complete batch including the welfare operator', () => {
  for (const name of ['Zima the Raging Tide', 'Ukusik', 'Botani']) {
    const op = getAllOperators().find(op => op.name === name)!;
    assert.equal(op.characterInfo?.['Release Date'], '2026/09/16');
    assert.equal(operatorRelease(op)?.at, opening);
    assert.equal(operatorReleaseLabel(op, opening - 1), 'In 1m');
    assert.equal(operatorReleaseLabel(op, opening), null);
    assert.equal(operatorReleaseLabel(op, opening - 4 * 3600000), 'In 4h');
    assert.equal(isOperatorReleased({ ...op, isFuture: false }, opening - 1), false, 'exact time overrides a stale false flag');
    assert.equal(isOperatorReleased({ ...op, isFuture: true }, opening), true, 'exact time overrides a stale true flag');
  }
});
test('release instants and date-only safeguards are independent of user timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Europe/Zurich', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo', 'Asia/Shanghai', 'Pacific/Auckland', 'Pacific/Honolulu']) {
      process.env.TZ = zone;
      const exact = { releaseAt: '2026-09-16T08:00:00-07:00', characterInfo: { 'Release Date': '2026/09/10' } };
      assert.equal(operatorRelease(exact)?.at, opening, zone);
      assert.equal(operatorReleaseLabel(exact, opening - 1), 'In 1m', zone);
      assert.equal(operatorReleaseLabel(exact, opening), null, zone);
      const dateOnly = { characterInfo: { 'Release Date': '2026/09/16' } };
      assert.equal(operatorReleaseLabel(dateOnly, opening), 'Releases today', zone);
      assert.equal(operatorReleaseLabel(dateOnly, Date.parse('2026-09-17T07:00:00Z')), null, zone);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('unknown or invalid release dates do not imply availability', () => {
  for (const date of ['', 'N/A', '2026/02/30']) assert.equal(operatorRelease({ characterInfo: { 'Release Date': date } }), null);
  assert.equal(operatorRelease({ releaseAt: '2026-09-16T08:00:00' }), null);
  assert.ok(operatorRelease({ characterInfo: { 'Release Date': 'October 24, 2023' } }));
  assert.equal(isOperatorReleased({ isFuture: true }, opening), false);
  assert.equal(isOperatorReleased({ isFuture: false }, opening), true);
});

test('the shared operator search catalogue uses the current release source', () => {
  // No release state: a record is drawn from its name, rarity and portraitStatus. The isFuture
  // it used to carry was judged by the clock of its build, and nothing read it. portraitStatus
  // as build-operator-search.ts writes it: left out here, the test held while every portrait was
  // published, and failed the content run of 2026-10-15, whose asset pin lacked the art Global
  // had renamed (GALLUS², Kal'tsit Esperanta) -- portraits check-completeness holds anyway.
  const records = getAllOperators();
  const names = buildOperatorNameAliases(records);
  // Check also runs against the preceding live snapshot during a deployment.
  const index = operatorSearch as { operators: SearchableOperatorRecord[]; operatorNameAliasesVersion?: number };
  const hasAliases = index.operatorNameAliasesVersion === OPERATOR_NAME_ALIASES_VERSION;
  const expected = records.map((operator) => ({
    name: operator.name,
    rarity: operator.rarity,
    ...(hasAliases && names[operator.name].length ? { aliases: names[operator.name] } : {}),
    ...portraitStatus(operator),
    ...(operator.sourceRegion ? { sourceRegion: operator.sourceRegion } : {}),
  }));
  const actual = index.operators.map(({ aliases, ...op }) => ({ ...op, ...(hasAliases && aliases ? { aliases } : {}) }));
  assert.deepEqual(actual, expected);
});
