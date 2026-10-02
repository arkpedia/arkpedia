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
  const named = buildGameAccountMap(records, { ...tables, displayMeta: { nameCardV2Data: { skinData: { nc_moon_1: { name: 'An Invitation to Moons', themeEnName: 'An invitation to moons' }, nc_rhodes_default: { name: 'Rhodes Island', themeEnName: '' } } } },
    medalTable: { medalList: [{ medalId: 'medal_a', medalName: 'A Medal' }, { medalId: 'medal_b' }] },
    teams: { none: { powerLevel: 0, powerName: 'No team', orderNum: 0 }, yan: { powerLevel: 0, powerName: 'Yan', orderNum: 2 }, rhodes: { powerLevel: 0, powerName: 'Rhodes Island', orderNum: 1 }, lgd: { powerLevel: 1, powerName: 'Lungmen Guard Department', orderNum: 3 } } });
  assert.deepEqual([named.nameCards, named.nameCardThemes, named.medals], [{ nc_moon_1: 'An Invitation to Moons', nc_rhodes_default: 'Rhodes Island' }, { nc_moon_1: 'An invitation to moons' }, { medal_a: 'A Medal' }]);
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
  assert.match(describeTransfer({ depot: result.depot, roster: result.roster, goals: null, crafting: null, shape: 'game', unheld: result.unknown }),
    /^Read your game account: 3 operators into your roster and 2 materials you hold into your depot, in place of what they held\. Your goals are as they were\. Skipped 1 entry .*char_9999_brandnew/);
});
