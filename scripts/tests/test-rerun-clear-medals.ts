import assert from 'node:assert/strict';
import { test } from 'node:test';
import medals from '../../data/rerun-clear-medals.json';
import { fillRerunActivities, rerunClearMedal } from '../../lib/pulls/schedule';
import { rerunsClearedByTicks } from '../../lib/pulls/pulls';
import type { PullEventReward } from '../../lib/pulls/pulls';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';

/* data/rerun-clear-medals.json is pulled from arkpedia-data, whose importer builds it from the
   medal catalogue and holds it to that (its scripts/tests/test-rerun-clear-medals.ts). */

test('the pulled record carries a medal for every recent event set', () => {
  assert.ok(Object.keys(medals).length >= 39);
  assert.equal(medals['42side'], 'medal_activity_42side_04', "The Masses' Travels: 'Lateran Newborn'");
});

test('a rerun names its event\'s medal by the game\'s ids, and an account that holds it is cleared', () => {
  assert.equal(rerunClearMedal('act42sre'), 'medal_activity_42side_04');
  assert.equal(rerunClearMedal('act44sre'), 'medal_activity_44side_07', 'the medal is not always the fourth of its set');
  assert.equal(rerunClearMedal('act5sre'), null, 'an old rerun of act11d0 names no set');
  assert.equal(rerunClearMedal('act42side'), null, 'not a rerun id');
  assert.equal(rerunClearMedal(null), null);
  const masses = { name: "[Rerun] The Masses' Travels Rerun", event: "[Rerun] The Masses' Travels Rerun", rerun: true, op: 41, cnAct: 'act42sre' } as PullEventReward;
  const ato = { ...masses, name: '[Rerun] Ato Rerun', event: '[Rerun] Ato Rerun', cnAct: 'act44sre' } as PullEventReward;
  // A release from before the medal was kept: the deployment fills it per request.
  const [filledMasses, filledAto] = fillRerunActivities([masses, ato]);
  assert.equal(filledMasses.clearMedal, 'medal_activity_42side_04');
  assert.equal(filledAto.clearMedal, 'medal_activity_44side_07');
  assert.equal(fillRerunActivities([{ ...masses, clearMedal: null }])[0].clearMedal, null, 'a release that says none stays none');
  const owned = new Set(['medal_activity_42side_04', 'medal_activity_44side_02']);
  assert.deepEqual([...rerunsClearedByTicks([filledMasses, filledAto], [], new Set(), new Set(), {}, owned)], [masses.name], "Ato's free-operator medal is not its all-stages medal");
  assert.deepEqual([...rerunsClearedByTicks([filledMasses, filledAto], [], new Set(), null, undefined, null)], [], 'no account, no medals');
});

test('Masses stage records override its medal, including an imported event with no completed stages', () => {
  const event = fillRerunActivities([{ name: "[Rerun] The Masses' Travels Rerun", rerun: true, op: 41, cnAct: 'act42sre' } as PullEventReward])[0];
  const costs = { act42side_01: 9, act42side_02: 9 };
  const map = { version: 1 as const, chars: {} };
  const medal = new Set([event.clearMedal!]);
  const imported = (stages: Record<string, { state: number }>) => parseAccount(JSON.stringify(accountFromGame({ dungeon: { stages } }, map, 'en')))!;
  const detect = (stages: Record<string, { state: number }>, medals = medal) => {
    const account = imported(stages);
    return [...rerunsClearedByTicks([event], [], new Set(), new Set(account.rewardCleared), costs, medals, null, new Set(account.recordedStages))];
  };
  assert.deepEqual(detect({ act42side_01: { state: 0 }, act42side_02: { state: 1 } }), [], 'uncompleted records take priority over the medal');
  assert.deepEqual(detect({ act42side_01: { state: 3 }, act42side_02: { state: 2 } }), [], 'a two-star clear does not award first-clear OP');
  assert.deepEqual(detect({ act42side_01: { state: 3 } }), [], 'a partial event record cannot fall through to the medal');
  assert.deepEqual(detect({ act42side_01: { state: 3 }, act42side_02: { state: 3 } }, new Set()), [event.name], 'complete stages work without a medal');
  assert.deepEqual(detect({ main_01: { state: 3 } }), [event.name], 'unrelated stage records do not block the medal fallback');
  assert.deepEqual(detect({}), [event.name], 'closed event records are absent, so use its medal');
  assert.deepEqual([...rerunsClearedByTicks([event], [], new Set(), new Set(['act42side_01']), costs, medal)], [], 'older imports can establish event presence from their clears');
});

test('imported uncleared stages also take priority over operator and tracker completion fallbacks', () => {
  const event = { name: 'Rerun', event: 'Rerun', rerun: true, cnAct: 'act42sre', clearOperator: 'char_welfare' } as PullEventReward;
  const playable = [{ id: 'event', name: 'Rerun' }];
  const costs = { act42side_01: 9 };
  const operators = new Set(['char_welfare']);
  assert.deepEqual([...rerunsClearedByTicks([event], playable, new Set(['event']), new Set(), costs, null, operators, new Set(['act42side_01']))], []);
  assert.deepEqual([...rerunsClearedByTicks([event], playable, new Set(['event']), new Set(), costs, null, operators, new Set())], [event.name]);
});
