import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeOperatorExtras } from '../../lib/operators/operatorExtras';

test('complete published extras do not read source files absent from Workers', async () => {
  const page = { chibis: {}, summons: [], epTrack: null, label: 'published' };
  const unavailable = async (): Promise<never> => { throw new Error('Worker source filesystem unavailable'); };
  const result = await completeOperatorExtras(page, { chibis: unavailable, summons: unavailable, epTrack: unavailable });
  assert.deepEqual(result, page);
  assert.equal(result.chibis, page.chibis);
  assert.equal(result.summons, page.summons);
});

test('historical props backfill missing extras once and retain unrelated fields', async () => {
  const calls: string[] = [];
  const epTrack = { id: 'test-track', title: 'Test track', copyright: false };
  const result = await completeOperatorExtras({ label: 'historical', chibis: undefined, summons: undefined, epTrack: undefined }, {
    chibis: async () => { calls.push('chibis'); return {}; },
    summons: async () => { calls.push('summons'); return []; },
    epTrack: async () => { calls.push('ep'); return epTrack; },
  });
  assert.deepEqual(calls, ['chibis', 'summons', 'ep']);
  assert.deepEqual(result, { label: 'historical', chibis: {}, summons: [], epTrack });
});

test('partial older props load only the missing field and preserve explicit no-EP', async () => {
  const unavailable = async (): Promise<never> => { throw new Error('Unnecessary source read'); };
  let calls = 0;
  const result = await completeOperatorExtras({ chibis: {}, epTrack: null }, {
    chibis: unavailable, epTrack: unavailable,
    summons: async () => { calls++; return []; },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { chibis: {}, summons: [], epTrack: null });
});
