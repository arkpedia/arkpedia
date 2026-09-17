import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error JavaScript importer is also used directly by the refresh job.
import { localizeOperator, localizeReleasedMechanics, officialVoiceActors, shouldRefreshReleasedOperator } from '../sync/sync-operator-english.mjs';

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
    modules: { equipDict: {}, missionList: {} }, items: { items: { item: { name: 'Material' } } },
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
