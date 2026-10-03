import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error JavaScript importer is also used directly by the refresh job.
import { handWrittenFields, keepSpelling, localizeOperator, localizeReleasedMechanics, officialModules, officialVoiceActors, shouldRefreshReleasedOperator } from '../sync/sync-operator-english.mjs';

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

test('scheduled refreshes cover newly released operators without rewriting the full roster', () => {
  const now = Date.UTC(2026, 8, 17);
  assert.equal(shouldRefreshReleasedOperator({ characterInfo: { 'Release Date': '2026/09/10' } }, now), true);
  assert.equal(shouldRefreshReleasedOperator({ characterInfo: { 'Release Date': '2026/10/01' } }, now), false);
  assert.equal(shouldRefreshReleasedOperator({ characterInfo: { 'Release Date': '2025/01/01' } }, now), false);
  assert.equal(shouldRefreshReleasedOperator({ review: { official: '尚未翻译' } }, now), true);
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
    modules: { equipDict: {}, missionList: {} }, battleEquip: {}, items: { items: { item: { name: 'Material' } } },
    voiceTables: [{ voiceLangDict: { char_test: { dict: { EN: { cvName: ['Current Actor'] } } } } }],
  };
  const next = localizeReleasedMechanics(unreleased, tables);
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
  const updated = officialModules('char_test', { equipDict }, current, {}, [], { items: {} });
  assert.deepEqual(updated.map((m: { stages: { effectText: string }[] }) => m.stages[0].effectText), ['X trait', 'Y trait', 'IS trait', 'CN trait']);
  assert.equal(updated[2].name, 'ISW-α: Current a');
  assert.deepEqual(updated.slice(0, 3).map((m: { moduleId?: string }) => m.moduleId), ['x', 'y', 'a']);
  assert.deepEqual(officialModules('char_test', { equipDict }, updated, {}, [], { items: {} }), updated, 'repeat refresh is idempotent');
  assert.throws(() => officialModules('char_test', { equipDict }, current, undefined, [], { items: {} }), /battle_equip_table/);
  const forms = officialModules('char_test', { equipDict, charEquip: { char_test: ['x'] } }, current, {}, [], { items: {} });
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
  const [module] = officialModules('char_test', { equipDict }, current, battleEquip, ['Power'], { items: { mod_unlock_token: { name: 'Module Data Block' } } });
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
  const op = { name: 'Manticore', internalName: 'char_test', skills: { skillList: [] }, talents: [
    { name: 'Hidden Killer - Medium', rows: [] },
    { name: 'Hidden Killer - EliteReplacesHidden Killer - Medium', rows: [], technique: [{ name: 'Invisibility', description: 'x' }] },
  ] };
  const tables = { characters: { char_test: character }, skills: {}, building: { chars: {}, buffs: {} }, modules: { equipDict: {} }, battleEquip: {}, items: { items: {} }, voiceTables: [] };
  const next = localizeReleasedMechanics(op, tables);
  assert.equal(next.talents.length, 1);
  assert.equal(next.talents[0].name, 'Hidden Killer - Elite');
  assert.deepEqual(next.talents[0].technique, [{ name: 'Invisibility', description: 'x' }]);
  assert.deepEqual(next.talents[0].rows.map((r: { stage: string }) => r.stage), ['Elite 1', 'Elite 2']);
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
    a: { buffName: 'Laziness', roomType: 'DORMITORY', description: 'x' },
    b: { buffName: 'Sleepiness', roomType: 'DORMITORY', description: 'y' },
    c: { buffName: 'Pharmacology·α', roomType: 'WORKSHOP', description: 'z' },
  } };
  const character = { name: 'Durin', description: '', tagList: [], potentialRanks: [], skills: [], allSkillLvlup: [], talents: [] };
  const op = { name: 'Durin', internalName: 'char_test', skills: { skillList: [] }, talents: [], baseSkills: [
    { name: 'Laziness', facility: 'Dormitory', eliteLevel: 'Base', description: 'old' },
    { name: 'SleepinessReplacesLaziness', facility: 'Dormitory', eliteLevel: 'Level 30', description: 'old' },
    { name: 'Pharmacology α', facility: 'Workshop', eliteLevel: 'Elite 2', description: 'old', icon: '/custom.webp' },
  ] };
  const tables = { characters: { char_test: character }, skills: {}, building, modules: { equipDict: {} }, battleEquip: {}, items: { items: {} }, voiceTables: [] };
  const next = localizeReleasedMechanics(op, tables);
  assert.deepEqual(next.baseSkills.map((b: { name: string; eliteLevel: string; slot: number; phase: number; level: number; icon?: string }) => [b.name, b.eliteLevel, b.slot, b.phase, b.level, b.icon ?? null]), [
    ['Laziness', 'Base', 0, 0, 1, null],
    ['SleepinessReplacesLaziness', 'Level 30', 0, 0, 30, null],
    ['Pharmacology α', 'Elite 2', 1, 2, 1, '/custom.webp'],
  ]);
});
