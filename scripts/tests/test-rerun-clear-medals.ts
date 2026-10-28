import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error the build script is plain JavaScript without a declaration file
import { buildRerunClearMedals, ALL_STAGES_THREE_STARS } from '../build/build-rerun-clear-medals.mjs';
import medals from '../../data/rerun-clear-medals.json';
import { fillRerunActivities, rerunClearMedal } from '../../lib/pulls/schedule';
import { rerunsClearedByTicks } from '../../lib/pulls/pulls';
import type { PullEventReward } from '../../lib/pulls/pulls';

test('data/rerun-clear-medals.json is the published medal catalogue\'s all-stages medals (npm run build:rerun-clear-medals)', () => {
  const catalogue = JSON.parse(fs.readFileSync('public/medal-catalogue.json', 'utf8'));
  assert.deepEqual(medals, buildRerunClearMedals(catalogue));
  assert.ok(Object.keys(medals).length >= 39, 'every recent event set has one');
  assert.equal(medals['42side'], 'medal_activity_42side_04', "The Masses' Travels: 'Lateran Newborn'");
  assert.ok(ALL_STAGES_THREE_STARS.test('Complete all stages in [A Glance at the Shrine] with 3-star ratings (excluding tutorials)'));
  assert.ok(!ALL_STAGES_THREE_STARS.test('Complete all stages in [Rest in Peace] on Challenge Mode'));
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
