import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// @ts-expect-error JavaScript importer is also used directly by the refresh job.
import { characterOf, cnModuleTables, gapReason, handWrittenFields, keepSpelling, localizeOperator, sameOperator, localizeReleasedMechanics, officialModules, officialTrait, officialVoiceActors, renameInText, syncOperatorEnglish, usesGameVoiceCredits } from '../sync/sync-operator-english.mjs';

const operator = {
  internalName: 'char_test', review: { official: '中文简介', editor: 'Keep the editorial review.' },
  files: [{ section: 'Archive File 1', unlock: 'Unlocked at 50 trust', description: '中文档案' }],
};
const handbook = { charID: 'char_test', storyTextAudio: [
  { storyTitle: 'Profile', stories: [{ storyText: 'Published English profile.' }] },
  { storyTitle: 'Archive File 1', stories: [{ storyText: 'Published English archive.' }] },
] };

test('official English replaces Chinese fallback by operator ID and exact archive section', () => {
  const next = localizeOperator(operator, handbook);
  assert.equal(next.review.official, 'Published English profile.');
  assert.equal(next.review.editor, operator.review.editor);
  assert.deepEqual(next.files[0], { ...operator.files[0], description: 'Published English archive.' });
  assert.equal(operator.review.official, '中文简介');
  assert.deepEqual(localizeOperator(next, handbook), next);
});

test('missing, untranslated, mismatched and conditional data cannot overwrite existing content', () => {
  assert.deepEqual(localizeOperator(operator, undefined), operator);
  assert.deepEqual(localizeOperator(operator, { ...handbook, charID: 'another_form' }), operator);
  for (const stories of [[{ storyText: '仍为中文' }], [{ storyText: 'First form' }, { storyText: 'Second form' }]]) {
    assert.deepEqual(localizeOperator(operator, { charID: 'char_test', storyTextAudio: [{ storyTitle: 'Profile', stories }] }), operator);
  }
  const english = { ...operator, review: { official: 'Existing English', editor: 'Editorial text' }, files: [] };
  assert.deepEqual(localizeOperator(english, handbook), {
    ...english,
    review: { official: 'Published English profile.', editor: 'Editorial text' },
  });
});

test('voice credits merge official Global sources and prefer the newer source', () => {
  assert.deepEqual(officialVoiceActors('char_test', [
    { voiceLangDict: { char_test: { dict: {
      JP: { cvName: ['JP Actor'] }, CN_MANDARIN: { cvName: ['Old CN Actor'] },
    } } } },
    { voiceLangDict: { char_test: { dict: {
      EN: { cvName: ['EN Actor'] }, KR: { cvName: ['KR Actor'] }, CN_MANDARIN: { cvName: ['New CN Actor'] },
    } } } },
  ]), {
    Japanese: 'JP Actor', Chinese: 'New CN Actor', English: 'EN Actor', Korean: 'KR Actor',
  });
});

test('partial voice tables preserve other languages, normalize renamed enums, and refresh idempotently', () => {
  const previous = { Japanese: 'Accurate existing spelling', Chinese: 'Existing CN credit', 'Regional Chinese (Cantonese)': 'Existing dialect credit' };
  const tables = [{ voiceLangDict: { char_test: { dict: {
    EN: { cvName: [' Current EN actor '] }, KR: { cvName: [] },
    11: { voiceLangType: 'SPA', cvName: ['Spanish actor'] },
  } } } }];
  const refreshed = officialVoiceActors('char_test', tables, previous);
  assert.deepEqual(refreshed, { ...previous, English: 'Current EN actor', Spanish: 'Spanish actor' });
  assert.deepEqual(officialVoiceActors('char_test', tables, refreshed), refreshed);
  assert.deepEqual(officialVoiceActors('char_test', [], refreshed), refreshed);
  assert.equal(officialVoiceActors('char_test', [{ voiceLangDict: { char_test: { dict: { EN: { cvName: ['Replacement actor'] } } } } }], refreshed).English, 'Replacement actor');
  assert.deepEqual(previous, { Japanese: 'Accurate existing spelling', Chinese: 'Existing CN credit', 'Regional Chinese (Cantonese)': 'Existing dialect credit' });
});

test('only recent or untranslated records take the game\'s voice credits', () => {
  const now = Date.UTC(2026, 8, 17);
  assert.equal(usesGameVoiceCredits({ characterInfo: { 'Release Date': '2026/09/10' } }, now), true);
  assert.equal(usesGameVoiceCredits({ characterInfo: { 'Release Date': '2026/10/01' } }, now), false);
  assert.equal(usesGameVoiceCredits({ characterInfo: { 'Release Date': '2025/01/01' } }, now), false);
  assert.equal(usesGameVoiceCredits({ review: { official: '尚未翻译' } }, now), true);
});

test('a newly released operator adopts official Global mechanics while preserving editorial skill notes', () => {
  const unreleased = {
    name: 'Test Operator', internalName: 'char_test', trait: 'Old trait', tags: [],
    review: { official: 'Already English' }, files: [], voiceData: { lines: [] },
    potential: { levels: [], totalCost: [{ name: 'Token', quantity: 5 }] },
    talents: [{ name: 'Fan Talent', rows: [], technique: [{ name: 'Keep', description: 'Editorial note' }] }],
    baseSkills: [], modules: [],
    promotion: [{ tier: 'Elite 1', upgrades: ['New talent: Fan Talent.', 'New skill: Fan translation.'] }],
    skills: { skillList: [{ name: 'Fan translation', recommendation: ['Keep me'], pairings: [], techniques: [] }], skillCost: {} },
  };
  const tables = {
    characters: { char_test: {
      name: 'Test Operator', description: 'Official <@ba.vup>trait</>', tagList: ['DPS'],
      potentialRanks: [{ description: 'ATK <@ba.vup>+10</>' }],
      talents: [{ candidates: [{ name: 'Official Talent', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'Talent text' }] }],
      skills: [{ skillId: 'skill_test', levelUpCostCond: [{ levelUpCost: [{ id: 'item', count: 1 }] }] }],
      allSkillLvlup: [{ lvlUpCost: [{ id: 'item', count: 2 }] }],
    } },
    skills: { skill_test: { skillId: 'skill_test', levels: [{
      name: 'Official Skill', description: 'ATK <@ba.vup>+{atk:0%}</> for {duration} seconds', blackboard: [{ key: 'atk', value: 0.2 }],
      spData: { spType: 'INCREASE_WITH_TIME', initSp: 3, spCost: 8 }, skillType: 'MANUAL', duration: 10,
    }] } },
    building: { chars: { char_test: { buffChar: [{ buffData: [{ buffId: 'buff', cond: { phase: 'PHASE_0' } }] }] } },
      buffs: { buff: { buffName: 'Official Base Skill', roomType: 'HIRE', description: 'Contact speed <@cc.vup>+30%</>' } } },
    modules: { equipDict: {}, missionList: {} }, battleEquip: {}, cn: null, items: { items: { item: { name: 'Material' } } },
    voiceTables: [{ voiceLangDict: { char_test: { dict: { EN: { cvName: ['Current Actor'] } } } } }],
  };
  const next = localizeReleasedMechanics(unreleased, tables, []);
  assert.equal(next.trait, 'Official trait');
  assert.equal(next.skills.skillList[0].name, 'Official Skill');
  assert.equal(next.skills.skillList[0].levels[0].description, 'ATK +20% for 10 seconds');
  assert.deepEqual(next.skills.skillList[0].recommendation, ['Keep me']);
  assert.equal(next.talents[0].name, 'Official Talent');
  assert.deepEqual(next.talents[0].technique, unreleased.talents[0].technique);
  assert.deepEqual(next.promotion[0].upgrades, ['New talent: Official Talent.', 'New skill: Official Skill.']);
  assert.equal(next.baseSkills[0].name, 'Official Base Skill');
  assert.deepEqual(next.characterVoices, { English: 'Current Actor' });
  assert.deepEqual(next.potential.totalCost, unreleased.potential.totalCost);
});


test('module refresh preserves independent X/Y/alpha stages and CN-only modules', () => {
  const current = [
    { type: 'Upgrade', name: 'DEC-X: Old X', stages: [{ effectText: 'X trait' }] },
    { type: 'Upgrade', name: 'DEC-Y: Old Y', stages: [{ effectText: 'Y trait' }] },
    { type: 'Upgrade', name: 'ISW-α: Old alpha', stages: [{ effectText: 'IS trait' }] },
    { type: 'Upgrade', name: 'DEC-Δ: CN only', stages: [{ effectText: 'CN trait' }] },
  ];
  const equipDict = Object.fromEntries([['x', 'DEC', 'X'], ['y', 'DEC', 'Y'], ['a', 'ISW', 'A']].map(([id, prefix, suffix], index) => [id, {
    uniEquipId: id, charId: 'char_test', type: 'ADVANCED', typeName1: prefix, typeName2: suffix,
    uniEquipName: `Current ${id}`, charEquipOrder: index,
  }]));
  const updated = officialModules('char_test', { equipDict }, current, {}, [], { items: {} }, null, []);
  assert.deepEqual(updated.map((m: { stages: { effectText: string }[] }) => m.stages[0].effectText), ['X trait', 'Y trait', 'IS trait', 'CN trait']);
  assert.equal(updated[2].name, 'ISW-α: Current a');
  assert.deepEqual(updated.slice(0, 3).map((m: { moduleId?: string }) => m.moduleId), ['x', 'y', 'a']);
  assert.deepEqual(officialModules('char_test', { equipDict }, updated, {}, [], { items: {} }, null, []), updated, 'repeat refresh is idempotent');
  assert.throws(() => officialModules('char_test', { equipDict }, current, undefined, [], { items: {} }, null, []), /battle_equip_table/);
  assert.throws(() => officialModules('char_test', { equipDict }, current, {}, [], { items: {} }, null), /report the costs/);
  const forms = officialModules('char_test', { equipDict, charEquip: { char_test: ['x'] } }, current, {}, [], { items: {} }, null, []);
  assert.deepEqual(forms.filter((m: { moduleId?: string }) => m.moduleId).map((m: { moduleId?: string }) => m.moduleId), ['x'], 'another form\'s modules under the same charId stay off');
});

test('module stages are rebuilt from battle_equip_table, keeping the record\'s own fields', () => {
  const current = [{ type: 'Upgrade', name: 'DEC-X: Old', note: 'hand-written', stages: [{ stage: 'Stage 1', effectLabel: 'New trait', effectText: 'Wiki words' }] }];
  const equipDict = { x: { uniEquipId: 'x', charId: 'char_test', type: 'ADVANCED', typeName1: 'DEC', typeName2: 'X', uniEquipName: 'New', charEquipOrder: 1,
    itemCost: { 1: [{ id: 'mod_unlock_token', count: 1 }], 2: [], 3: [] } } };
  const trait = (text: string) => ({ target: 'DISPLAY', overrideTraitDataBundle: { candidates: [{ additionalDescription: text, blackboard: [] }] }, addOrOverrideTalentDataBundle: { candidates: null } });
  const talent = (value: number) => ({ target: 'TALENT_DATA_ONLY', overrideTraitDataBundle: { candidates: null }, addOrOverrideTalentDataBundle: { candidates: [
    { name: 'Power', talentIndex: 0, upgradeDescription: 'ATK +{atk:0%}', blackboard: [{ key: 'atk', value }] },
    { name: 'Power', talentIndex: 0, requiredPotentialRank: 4, upgradeDescription: 'ATK +{atk:0%}', blackboard: [{ key: 'atk', value: value + 0.03 }] },
  ] } });
  const battleEquip = { x: { phases: [
    { attributeBlackboard: [], parts: [trait('Attacks <@ba.kw>twice</>')] },
    { attributeBlackboard: [], parts: [trait('Attacks <@ba.kw>twice</>'), talent(0.1)] },
    { attributeBlackboard: [], parts: [trait('Attacks <@ba.kw>twice</>'), talent(0.15)] },
  ] } };
  const [module] = officialModules('char_test', { equipDict }, current, battleEquip, ['Power'], { items: { mod_unlock_token: { name: 'Module Data Block' } } }, null, []);
  assert.equal(module.note, 'hand-written');
  assert.deepEqual(module.stages.map((s: { effectLabel: string; effectText: string }) => [s.effectLabel, s.effectText]), [
    ['New trait', 'Attacks twice'], ['Power improved', 'ATK +10%'], ['Power improved', 'ATK +15%'],
  ]);
  assert.deepEqual(module.stages[0].cost, [{ name: 'Module Data Block', quantity: 1 }]);
});

test('hand-written techniques and recommendations are what the refresh guard compares', () => {
  const slow = [{ name: 'Slow', description: 'x' }];
  const op = { skills: { skillList: [{ name: 'S1', techniques: ['Stun'], recommendation: 'M3 first' }] }, talents: [{ name: 'A', technique: slow }, { name: 'B' }] };
  assert.equal(handWrittenFields(op), handWrittenFields({ ...op, trait: 'changed' }));
  // Merging the import's per-Elite talents moves a technique without losing it.
  assert.equal(handWrittenFields(op), handWrittenFields({ ...op, talents: [{ name: 'B', technique: slow }] }));
  assert.notEqual(handWrittenFields(op), handWrittenFields({ ...op, talents: [{ name: 'A' }] }));
  assert.notEqual(handWrittenFields(op), handWrittenFields({ ...op, review: { editor: 'gone' } }));
  assert.notEqual(handWrittenFields(op), handWrittenFields({ ...op, skills: { skillList: [{ name: 'S1', techniques: ['Stun'] }] } }));
});

test('talents are matched by name: the import\'s per-Elite split merges into the game\'s one talent, technique kept', () => {
  const character = { name: 'Manticore', description: '', tagList: [], potentialRanks: [], skills: [], allSkillLvlup: [], talents: [{ candidates: [
    { name: 'Hidden Killer - Medium', unlockCondition: { phase: 'PHASE_1' }, description: 'ATK +25%' },
    { name: 'Hidden Killer - Elite', unlockCondition: { phase: 'PHASE_2' }, description: 'ATK +50%' },
  ] }] };
  const promotion = [
    { tier: 'Elite 1', upgrades: ['New talent: Hidden Killer - Medium .', 'New skill: Toxic Overload .'] },
    { tier: 'Elite 2', upgrades: ['Hidden Killer - Medium becomes Hidden Killer - Elite .', 'Operator Modules available.'] },
  ];
  const op = { name: 'Manticore', internalName: 'char_test', skills: { skillList: [] }, promotion, talents: [
    { name: 'Hidden Killer - Medium', rows: [] },
    { name: 'Hidden Killer - EliteReplacesHidden Killer - Medium', rows: [], technique: [{ name: 'Invisibility', description: 'x' }] },
  ] };
  const tables = { characters: { char_test: character }, skills: {}, building: { chars: {}, buffs: {} }, modules: { equipDict: {} }, battleEquip: {}, items: { items: {} }, voiceTables: [], cn: null };
  const next = localizeReleasedMechanics(op, tables, []);
  assert.equal(next.talents.length, 1);
  assert.equal(next.talents[0].name, 'Hidden Killer - Elite');
  assert.deepEqual(next.talents[0].technique, [{ name: 'Invisibility', description: 'x' }]);
  assert.deepEqual(next.talents[0].rows.map((r: { stage: string }) => r.stage), ['Elite 1', 'Elite 2']);
  // Both names are the game's own, one per Elite: neither is a rename, so the text stays.
  assert.deepEqual(next.promotion, promotion);
});

const talentTables = (talents: unknown[]) => ({
  characters: { char_test: { name: 'Test', description: 'Trait', tagList: [], potentialRanks: [], skills: [], allSkillLvlup: [], talents } },
  skills: {}, building: { chars: {}, buffs: {} }, modules: { equipDict: {} }, battleEquip: {}, items: { items: {} }, voiceTables: [], cn: null,
});

test('a per-Elite talent name is not a rename: Perfumer\'s Elite 1 "New talent: Lavender" survives the refresh', () => {
  const tables = talentTables([{ candidates: [
    { name: 'Lavender', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'a' },
    { name: 'Lavender', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 4, description: 'b' },
    { name: 'Lavender\'s Fragrance', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'c' },
  ] }]);
  const promotion = [
    { tier: 'Elite 1', upgrades: ['New talent: Lavender .', 'New skill: Fine Blending .'] },
    { tier: 'Elite 2', upgrades: ['Lavender becomes Lavender\'s Fragrance .'] },
  ];
  const op = { name: 'Test', internalName: 'char_test', skills: { skillList: [] }, promotion,
    talents: [{ name: 'Lavender', rows: [] }, { name: 'Lavender\'s FragranceReplacesLavender', rows: [] }] };
  const next = localizeReleasedMechanics(op, tables, []);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['Lavender\'s Fragrance']);
  assert.deepEqual(next.promotion, promotion);
  assert.deepEqual(localizeReleasedMechanics(next, tables, []).promotion, promotion, 'and stays on the next night');
});

test('a talent the game renamed outright is renamed in the promotion text, whole names only', () => {
  const tables = talentTables([
    { candidates: [{ name: 'A Surprise Visitor', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'a' }] },
    { candidates: [{ name: 'Reliable Companion', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'b' }] },
  ]);
  const op = { name: 'Test', internalName: 'char_test', skills: { skillList: [] },
    talents: [{ name: 'Unexpected Arrive', rows: [], technique: [{ name: 'Keep', description: 'x' }] }, { name: 'Reliable Companion', rows: [] }],
    promotion: [{ tier: 'Elite 1', upgrades: ['New talent: Unexpected Arrive .', 'Unexpected Arrived is another word.'] }, { tier: 'Elite 2', upgrades: ['Unexpected Arrive improved.', 'New talent: Reliable Companion .'] }] };
  const next = localizeReleasedMechanics(op, tables, []);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['A Surprise Visitor', 'Reliable Companion']);
  assert.deepEqual(next.talents[0].technique, [{ name: 'Keep', description: 'x' }]);
  assert.deepEqual(next.promotion.map((tier: { upgrades: string[] }) => tier.upgrades), [
    ['New talent: A Surprise Visitor .', 'Unexpected Arrived is another word.'], ['A Surprise Visitor improved.', 'New talent: Reliable Companion .'],
  ]);
});

test('renames apply in one pass, longest name first, so a replacement is never renamed again', () => {
  // Without the names that stand for themselves ([]), to show the alternation alone.
  assert.equal(renameInText('Lavender becomes Lavender\'s Fragrance .', [['Lavender', 'Lavender\'s Fragrance']], []), 'Lavender\'s Fragrance becomes Lavender\'s Fragrance\'s Fragrance .',
    'a per-Elite name must never reach renameInText as a rename; this is why');
  assert.equal(renameInText('A becomes B .', [['A', 'B'], ['B', 'C']], []), 'B becomes C .');
  assert.equal(renameInText('Fast Strike and Fast Strike II', [['Fast Strike', 'Quick Strike'], ['Fast Strike II', 'Quick Strike II']], []), 'Quick Strike and Quick Strike II');
  assert.equal(renameInText('Arrowhead, Arrow.', [['Arrow', 'Bolt']], []), 'Arrowhead, Bolt.');
  assert.equal(renameInText('Who? ??? improved.', [['???', 'Emotional Absorption']], []).includes('Emotional Absorption'), true, 'renameInText itself matches any name; officialTalents never hands it one without a letter');
  // An apostrophe is no letter: a possessive follows its name, and so does a longer name that only
  // starts with a renamed one, unless it is renamed too or listed as a name of its own (below).
  assert.equal(renameInText('Lavender\'s scent; Lavender\'s Fragrance', [['Lavender', 'X']], []), 'X\'s scent; X\'s Fragrance');
  assert.equal(renameInText('Lavender\'s Fragrance', [['Lavender', 'X'], ['Lavender\'s Fragrance', 'Y']], []), 'Y');
  assert.throws(() => renameInText('Arrow', [['Arrow', 'Bolt']]), /names that stand for themselves/, 'the list is required, never left out by a caller');
});

test('a final talent or skill name, or any game candidate name, is read as itself: a rename never takes its start or end', () => {
  const names = ['Arrow Storm', 'Storm Arrow', 'Lavender\'s Fragrance', 'Bolt'];
  assert.equal(renameInText('Arrow Storm improved; New skill: Arrow .', [['Arrow', 'Bolt']], names), 'Arrow Storm improved; New skill: Bolt .');
  assert.equal(renameInText('Storm Arrow and Arrow', [['Arrow', 'Bolt']], names), 'Storm Arrow and Bolt');
  assert.equal(renameInText('Lavender\'s scent; Lavender\'s Fragrance', [['Lavender', 'X']], names), 'X\'s scent; Lavender\'s Fragrance');
  // A rename of a listed name still applies: the explicit pair wins over the name kept.
  assert.equal(renameInText('Arrow Storm', [['Arrow Storm', 'Arrow Rain']], names), 'Arrow Rain');
  assert.equal(renameInText('Arrow Storm', [], names), 'Arrow Storm', 'no rename, nothing to do');
});

test('the refresh hands renameInText every final name: a talent renamed by position never rewrites a skill it starts', () => {
  const tables = talentTables([{ candidates: [{ name: 'Bolt', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'a' }] }]);
  tables.characters.char_test.skills = [{ skillId: 'skchr_test_1' }] as never;
  (tables.skills as Record<string, unknown>).skchr_test_1 = { skillId: 'skchr_test_1', levels: [{ name: 'Arrow Storm', description: 'Fire', skillType: 'MANUAL', spData: { spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10 }, duration: 0, blackboard: [] }] };
  const op = { name: 'Test', internalName: 'char_test', talents: [{ name: 'Arrow', rows: [] }], skills: { skillList: [{ name: 'Arrow Storm' }] },
    promotion: [{ tier: 'Elite 1', upgrades: ['New talent: Arrow .', 'New skill: Arrow Storm .'] }] };
  const next = localizeReleasedMechanics(op, tables, []);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['Bolt']);
  assert.deepEqual(next.promotion[0].upgrades, ['New talent: Bolt .', 'New skill: Arrow Storm .']);
});

test('a record talent the game\'s table does not have is kept, not dropped (Raidian\'s Integrated Strategies talents)', () => {
  const tables = talentTables([
    { candidates: [{ name: 'Cassette Inspiration', unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, description: 'a' }] },
    { candidates: [{ name: 'Do Your Best~', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'b' }] },
  ]);
  const op = { name: 'Test', internalName: 'char_test', skills: { skillList: [] }, promotion: [{ tier: 'Elite 1', upgrades: ['Casette Inspiration improved.'] }], talents: [
    { name: 'Casette Inspiration', rows: [] }, { name: 'Do Your Best~', rows: [] },
    { name: 'Expert Backup I', rows: [{ stage: 'Base', potential: null, description: 'IS only' }], technique: [{ name: 'Summon', description: 'x' }] },
    { name: 'Expert Backup II', rows: [] },
  ] };
  const next = localizeReleasedMechanics(op, tables, []);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['Cassette Inspiration', 'Do Your Best~', 'Expert Backup I', 'Expert Backup II']);
  assert.deepEqual(next.talents[2], op.talents[2], 'kept as recorded');
  assert.deepEqual(next.promotion[0].upgrades, ['Cassette Inspiration improved.'], 'the spelling fix follows into the text');
});

test('a game talent no record talent pairs with, beside a record talent kept unpaired, is reported as a possible duplicate', () => {
  // The game renamed A to "A Prime", and the record's per-Elite split of B sits at A's position, so
  // the position fallback is taken by name: both A and A Prime are published.
  const tables = talentTables([
    { candidates: [{ name: 'A Prime', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'a' }] },
    { candidates: [{ name: 'B - Medium', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'b' },
      { name: 'B - Elite', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'c' }] },
  ]);
  const op = { name: 'Test', internalName: 'char_test', skills: { skillList: [] }, promotion: [],
    talents: [{ name: 'B - Medium', rows: [] }, { name: 'A', rows: [], technique: [{ name: 'Keep', description: 'x' }] }, { name: 'B - Elite', rows: [] }] };
  const gaps: { key: string; text: string }[] = [];
  const next = localizeReleasedMechanics(op, tables, gaps);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['A Prime', 'B - Elite', 'A']);
  assert.deepEqual(next.talents[2], op.talents[1], 'kept as recorded, technique and all');
  assert.deepEqual(gaps, [{ key: 'operator:char_test', text: 'talent A Prime pairs with none of the record\'s talents, and the record\'s A with none of the game\'s, so both are published: the same talent twice if the game renamed one to the other' }]);
  // Raidian's kept talents sit beside game talents that all paired: nothing to report.
  const raidian = talentTables([{ candidates: [{ name: 'Cassette Inspiration', unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, description: 'a' }] }]);
  const quiet: unknown[] = [];
  localizeReleasedMechanics({ ...op, talents: [{ name: 'Casette Inspiration', rows: [] }, { name: 'Expert Backup I', rows: [] }] }, raidian, quiet);
  assert.deepEqual(quiet, []);
});

test('a game talent with no name keeps the record\'s talent at its place, technique and all, reported; never appended after the others', () => {
  const tables = talentTables([
    { candidates: [{ name: null, unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, description: 'nameless' }] },
    { candidates: [{ name: 'B', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'b' }] },
  ]);
  const op = { name: 'Test', internalName: 'char_test', skills: { skillList: [] }, promotion: [],
    talents: [{ name: 'Ghost Step', rows: [{ stage: 'Base', potential: null, description: 'recorded' }], technique: [{ name: 'Keep', description: 'x' }] }, { name: 'B', rows: [] }] };
  const gaps: { key: string; text: string }[] = [];
  const next = localizeReleasedMechanics(op, tables, gaps);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['Ghost Step', 'B'], 'at its place, not after B');
  assert.deepEqual(next.talents[0], op.talents[0], 'as recorded');
  assert.equal(handWrittenFields(next), handWrittenFields(op), 'so the hand-written guard has nothing to hold');
  assert.deepEqual(gaps, [{ key: 'operator:char_test', text: 'talent Ghost Step is published as the record has it: the game\'s talent at its place has no name' }]);
  // The next night reads the same record and reports the same, so the entry stays until the game names it.
  const again: unknown[] = [];
  assert.deepEqual(localizeReleasedMechanics(next, tables, again).talents, next.talents);
  assert.deepEqual(again, gaps);
  // Beside an unpaired talent (C renamed C Prime, its place taken by B's per-Elite split), both
  // reports share the operator's one entry.
  const both = talentTables([
    { candidates: [{ name: null, unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, description: 'nameless' }] },
    { candidates: [{ name: 'B - Medium', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'b' },
      { name: 'B - Elite', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'b' }] },
    { candidates: [{ name: 'C Prime', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'c' }] },
  ]);
  const shared: { key: string; text: string }[] = [];
  const split = localizeReleasedMechanics({ ...op, talents: [op.talents[0], { name: 'B - Medium', rows: [] }, { name: 'B - Elite', rows: [] }, { name: 'C', rows: [] }] }, both, shared);
  assert.deepEqual(split.talents.map((t: { name: string }) => t.name), ['Ghost Step', 'B - Elite', 'C Prime', 'C']);
  assert.deepEqual(shared, [{ key: 'operator:char_test', text: 'talent C Prime pairs with none of the record\'s talents, and the record\'s C with none of the game\'s, so both are published: '
    + 'the same talent twice if the game renamed one to the other; talent Ghost Step is published as the record has it: the game\'s talent at its place has no name' }]);
});

test('a hidden internal talent with no name (isHideTalent, no description) takes no record talent and hides no report', () => {
  // Most nameless slots in the game's tables are these (SilverAsh the Reignfrost, Necrass ...): no reader
  // sees them. Y renamed to Y Prime stays reported as unpaired, as with no hidden slot at all.
  // X splits per Elite, so the record's Y sits at the hidden slot's place: nothing but its position ties them.
  const tables = talentTables([
    { candidates: [{ name: 'X - Medium', unlockCondition: { phase: 'PHASE_1' }, requiredPotentialRank: 0, description: 'x' },
      { name: 'X - Elite', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'x' }] },
    { candidates: [{ name: 'Y Prime', unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, description: 'y' }] },
    { candidates: [{ name: null, unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, description: null, isHideTalent: true }] },
  ]);
  const op = { name: 'Test', internalName: 'char_test', skills: { skillList: [] }, promotion: [],
    talents: [{ name: 'X - Medium', rows: [] }, { name: 'X - Elite', rows: [] }, { name: 'Y', rows: [] }] };
  const gaps: { key: string; text: string }[] = [];
  const next = localizeReleasedMechanics(op, tables, gaps);
  assert.deepEqual(next.talents.map((t: { name: string }) => t.name), ['X - Elite', 'Y Prime', 'Y'], 'Y kept after the game\'s talents, not taken by the hidden slot');
  assert.deepEqual(gaps, [{ key: 'operator:char_test', text: 'talent Y Prime pairs with none of the record\'s talents, and the record\'s Y with none of the game\'s, so both are published: the same talent twice if the game renamed one to the other' }]);
});

test('both stages that rebuild a record write a gap the same way, ending as their kept-previous reasons do', () => {
  assert.equal(gapReason('Bob', { key: 'operator:char_bob', text: 'talent X is published as the record has it: the game\'s talent at its place has no name' }),
    'Bob\'s talent X is published as the record has it: the game\'s talent at its place has no name.');
  for (const file of ['scripts/sync/sync-operator-english.mjs', 'scripts/sync/catalogue-model.mjs']) {
    const source = fs.readFileSync(file, 'utf8');
    // Every published-partial entry built from localizeReleasedMechanics' gaps goes through gapReason.
    assert.match(source, /for \(const gap of gaps\) [^\n]*'published-partial', reason: gapReason\(/, file);
    assert.doesNotMatch(source, /reason: `\$\{[^}]*\}'s \$\{gap\.text\}/, `${file} writes a gap reason of its own`);
  }
});

test('the trait is filled from the game\'s trait candidates, per Elite where it changes', () => {
  // Ceylon: the value lives only in the candidate's blackboard.
  const ceylon = { description: 'Healing on farther targets is reduced to <@ba.kw>{heal_scale:0%}</>', trait: { candidates: [
    { unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, blackboard: [{ key: 'heal_scale', value: 0.8 }], overrideDescripton: null },
  ] } };
  assert.equal(officialTrait(ceylon), 'Healing on farther targets is reduced to 80%');
  // Pudding: 3 enemies, 4 from Elite 2, written as the records keep a changing trait.
  const pudding = { description: 'Jumps between <@ba.kw>3</> enemies', trait: { candidates: [
    { unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, blackboard: [{ key: 'attack@max_target', value: 3 }], overrideDescripton: 'Jumps between <@ba.kw>{attack@max_target}</> enemies' },
    { unlockCondition: { phase: 'PHASE_2' }, requiredPotentialRank: 0, blackboard: [{ key: 'attack@max_target', value: 4 }], overrideDescripton: 'Jumps between <@ba.kw>{attack@max_target}</> enemies' },
  ] } };
  assert.deepEqual(officialTrait(pudding), { Base: 'Jumps between 3 enemies', 'Elite 2': 'Jumps between 4 enemies' });
  assert.equal(officialTrait({ description: 'Deals <@ba.kw>Arts</> damage', trait: null }), 'Deals Arts damage');
  assert.throws(() => officialTrait({ description: 'Recovers {value} HP', trait: null }), (error: Error & { kind?: string }) => /value/.test(error.message) && /trait/.test(error.kind ?? ''));
});

test('a CN-only module costs a CN-only material by its data/material-names.json name; one with no English name keeps the stage\'s cost, reported', () => {
  const equip = { uniEquipId: 'm', charId: 'char_test', type: 'ADVANCED', typeName1: 'SWO', typeName2: 'Y', uniEquipName: '新契约', charEquipOrder: 2, missionList: [],
    itemCost: { 1: [{ id: 'mod_unlock_token', count: 1 }, { id: '31103', count: 4 }], 2: [{ id: '31199', count: 2 }] } };
  const phase = { attributeBlackboard: [], parts: [{ target: 'DISPLAY', overrideTraitDataBundle: { candidates: [{ additionalDescription: '攻击力提升', blackboard: [] }] }, addOrOverrideTalentDataBundle: { candidates: null } }] };
  const tables = { modules: { equipDict: { m: equip }, missionList: {} }, battleEquip: { m: { phases: [phase, phase] } }, characters: {},
    items: { items: { mod_unlock_token: { name: '模组数据块' }, 31103: { name: '液化高能气体' }, 31199: { name: '某种新材料' } } } };
  const cn = cnModuleTables((key: string) => (tables as Record<string, unknown>)[key], { version: 1, byItemId: { 31103: 'Liquified High-Energy Gas' } });
  const current = [{ type: 'Upgrade', moduleId: 'm', name: 'SWO-Y: Old', stages: [{ stage: 'Stage 1' }, { stage: 'Stage 2', cost: [{ name: 'Kept', quantity: 1 }] }] }];
  const gaps: { key: string; text: string }[] = [];
  const [module] = officialModules('char_test', { equipDict: {} }, current, {}, [], { items: { mod_unlock_token: { name: 'Module Data Block' } } }, cn, gaps);
  assert.deepEqual(module.stages[0].cost, [{ name: 'Module Data Block', quantity: 1 }, { name: 'Liquified High-Energy Gas', quantity: 4 }]);
  assert.deepEqual(module.stages[1].cost, [{ name: 'Kept', quantity: 1 }], 'never the Chinese name');
  assert.deepEqual(gaps.map(gap => gap.key), ['module:m']);
  assert.equal(gaps[0].text, 'SWO-Y module (CN only) costs a material with no English name yet (Stage 2: item 31199), so that stage keeps its previous cost, or none, until data/material-names.json names it');
  assert.throws(() => cnModuleTables((key: string) => (tables as Record<string, unknown>)[key], undefined), /material-names/);
});

test('a CN-only module costing an unnamed material, with no cost on record for that stage, writes an empty cost, never none', () => {
  // The usual case: CN has just announced the module, in a material line data/material-names.json
  // does not name yet, and the record has no such module (or no such stage). A stage with no cost
  // key failed validate-release, and with it the whole day's release.
  const equip = { uniEquipId: 'm', charId: 'char_test', type: 'ADVANCED', typeName1: 'SWO', typeName2: 'Y', uniEquipName: '新契约', charEquipOrder: 2, missionList: [],
    itemCost: { 1: [{ id: '31199', count: 2 }], 2: [{ id: 'mod_unlock_token', count: 1 }, { id: '31199', count: 3 }] } };
  const phase = { attributeBlackboard: [], parts: [] };
  const tables = { modules: { equipDict: { m: equip }, missionList: {} }, battleEquip: { m: { phases: [phase, phase] } }, characters: {},
    items: { items: { mod_unlock_token: { name: '模组数据块' }, 31199: { name: '某种新材料' } } } };
  const cn = cnModuleTables((key: string) => (tables as Record<string, unknown>)[key], { version: 1, byItemId: {} });
  const enItems = { items: { mod_unlock_token: { name: 'Module Data Block' } } };
  for (const current of [[], [{ type: 'Upgrade', moduleId: 'm', name: 'SWO-Y: Old', stages: [{ stage: 'Stage 1' }] }]]) {
    const gaps: { key: string; text: string }[] = [];
    const modules = officialModules('char_test', { equipDict: {} }, current, {}, [], enItems, cn, gaps);
    assert.equal(modules.length, 1);
    assert.deepEqual(modules[0].stages.map((stage: { cost?: unknown }) => stage.cost), [[], []]);
    assert.deepEqual(gaps.map(gap => gap.key), ['module:m']);
    assert.match(gaps[0].text, /\(Stage 1: item 31199; Stage 2: item 31199\), so those stages keep their previous cost, or none,/);
    // The next night reads the empty list back as the stage's cost, and writes the same.
    assert.deepEqual(officialModules('char_test', { equipDict: {} }, modules, {}, [], enItems, cn, []), modules);
  }
});

test('one record the refresh refuses is kept and quarantined; every other record is still refreshed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-english-'));
  try {
    fs.mkdirSync(path.join(root, 'data/operators-5star'), { recursive: true });
    const write = (file: string, value: unknown) => fs.writeFileSync(path.join(root, 'data/operators-5star', file), JSON.stringify(value, null, 2) + '\n');
    const record = (id: string, name: string, extra: object) => ({ name, internalName: id, trait: 'Old trait', tags: [], review: { official: 'English' }, files: [],
      potential: { levels: [] }, talents: [], baseSkills: [], modules: [], promotion: [], skills: { skillList: [], skillCost: {} },
      characterInfo: { 'Release Date': '2019/01/01' }, characterVoices: { Japanese: 'Kept Actor (dialect note)' }, ...extra });
    write('Good.json', record('char_good', 'Good', {}));
    // A talent technique on a talent the game's table names twice is moved, never lost; a skill
    // technique on a skill the game no longer lists would be lost, so the guard refuses it.
    write('Bad.json', record('char_bad', 'Bad', { skills: { skillList: [{ name: 'Gone', techniques: [{ name: 'Stun', description: 'x' }] }], skillCost: {} } }));
    const character = (name: string) => ({ name, description: 'Heals to <@ba.kw>{heal_scale:0%}</>', trait: { candidates: [
      { unlockCondition: { phase: 'PHASE_0' }, requiredPotentialRank: 0, blackboard: [{ key: 'heal_scale', value: 0.8 }] }] },
    tagList: [], potentialRanks: [], skills: [], allSkillLvlup: [], talents: [] });
    const tables = { characters: { char_good: character('Good'), char_bad: character('Bad') }, skills: {}, building: { chars: {}, buffs: {} },
      modules: { equipDict: {} }, battleEquip: {}, items: { items: {} }, patch: {}, cn: null,
      voiceTables: [{ voiceLangDict: { char_good: { dict: { JP: { cvName: ['Game Actor'] }, EN: { cvName: ['New EN Actor'] } } } } }] };
    const changed = syncOperatorEnglish(root, { handbookDict: {} }, tables, new Date('2026-10-05T00:00:00Z'));
    assert.equal(changed, 1);
    const good = JSON.parse(fs.readFileSync(path.join(root, 'data/operators-5star/Good.json'), 'utf8'));
    assert.equal(good.trait, 'Heals to 80%');
    assert.deepEqual(good.characterVoices, { Japanese: 'Kept Actor (dialect note)', English: 'New EN Actor' }, 'an old record keeps its detailed credits and fills a newly published language');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/operators-5star/Bad.json'), 'utf8')).trait, 'Old trait', 'kept as it was');
    const quarantine = JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8'));
    assert.deepEqual(quarantine.entries.map((entry: { key: string; stage: string; action: string }) => [entry.key, entry.stage, entry.action]), [['operator:char_bad', 'operator-english', 'kept-previous']]);
    assert.match(quarantine.entries[0].reason, /^Bad \(char_bad\) would lose or move hand-written techniques/);
    // An error that is no refusal is a bug, which would hold every record as easily as one: it
    // fails the stage, and the quarantine is left as the last run wrote it.
    assert.throws(() => syncOperatorEnglish(root, { handbookDict: {} }, { ...tables, battleEquip: undefined }, new Date('2026-10-05T00:00:00Z')), /battle_equip_table/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8')), quarantine);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a name the game spells with other quotes or "·" keeps the record\'s spelling; a real rename takes the game\'s', () => {
  assert.equal(keepSpelling('"Beaten Up"', "'Beaten Up'"), '"Beaten Up"');
  assert.equal(keepSpelling('Pharmacology α', 'Pharmacology·α'), 'Pharmacology α');
  assert.equal(keepSpelling('SleepinessReplacesLaziness', 'Sleepiness'), 'SleepinessReplacesLaziness');
  assert.equal(keepSpelling('Little By Little', 'Little by Little'), 'Little By Little');
  assert.equal(keepSpelling('Symphaticus Simulation', 'Sympathicus Simulation'), 'Sympathicus Simulation');
});

test('base skills carry their building_data slot, phase and level, and keep a hand-set icon', () => {
  const building = { chars: { char_test: { buffChar: [
    { buffData: [{ buffId: 'a', cond: { phase: 'PHASE_0', level: 1 } }, { buffId: 'b', cond: { phase: 'PHASE_0', level: 30 } }] },
    { buffData: [{ buffId: 'c', cond: { phase: 'PHASE_2', level: 1 } }] },
  ] } }, buffs: {
    a: { buffName: 'Laziness', roomType: 'DORMITORY', description: 'grants<$cc.bd_b1><@cc.rem>Worldly Plight</></><@cc.vup>+1</>' },
    b: { buffName: 'Sleepiness', roomType: 'DORMITORY', description: 'y' },
    c: { buffName: 'Pharmacology·α', roomType: 'WORKSHOP', description: 'z' },
  } };
  const character = { name: 'Durin', description: '', tagList: [], potentialRanks: [], skills: [], allSkillLvlup: [], talents: [] };
  const op = { name: 'Durin', internalName: 'char_test', skills: { skillList: [] }, talents: [], baseSkills: [
    { name: 'Laziness', facility: 'Dormitory', eliteLevel: 'Base', description: 'old' },
    { name: 'SleepinessReplacesLaziness', facility: 'Dormitory', eliteLevel: 'Level 30', description: 'old' },
    { name: 'Pharmacology α', facility: 'Workshop', eliteLevel: 'Elite 2', description: 'old', icon: '/custom.webp' },
  ] };
  const tables = { characters: { char_test: character }, skills: {}, building, modules: { equipDict: {} }, battleEquip: {}, items: { items: {} }, voiceTables: [], cn: null };
  const next = localizeReleasedMechanics(op, tables, []);
  assert.deepEqual(next.baseSkills.map((b: { name: string; eliteLevel: string; slot: number; phase: number; level: number; icon?: string }) => [b.name, b.eliteLevel, b.slot, b.phase, b.level, b.icon ?? null]), [
    ['Laziness', 'Base', 0, 0, 1, null],
    ['SleepinessReplacesLaziness', 'Level 30', 0, 0, 30, null],
    ['Pharmacology α', 'Elite 2', 1, 2, 1, '/custom.webp'],
  ]);
  // The repair reaches the record itself, not only normaliseBaseSkillText.
  assert.equal(next.baseSkills[0].description, 'grants Worldly Plight +1');
});

test('a module only CN has is built from the CN tables, and turns English the night Global has it', () => {
  const equip = (id: string, name: string) => ({ uniEquipId: id, charId: 'char_test', type: 'ADVANCED', typeName1: 'SWO', typeName2: 'Y', uniEquipName: name, charEquipOrder: 2,
    itemCost: { 1: [{ id: 'mod_unlock_token', count: 1 }] }, missionList: [] });
  const battle = (text: string) => ({ phases: [{ attributeBlackboard: [], parts: [{ target: 'DISPLAY', overrideTraitDataBundle: { candidates: [{ additionalDescription: text, blackboard: [] }] }, addOrOverrideTalentDataBundle: { candidates: null } }] }] });
  const current = [{ type: 'Upgrade', name: 'SWO-Y: New Contract', stages: [{ effectText: 'wiki words' }], note: 'kept' }];
  const cn = { modules: { equipDict: { m: equip('m', '新契约') }, missionList: {} }, battleEquip: { m: battle('攻击力提升') }, characters: {}, items: { items: { mod_unlock_token: { name: '模组数据块' } } }, materialNames: null };
  const enItems = { items: { mod_unlock_token: { name: 'Module Data Block' } } };
  const before = officialModules('char_test', { equipDict: {} }, current, {}, [], enItems, cn, []);
  assert.equal(before.length, 1);
  assert.deepEqual([before[0].name, before[0].moduleId, before[0].stages[0].effectText, before[0].note], ['SWO-Y: 新契约', 'm', '攻击力提升', 'kept']);
  assert.deepEqual(before[0].stages[0].cost, [{ name: 'Module Data Block', quantity: 1 }], 'an item Global has keeps its English name');
  const after = officialModules('char_test', { equipDict: { m: equip('m', 'New Contract') } }, before, { m: battle('ATK +10%') }, [], enItems, cn, []);
  assert.equal(after.length, 1);
  assert.deepEqual([after[0].name, after[0].stages[0].effectText, after[0].note], ['SWO-Y: New Contract', 'ATK +10%', 'kept']);
  assert.throws(() => officialModules('char_test', { equipDict: {} }, current, {}, [], enItems, undefined, []), /CN tables/);
  assert.throws(() => officialModules('char_test', { equipDict: {} }, current, {}, [], enItems, { ...cn, materialNames: undefined }, []), /material-names/);
});

test('a record is its game entry whatever the name order or quotes, and a form is its base operator in brackets', () => {
  for (const [record, game] of [['Yahata Umiri', 'Umiri Yahata'], ['Yūtenji Nyamu', 'Nyamu Yūtenji'], ['Justice Knight', "'Justice Knight'"], ['Amiya (Guard)', 'Amiya'], ['Amiya', 'Amiya']]) {
    assert.ok(sameOperator(record, game), `${record} / ${game}`);
  }
  assert.ok(!sameOperator('Amiya', 'Ch\'en'));
  const tables = { characters: {}, patch: { patchChars: { char_1001_amiya2: { name: 'Amiya' } } } };
  assert.equal(characterOf({ name: 'Amiya (Guard)', internalName: 'char_1001_amiya2' }, tables)?.name, 'Amiya');
  assert.equal(characterOf({ name: 'Someone Else', internalName: 'char_1001_amiya2' }, tables), null);
});
