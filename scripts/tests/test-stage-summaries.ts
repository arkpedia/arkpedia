import assert from 'node:assert/strict';
import { test } from 'node:test';
import indexData from '../../public/stages-index.json';
import { getStageSummaries, getStageSiblings } from '../../lib/stages/stages';
import { compareStageSummaries } from '../../lib/stages/stageSort';
import type { StageSummary } from '../../lib/stages/stageTypes';

test('cached stage ordering preserves the full index and independent caller arrays', () => {
  const expected = (indexData as StageSummary[]).slice().sort(compareStageSummaries);
  const first = getStageSummaries();
  assert.deepEqual(first, expected);
  first.reverse();
  first.pop();
  assert.deepEqual(getStageSummaries(), expected);
  const stage = expected.find((entry) => entry.contentId);
  assert.ok(stage);
  assert.deepEqual(getStageSiblings(stage.slug), expected.filter((entry) => entry.contentId === stage.contentId));
  assert.deepEqual(getStageSiblings('not-a-real-stage'), []);
});
