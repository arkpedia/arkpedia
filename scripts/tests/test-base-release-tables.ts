import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_ROSTER_NAMES, checkBaseRosters, toBaseRosters, type BaseRosterData } from '../../lib/base/baseGroupRosters';
import { evalSkill } from './skill-eval-helper';

/*
 * /base counts group members from the rosters its props carry, not from Sets compiled
 * into its chunk. A made-up release table names a member the deployed data/ has never
 * heard of, and the skills count it.
 */
const empty = Object.fromEntries(BASE_ROSTER_NAMES.map(name => [name, [] as string[]])) as BaseRosterData;

test('a group member only the release\'s rosters list is counted by the skills that read the group', () => {
  const release = toBaseRosters({ ...empty, TEAM_RAINBOW: ['Blitz', 'Release Recruit'], BLACKSTEEL_WORLDWIDE: ['Release Courier'] });
  const ccNames = ['Blitz', 'Release Recruit'];
  assert.equal(evalSkill('Blitz', 'Team Rainbow', { rosters: release, ccNames }).cc.morale, 0.1);
  assert.equal(evalSkill('Blitz', 'Team Rainbow', { rosters: toBaseRosters(empty), ccNames }).cc.morale, 0);

  const roomNames = ['Surfer', 'Release Courier'];
  assert.ok(Math.abs(evalSkill('Surfer', 'Information Gathering', { rosters: release, roomNames }).clueSpeed - 0.3) < 1e-9);
  assert.ok(Math.abs(evalSkill('Surfer', 'Information Gathering', { rosters: toBaseRosters(empty), roomNames }).clueSpeed - 0.1) < 1e-9);
});

test('a roster table that disagrees with the rosters the calculations name fails where it is read', () => {
  assert.equal(checkBaseRosters(empty), empty);
  const { SAMI: _sami, ...withoutSami } = empty;
  assert.throws(() => checkBaseRosters(withoutSami), /Missing or not a list of names: SAMI/);
  assert.throws(() => checkBaseRosters({ ...empty, SAMI: 'Typhon' }), /SAMI/);
  assert.throws(() => checkBaseRosters({ ...empty, SAMII: [] }), /Not a roster any calculation reads: SAMII/);
  // In the browser a missing roster is only an empty one.
  assert.equal(toBaseRosters(withoutSami).SAMI.size, 0);
});
