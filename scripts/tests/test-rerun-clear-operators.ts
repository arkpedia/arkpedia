import assert from 'node:assert/strict';
import { test } from 'node:test';
import operators from '../../data/rerun-clear-operators.json';
import accountMap from '../../data/game-account-map.json';
import eventRewards from '../../data/pull-event-rewards.json';
import medals from '../../data/rerun-clear-medals.json';
import { fillRerunActivities, rerunClearOperator } from '../../lib/pulls/schedule';
import { rerunsClearedByTicks, type PullEventReward } from '../../lib/pulls/pulls';

/*
 * data/rerun-clear-operators.json: for an event with no all-stages medal, the operator whose
 * ownership ticks its rerun (the owner's call, 2026-10-28: owning A Flurry to the Flame's
 * Rathalos S Noir Corne means the event was cleared; better to understate pulls than overstate).
 */
const entries = Object.entries(operators).filter(([key]) => key !== 'about') as [string, string][];

test('every entry names a real operator and an event that has no medal to read instead', () => {
  assert.ok(entries.length > 0);
  for (const [event, charId] of entries) {
    assert.ok((accountMap.chars as Record<string, unknown>)[charId], `${charId} is not an operator the import knows`);
    assert.equal((medals as Record<string, string>)[event], undefined, `${event} has a medal: read that instead`);
    assert.ok(eventRewards.some((reward) => reward.cnAct?.replace(/^act/, '').replace(/sre$/, 'side') === event), `${event} is no rerun the planner lists`);
  }
});

test('A Flurry to the Flame\'s rerun is ticked for an account that owns Rathalos S Noir Corne, and only then', () => {
  assert.equal(rerunClearOperator('act24sre'), 'char_1030_noirc2');
  assert.equal(rerunClearOperator('act42sre'), null, 'an event with a medal names no operator');
  assert.equal(rerunClearOperator('act24side'), null, 'not a rerun id');
  assert.equal(rerunClearOperator(null), null);
  const flurry = { name: '[Rerun] A Flurry to the Flame Rerun', event: '[Rerun] A Flurry to the Flame Rerun', rerun: true, op: 30, cnAct: 'act24sre' } as PullEventReward;
  const [filled] = fillRerunActivities([flurry]);
  assert.equal(filled.clearOperator, 'char_1030_noirc2', 'a release from before it was kept is filled per request');
  assert.equal(fillRerunActivities([{ ...flurry, clearOperator: null }])[0].clearOperator, null, 'a release that says none stays none');
  assert.deepEqual([...rerunsClearedByTicks([filled], [], new Set(), new Set(), {}, new Set(), new Set(['char_1030_noirc2']))], [flurry.name]);
  assert.deepEqual([...rerunsClearedByTicks([filled], [], new Set(), new Set(), {}, new Set(), new Set(['char_500_noirc']))], [], 'Noir Corne is not Rathalos S Noir Corne');
  assert.deepEqual([...rerunsClearedByTicks([filled], [], new Set(), null, undefined, null, null)], [], 'no account, no operators');
});
