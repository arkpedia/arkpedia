import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkGameModes, classifyActivity, challengeLabels } from '../../lib/stages/gameModes.mjs';
import { sceneForContent } from '../../lib/stages/stageTypes';
import { raMapData, RA_SURVEYED_SEASON } from '../../lib/stages/raMap';
import { actMark } from '../../lib/stages/actMarks';
import { getSeasonalChallenge } from '../../lib/stages/terminal';
import assetIndex from '../../data/assets/public-asset-index.json';

/*
 * Game structure the stage pages used to hard-code, each of which failed quietly or needed
 * an app commit (a deploy) when the game added a season or a mode:
 *   - build-mode-exclusions.mjs kept its excluded activity types in a Set, so a new mode
 *     (a MULTIPLAY_V4) was listed as an ordinary event, with no alert;
 *   - Seasonal Challenge and sceneForContent knew the challenge modes only as 'VEC', 'TN';
 *   - raMapData() returned season 1's survey for any Reclamation Algorithm season;
 *   - the Score page called any act past III "Act initium".
 * The first two are data/game-modes.json now, held by build-mode-exclusions.
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

test('build-mode-exclusions excludes by the record and holds an unclassified mode and a mislabelled challenge', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-modes-'));
  try {
    const write = (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    };
    write('en/gamedata/excel/activity_table.json', { basicInfo: {
      act99side: { type: 'TYPE_ACT99SIDE' },
      act9multi: { type: 'MULTIPLAY_V4' },
      act7bossrush: { type: 'BOSS_RUSH' },
      act8bossrush: { type: 'BOSS_RUSH' },
      act1lock: { type: 'INTERLOCK' },
      act3mainss: { type: 'TYPE_MAINSS' },
    } });
    write('data/stages-content.json', {
      act99side: { kind: 'event', name: 'A Side Story', label: 'SS' },
      act9multi: { kind: 'event', name: 'A New Mode', label: '' },
      act7bossrush: { kind: 'event', name: 'Trials #7', label: 'TX' },
      act8bossrush: { kind: 'event', name: 'Trials #8', label: 'TN' },
      act1lock: { kind: 'event', name: 'Hymnoi Wisdom', label: '' },
      // Main-story kind: not listed as an event, so an unclassified type is not held.
      act3mainss_zone1: { kind: 'story', name: 'A Main Story Side', label: '' },
      guide_1: { kind: 'guide', name: '???', label: '' },
    });
    write('data/stages/level_act1lock_a-01.json', { content: { id: 'act1lock' } });
    write('data/stages/level_act1lock_a-02.json', { content: { id: 'act1lock' } });
    fs.copyFileSync('data/game-modes.json', path.join(root, 'data/game-modes.json'));
    const run = spawnSync(process.execPath, [path.resolve('scripts/build/build-mode-exclusions.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ARKPEDIA_EN: path.join(root, 'en'), ARKPEDIA_NOW: '2026-09-26T00:00:00Z' },
    });
    assert.equal(run.status, 0, run.stderr);
    const excluded = JSON.parse(fs.readFileSync(path.join(root, 'data/excluded-contents.json'), 'utf8'));
    assert.deepEqual(excluded, {
      act1lock: { name: 'Hymnoi Wisdom', type: 'INTERLOCK', stages: 2 },
      guide_1: { name: '???', type: 'guide', stages: 0 },
    });
    const held = JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')).entries;
    assert.deepEqual(held.map((e: { key: string; stage: string; action: string }) => [e.stage, e.key, e.action]), [
      ['mode-exclusions', 'activity-type:act9multi', 'published-partial'],
      ['mode-exclusions', 'challenge-label:act7bossrush', 'published-partial'],
    ]);
    // The reason names the type, so the daily issue says what to classify.
    assert.match(held[0].reason, /MULTIPLAY_V4/);
    assert.match(run.stderr, /activity-type:act9multi/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
