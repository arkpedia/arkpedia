import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGameAccountMap, readGameAccount } from '../../lib/planner/gameAccount';
import { describeTransfer } from '../../lib/planner/transfer';
import gameAccountMap from '../../data/game-account-map.json';

test('the committed map covers every operator record and loads', () => {
  const map = checkGameAccountMap(gameAccountMap);
  assert.ok(Object.keys(map.chars).length >= 400);
  assert.equal(map.chars.char_002_amiya.name, 'Amiya');
  assert.equal(map.chars.char_1001_amiya2.name, 'Amiya (Guard)');
  assert.throws(() => checkGameAccountMap({ version: 1, chars: {} }), /not a map of character ids/);
});

// A map exactly as arkpedia-data's importer writes it (its scripts/build/build-game-account-map.ts,
// whose own test lives beside it), small enough for the rules below: Fiammetta's two upgrade
// modules in the planner's order -- her Y, released first, is module 1 -- and Amiya's two forms.
const MAP = {
  version: 1,
  chars: {
    char_002_amiya: { name: 'Amiya', rarity: 1, modules: {} },
    char_1001_amiya2: { name: 'Amiya (Guard)', rarity: 1, modules: {} },
    char_300_phenxi: { name: 'Fiammetta', rarity: 6, modules: { uniequip_002_phenxi: 1, uniequip_003_phenxi: 0 } },
    char_4145_radian: { name: 'Raidian', rarity: 1, modules: { uniequip_002_radian: 0, uniequip_003_radian: 1 } },
  },
  nameCards: {}, nameCardThemes: {}, nameCardVariants: {}, nameCardPlain: [], nameCardStyles: {},
  medals: {}, nations: [], moduleTypes: {}, skillIcons: {}, pools: {},
} as never;

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
