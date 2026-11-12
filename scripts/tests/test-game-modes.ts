import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkGameModes, classifyActivity, challengeLabels } from '../../lib/stages/gameModes.mjs';
import { sceneForContent } from '../../lib/stages/stageTypes';
import { raMapData, RA_SURVEYED_SEASON } from '../../lib/stages/raMap';
import { actMark } from '../../lib/stages/actMarks';
import { getSeasonalChallenge } from '../../lib/stages/terminal';
import assetIndex from '../../data/assets/public-asset-index.json';

/*
 * Game structure the stage pages used to hard-code, each of which failed quietly or needed
 * an app commit (a deploy) when the game added a season or a mode:
 *   - the import's own exclusions kept their activity types in a Set, so a new mode
 *     (a MULTIPLAY_V4) was listed as an ordinary event, with no alert;
 *   - Seasonal Challenge and sceneForContent knew the challenge modes only as 'VEC', 'TN';
 *   - raMapData() returned season 1's survey for any Reclamation Algorithm season;
 *   - the Score page called any act past III "Act initium".
 * The first two are data/game-modes.json now, which arkpedia-data's importer writes and holds
 * (its scripts/build/build-mode-exclusions.mjs, whose own test lives beside it).
 */
const record = JSON.parse(fs.readFileSync('data/game-modes.json', 'utf8'));

test('the committed game-modes record is well formed and names only marks the asset index has', () => {
  const modes = checkGameModes(record);
  assert.deepEqual(challengeLabels(modes), ['VEC', 'TN']);
  const files = new Set<string>(assetIndex.files);
  for (const { label, mark } of modes.seasonalChallenges) {
    if (mark) assert.ok(files.has(`mode-marks/${mark}`), `${label}'s mark mode-marks/${mark} is not a published asset`);
  }
});

test('a malformed game-modes record is refused, naming what is wrong', () => {
  const broken = (patch: Record<string, unknown>) => () => checkGameModes({ ...structuredClone(record), ...patch });
  assert.throws(broken({ version: 2 }), /not a version 1 record/);
  assert.throws(broken({ excludedActivityTypes: ['MULTIPLAY'] }), /excludedActivityTypes/);
  assert.throws(broken({ excludedActivityTypes: { 'multiplay v4': 'lower case' } }), /excludedActivityTypes/);
  assert.throws(broken({ seasonalChallenges: [{ label: 'TN', name: 'Trials', activityTypes: [], mark: null }] }), /seasonalChallenges/);
  assert.throws(broken({ seasonalChallenges: [
    { label: 'TN', name: 'A', activityTypes: ['BOSS_RUSH'], mark: null },
    { label: 'TN', name: 'B', activityTypes: ['BOSS_RUSH_V2'], mark: null },
  ] }), /label twice/);
  assert.throws(broken({ seasonalChallenges: [{ label: 'X', name: 'X', activityTypes: ['APRIL_FOOL'], mark: null }] }), /APRIL_FOOL under both/);
  assert.throws(broken({ storyActivityTypes: '(' }), /not a pattern/);
});

test('every activity type is excluded, a challenge, a story episode, or unknown', () => {
  const modes = checkGameModes(record);
  assert.equal(classifyActivity('APRIL_FOOL', modes).as, 'excluded');
  const tn = classifyActivity('BOSS_RUSH', modes);
  assert.equal(tn.as, 'challenge');
  assert.equal(tn.challenge?.label, 'TN');
  assert.equal(classifyActivity('VEC_BREAK_V2', modes).challenge?.label, 'VEC');
  for (const story of ['TYPE_ACT52SIDE', 'TYPE_ACT9D0', 'MINISTORY']) assert.equal(classifyActivity(story, modes).as, 'story', story);
  // A mode nobody has classified yet: the case that used to pass as an ordinary event.
  assert.equal(classifyActivity('MULTIPLAY_V4', modes).as, 'unknown');
  // Own keys only: an Object.prototype name is not an excluded type.
  assert.equal(classifyActivity('toString', modes).as, 'unknown');
});

test('the Seasonal Challenge scene is the record\'s challenge modes, and every content they claim routes there', () => {
  const { challenges } = getSeasonalChallenge();
  assert.deepEqual(challenges.map((c) => c.label), challengeLabels(checkGameModes(record)));
  for (const mode of challenges) {
    assert.ok(mode.cards.length > 0, `${mode.name} has no seasons in the dataset`);
    assert.ok(mode.cards.every((c) => c.label === mode.label));
  }
  const labels = challengeLabels(checkGameModes(record));
  assert.equal(sceneForContent('event', 'TN', labels).key, 'seasonal');
  assert.equal(sceneForContent('event', 'VEC', labels).key, 'seasonal');
  // A challenge mode added to the record routes without a code change.
  assert.equal(sceneForContent('event', 'NEW', [...labels, 'NEW']).key, 'seasonal');
  assert.equal(sceneForContent('event', 'PA', labels).key, 'score');
});

test('a Reclamation Algorithm season draws only its own survey', () => {
  const surveyed = raMapData(RA_SURVEYED_SEASON);
  assert.ok(surveyed && surveyed.maps.length > 0, 'the committed survey is sandbox_1\'s');
  // A second season has no survey yet: no map, rather than season 1's.
  assert.equal(raMapData('sandbox_2'), null);
  assert.equal(raMapData('sandbox_x'), null);
});

test('an act the Score page has no wordmark for gets none, not initium\'s', () => {
  assert.deepEqual(actMark(0), { file: 'initium', label: 'initium' });
  assert.deepEqual(actMark(3), { file: 'iii', label: 'III' });
  assert.equal(actMark(4), null);
  assert.equal(actMark(-1), null);
});
