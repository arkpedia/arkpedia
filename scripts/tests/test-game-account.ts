import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGameAccountMap } from '../build/build-game-account-map';
import { checkGameAccountMap, readGameAccount } from '../../lib/planner/gameAccount';
import { describeTransfer } from '../../lib/planner/transfer';
import gameAccountMap from '../../data/game-account-map.json';

// Two records and the client's view of them, as small as the rules need.
const records = [
  { name: 'Fiammetta', rarity: 6, internalName: 'char_300_phenxi',
    modules: [{ type: 'Original', name: 'Badge' }, { type: 'Upgrade', name: 'ART-X: A Long Journey' }, { type: 'Upgrade', name: 'ART-Y: "Out-Law" Surplus' }],
    skills: { skillList: [{ name: '"Provocate"' }, { name: 'Embers' }] } },
  { name: 'Raidian', internalName: 'char_4145_radian',
    modules: [{ type: 'Original', name: 'Badge' }, { type: 'Upgrade', name: 'SO-α: First' }, { type: 'Upgrade', name: 'SO-β: Second' }],
    skills: { skillList: [{ name: 'One' }] } },
];
const tables = {
  uniequip: {
    // The client lists modules in release order: Fiammetta's Y first.
    charEquip: { char_300_phenxi: ['uniequip_001_phenxi', 'uniequip_002_phenxi', 'uniequip_003_phenxi'], char_4145_radian: ['uniequip_001_radian', 'uniequip_002_radian', 'uniequip_003_radian'] },
    equipDict: {
      uniequip_001_phenxi: { type: 'INITIAL', typeName1: 'ORIGINAL', typeName2: null },
      uniequip_002_phenxi: { type: 'ADVANCED', typeName1: 'ART', typeName2: 'Y' },
      uniequip_003_phenxi: { type: 'ADVANCED', typeName1: 'ART', typeName2: 'X' },
      uniequip_001_radian: { type: 'INITIAL', typeName1: 'ORIGINAL', typeName2: null },
      uniequip_002_radian: { type: 'ADVANCED', typeName1: 'SO', typeName2: 'A' },
      uniequip_003_radian: { type: 'ADVANCED', typeName1: 'SO', typeName2: 'B' },
    },
  },
  characters: { char_300_phenxi: { skills: [{ skillId: 'p1' }, { skillId: 'p2' }], nationId: 'yan' }, char_4145_radian: { skills: [{ skillId: 'r1' }], nationId: 'lgd' } },
  skills: { p1: { levels: [{ name: "'Provocate'" }] }, p2: { levels: [{ name: 'Embers' }] }, r1: { levels: [{ name: 'One' }] } },
};

test('the map places a module by its type code, whatever order the client lists it in', () => {
  const map = buildGameAccountMap(records, tables);
  // global: the client has the operator, which the account page counts.
  assert.deepEqual(map.chars.char_300_phenxi, { name: 'Fiammetta', rarity: 6, modules: { uniequip_002_phenxi: 1, uniequip_003_phenxi: 0 }, global: true });
  // The profile card's names, from the display and medal tables.
  const named = buildGameAccountMap(records, { ...tables, displayMeta: { nameCardV2Data: { skinData: { nc_moon_1: { name: 'An Invitation to Moons', themeEnName: 'An invitation to moons' }, nc_rhodes_default: { name: 'Rhodes Island', themeEnName: '', isSpTheme: false }, nc_avemujica_1: { name: 'The Eternal Show', themeEnName: 'The Eternal Show', isSpTheme: true, skinTmplCnt: 5 } } } },
    medalTable: { medalList: [{ medalId: 'medal_a', medalName: 'A Medal' }, { medalId: 'medal_b' }] },
    teams: { none: { powerLevel: 0, powerName: 'No team', orderNum: 0 }, yan: { powerLevel: 0, powerName: 'Yan', orderNum: 2 }, rhodes: { powerLevel: 0, powerName: 'Rhodes Island', orderNum: 1 }, lgd: { powerLevel: 1, powerName: 'Lungmen Guard Department', orderNum: 3 } } });
  assert.deepEqual([named.nameCards, named.nameCardThemes, named.medals], [{ nc_avemujica_1: 'The Eternal Show', nc_moon_1: 'An Invitation to Moons', nc_rhodes_default: 'Rhodes Island' }, { nc_avemujica_1: 'The Eternal Show', nc_moon_1: 'An invitation to moons' }, { medal_a: 'A Medal' }]);
  // A style's variants, and the styles with no theme (the assistant shows instead).
  assert.deepEqual([named.nameCardVariants, named.nameCardPlain], [{ nc_avemujica_1: 5 }, ['nc_rhodes_default']]);
  // Each theme's colours, as the importer read them; a malformed one is left out.
  const coloured = buildGameAccountMap(records, { ...tables, styles: {
    nc_avemujica_1: { md5: 'x', theme: '#c41c55', themeText: '#ffffff', panel: '#191919d9', panelText: '#ffffffb2', panelIcon: '#ffffff4c' },
    nc_broken: { theme: 'red', themeText: '#ffffff', panel: '#000000', panelText: '#ffffff', panelIcon: '#ffffff' },
  } });
  assert.deepEqual(coloured.nameCardStyles, { nc_avemujica_1: { theme: '#c41c55', themeText: '#ffffff', panel: '#191919d9', panelText: '#ffffffb2', panelIcon: '#ffffff4c' } });
  // The card's nation emblems: the nations only (not their groups, not "No team"), in the game's order.
  assert.deepEqual(named.nations, ['Rhodes Island', 'Yan']);
  // Each operator's nation, by that name, for the emblem it counts toward; a group is not a nation.
  assert.deepEqual([named.chars.char_300_phenxi.nation, named.chars.char_4145_radian.nation], ['Yan', undefined]);
  // Another form of one character (Amiya's Guard and Medic) names its default form's id, so
  // the account page counts the character once, as the game does.
  const formed = buildGameAccountMap(records, { ...tables, forms: { Raidian: { default: 'Fiammetta', forms: [{ name: 'Fiammetta', internalName: 'char_300_phenxi' }, { name: 'Raidian', internalName: 'char_4145_radian' }] } } });
  assert.equal(formed.chars.char_4145_radian.formOf, 'char_300_phenxi');
  assert.equal(formed.chars.char_300_phenxi.formOf, undefined);
  // The client spells the Greek letters A and B.
  assert.deepEqual(map.chars.char_4145_radian.modules, { uniequip_002_radian: 0, uniequip_003_radian: 1 });
  // This mirror writes an empty list as {}: no skills, as a record without any has.
  const skillless = records.map((record) => (record.name === 'Raidian' ? { ...record, skills: { skillList: [] } } : record));
  assert.doesNotThrow(() => buildGameAccountMap(skillless, { ...tables, characters: { ...tables.characters, char_4145_radian: { skills: {} as never } } }));
});

test('the account map carries dated beginner programmes without inventing identity for older releases', () => {
  assert.equal(buildGameAccountMap(records, tables).beginnerPrograms, undefined);
  const current = buildGameAccountMap(records, { ...tables, openServer: { schedule: [
    { id: 'later', startTs: 200 }, { id: 'earlier', startTs: 100 }, { id: '../invalid', startTs: 300 },
  ] } });
  assert.deepEqual(current.beginnerPrograms, [{ id: 'earlier', startTs: 100 }, { id: 'later', startTs: 200 }]);
  // open_server_table's shape (2026-10-21): each programme's window and its mission group's ids,
  // which the import reads the save's mission.missionGroups[programme] by. Nothing else is kept.
  const dated = buildGameAccountMap(records, { ...tables, openServer: {
    schedule: [{ id: 'openseverTaskGroup1', versionId: 'OpenServer', startTs: 1533898800, endTs: 1733227199, chainLoginDescription: 'text' } as never, { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799 }],
    dataMap: { openseverTaskGroup1: { openServerMissionGroup: { missionIds: ['openserver_1', 'openserver_2', '../bad', 3] } } },
  } });
  assert.deepEqual(dated.beginnerPrograms, [
    { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, missionIds: ['openserver_1', 'openserver_2'] },
    { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799 },
  ]);
  // Missions with no group naming them would quietly stop the import's group tick: the run fails.
  assert.throws(() => buildGameAccountMap(records, { ...tables, openServer: { schedule: [{ id: 'p', startTs: 1 }], dataMap: { p: { openServerMissionData: [{ id: 'm' }] } } } }),
    /beginner programme p has missions but no openServerMissionGroup.missionIds/);
});

test('a record that no longer lines up with the client fails the map, naming it', () => {
  const renamed = structuredClone(records);
  renamed[0].modules[1].name = 'A Long Journey';
  assert.throws(() => buildGameAccountMap(renamed, tables), /Fiammetta: the client's uniequip_003_phenxi \(ART-X\) matches 0 of the record's modules/);
  const reordered = structuredClone(records);
  reordered[0].skills.skillList.reverse();
  assert.throws(() => buildGameAccountMap(reordered, tables), /Fiammetta: the client's skills \(provocate, embers\) are not the record's/);
  assert.throws(() => buildGameAccountMap([{ name: 'Nobody' }], tables), /Nobody has no internalName/);
});

test('the committed map covers every operator record and loads', () => {
  const map = checkGameAccountMap(gameAccountMap);
  assert.ok(Object.keys(map.chars).length >= 400);
  assert.equal(map.chars.char_002_amiya.name, 'Amiya');
  assert.equal(map.chars.char_1001_amiya2.name, 'Amiya (Guard)');
  assert.throws(() => checkGameAccountMap({ version: 1, chars: {} }), /not a map of character ids/);
});

const MAP = buildGameAccountMap([...records,
  { name: 'Amiya', internalName: 'char_002_amiya', modules: [], skills: { skillList: [] } },
  { name: 'Amiya (Guard)', internalName: 'char_1001_amiya2', modules: [], skills: { skillList: [] } },
], { ...tables, characters: {} });
const ALIASES = { byItemId: { 4001: 'LMD', 30012: 'Orirock Cube', 30013: 'Orirock Cluster' }, byArkgraph: {} };
const DEPOT = ['LMD', 'Orirock Cube', 'Orirock Cluster', 'Orirock'];

test('an account becomes the roster and depot the game holds, in place of the planner\'s', () => {
  const user = {
    status: { gold: 1234567 },
    inventory: { 30012: 50, 2001: 9, furni_1: 1 },
    troop: { chars: {
      1: { charId: 'char_300_phenxi', evolvePhase: 2, level: 60, mainSkillLvl: 7,
        skills: [{ specializeLevel: 0 }, { specializeLevel: 3 }],
        equip: { uniequip_001_phenxi: { locked: 0, level: 1 }, uniequip_002_phenxi: { locked: 0, level: 2 }, uniequip_003_phenxi: { locked: 1, level: 1 } } },
      2: { charId: 'char_002_amiya', evolvePhase: 1, level: 30, mainSkillLvl: 5,
        tmpl: { char_002_amiya: { skills: [] }, char_1001_amiya2: { skills: [{ specializeLevel: 1 }] } } },
      3: { charId: 'char_9999_brandnew', evolvePhase: 0, level: 1, mainSkillLvl: 1 },
    } },
  };
  const result = readGameAccount(user, MAP, ALIASES, DEPOT);
  // Fiammetta's Y (released first, uniequip_002) is the planner's second module, at stage 2;
  // her X is locked, so not unlocked.
  assert.deepEqual(result.roster.Fiammetta, { elite: 2, level: 60, skillLevel: 7, masteries: { 1: 3 }, modules: { 1: 1 } });
  // Amiya's forms share her promotion and level, and keep their own skills.
  assert.deepEqual(result.roster.Amiya, { elite: 1, level: 30, skillLevel: 5, masteries: {} });
  assert.deepEqual(result.roster['Amiya (Guard)'], { elite: 1, level: 30, skillLevel: 5, masteries: { 0: 1 } });
  // One new this week: skipped and named, the rest still arrive.
  assert.deepEqual(result.unknown, ['char_9999_brandnew']);
  // Every depot material at the game's count, none held being 0; LMD is the account's gold.
  assert.deepEqual(result.depot, { LMD: 1234567, 'Orirock Cube': 50, 'Orirock Cluster': 0, Orirock: 0 });
  assert.match(describeTransfer({ depot: result.depot, roster: result.roster, goals: null, crafting: null, buying: null, shape: 'game', unheld: result.unknown }),
    /^Read your game account: 3 operators into your roster and 2 materials you hold into your depot, in place of what they held\. Your goals are as they were\. Skipped 1 entry .*char_9999_brandnew/);
});

/*
 * The skill in the Training Room is counted as its next mastery: Surtr-style, M2 in training to M3
 * is M3 in the roster. The room's trainee is { charInstId, targetSkill, state }, state 1 in
 * progress, 2 finished and not collected, 3 idle (the Krooster import reads it the same way).
 */
test('the skill in the Training Room counts as its next mastery', () => {
  const fiammetta = { charId: 'char_300_phenxi', evolvePhase: 2, level: 60, mainSkillLvl: 7, skills: [{ specializeLevel: 0 }, { specializeLevel: 2 }] };
  const account = (trainee: Record<string, number> | null, chars: Record<string, unknown> = { 1: fiammetta }) => ({
    troop: { chars },
    building: { rooms: { TRAINING: { slot_13: trainee ? { trainee } : {} } } },
  });
  const roster = (user: Record<string, unknown>) => readGameAccount(user, MAP, ALIASES, DEPOT);

  // In progress on the second skill, which she holds at 2: counted as 3.
  const training = roster(account({ charInstId: 1, targetSkill: 1, state: 1 }));
  assert.deepEqual(training.roster.Fiammetta.masteries, { 1: 3 });
  assert.deepEqual(training.training, { operator: 'Fiammetta', skill: 1, mastery: 3 });
  // Finished and not collected is the same: the game has not applied it yet.
  assert.deepEqual(roster(account({ charInstId: 1, targetSkill: 1, state: 2 })).roster.Fiammetta.masteries, { 1: 3 });
  // A first mastery counts as well, beside the one already held.
  assert.deepEqual(roster(account({ charInstId: 1, targetSkill: 0, state: 1 })).roster.Fiammetta.masteries, { 0: 1, 1: 2 });
  // Idle, no trainee, a stale target and a skill already at 3 change nothing.
  for (const trainee of [{ charInstId: 1, targetSkill: 1, state: 3 }, { charInstId: -1, targetSkill: -1, state: 0 }, { charInstId: 1, targetSkill: -1, state: 1 }]) {
    const none = roster(account(trainee));
    assert.deepEqual(none.roster.Fiammetta.masteries, { 1: 2 });
    assert.equal(none.training, undefined);
  }
  const done = roster(account({ charInstId: 1, targetSkill: 1, state: 1 }, { 1: { ...fiammetta, skills: [{ specializeLevel: 0 }, { specializeLevel: 3 }] } }));
  assert.deepEqual(done.roster.Fiammetta.masteries, { 1: 3 });
  assert.equal(done.training, undefined);
  // A save with no building at all, or no training room, imports as it did.
  assert.equal(roster({ troop: { chars: { 1: fiammetta } } }).training, undefined);
  assert.equal(roster({ troop: { chars: { 1: fiammetta } }, building: { rooms: {} } }).training, undefined);
  // Amiya trains the skills of the form she is in.
  const amiya = { charId: 'char_002_amiya', evolvePhase: 2, level: 80, mainSkillLvl: 7, currentTmpl: 'char_1001_amiya2',
    tmpl: { char_002_amiya: { skills: [{ specializeLevel: 3 }] }, char_1001_amiya2: { skills: [{ specializeLevel: 1 }] } } };
  const guard = roster(account({ charInstId: 2, targetSkill: 0, state: 1 }, { 2: amiya }));
  assert.deepEqual(guard.roster['Amiya (Guard)'].masteries, { 0: 2 });
  assert.deepEqual(guard.roster.Amiya.masteries, { 0: 3 }, 'the other form is as the game holds it');
});
