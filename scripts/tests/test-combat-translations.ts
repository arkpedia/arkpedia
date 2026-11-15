import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TranslationNote from '../../components/operators/TranslationNote';
import { getSkillList } from '../../lib/operators/operatorTypes';
import { getSkillIconPath, getBaseSkillIconPath } from '../../lib/operators/operatorIconPaths';
import { translateOperator, type Translation } from '../../lib/operators/operatorTranslations';
import { getAllOperators } from '../../lib/operators/operators';
import { operatorPreviewSource, buildGachaOperatorPreview } from '../../lib/gacha/operatorPreviewData';
import type { Operator } from '../../lib/operators/operatorTextTypes';
// @ts-expect-error Shared with the nightly JavaScript importer.
import { combatKeywords } from '../lib/combat-keywords.mjs';

const hasSupplement = fs.existsSync('data/operator-translations.json') && fs.existsSync('data/combat-keywords.json');
const translations: Record<string, Translation> = {
  char_test: { translator: 'Test translator', strings: { '中文': 'English', '天赋': 'Talent' } },
};
const operator = { internalName: 'char_test', sourceRegion: 'CN', trait: '中文', talents: [{ name: '天赋', rows: [] }] } as unknown as Operator;

test('CN overlay matches source text exactly, preserves the original, and gives way to Global English', () => {
  const actual = translateOperator(operator, translations);
  assert.equal(actual.trait, 'English');
  assert.equal(actual.talents![0].name, 'Talent');
  assert.equal(actual.translationCredit, 'Test translator');
  assert.deepEqual(actual.translationCredits, { trait: 'Test translator', talents: 'Test translator' });
  assert.equal(operator.trait, '中文');
  assert.equal(translateOperator({ ...operator, trait: '新版本', talents: [] }, translations).trait, '新版本');
  const official = { ...operator, sourceRegion: 'Global' as const };
  assert.equal(translateOperator(official, translations), official);
  assert.equal(translateOperator(operator, {}), operator, 'an older content snapshot remains usable');
});

test('an untranslated or changed CN section never claims to be an English fan translation', () => {
  for (const text of ['行动预备组A6的队长', ['English trait', '尚未翻译的简介']]) {
    const html = renderToStaticMarkup(createElement(TranslationNote, { region: 'CN', credit: 'Other section translator', text }));
    assert.match(html, /English translation incomplete/);
    assert.doesNotMatch(html, /Unofficial fan translation|Translator uncredited/);
  }
  const html = renderToStaticMarkup(createElement(TranslationNote, { region: 'CN', text: 'English description' }));
  assert.match(html, /Unofficial fan translation/);
  assert.match(html, /Translator uncredited/);
  assert.equal(renderToStaticMarkup(createElement(TranslationNote, { region: 'Global', text: 'Official English' })), '');
});

test('CN overview translation is exact, leaves editorial text alone, and credits only changed sections', () => {
  const raw = { ...operator, trait: 'Existing fan translation', talents: [], review: { official: '中文', author: '中文' } } as unknown as Operator;
  const actual = translateOperator(raw, translations);
  assert.equal(actual.review?.official, 'English');
  assert.equal((actual.review as unknown as { author: string }).author, '中文');
  assert.deepEqual(actual.translationCredits, { review: 'Test translator' });
  assert.equal(raw.review?.official, '中文');
});

test('every CN operator overview is English, including Violet Mizutsune Orchid', { skip: !hasSupplement }, () => {
  for (const op of getAllOperators().filter(op => op.sourceRegion === 'CN')) {
    assert.doesNotMatch(op.review?.official ?? '', /\p{Script=Han}/u, op.name);
    if (op.name === 'Violet Mizutsune Orchid') {
      assert.match(op.review?.official ?? '', /Captain of Op Reserve A6/);
      assert.equal(op.translationCredits?.review, 'Arkpedia (AI-assisted)');
      assert.equal(op.translationCredits?.skills, undefined, 'existing English skills must not acquire the overview translator credit');
    }
  }
});

test('elemental explanations distinguish enemies and allies and strip game markup', () => {
  const entries = combatKeywords({ termDescriptionDict: {
    ally: { termId: 'ba.dt.neural', termName: 'Nervous Impairment', description: '<$ba.stun>Stunned</> for 10s' },
    enemy: { termId: 'ba.dt.neural2', termName: 'Nervous Impairment - Ally', description: '6000 damage and 3 stacks of <$ba.palsy>Paralysis</>' },
  } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].definition, 'Against enemies: 6000 damage and 3 stacks of Paralysis\nOn allies: Stunned for 10s');
});

test('populated CN mechanics are English at every rank and previews retain definitions and attribution', { skip: !hasSupplement && 'Older content snapshot has no translation supplement' }, () => {
  const operators = getAllOperators();
  for (const name of ['Homebound', 'Pedro', 'de Toledo', 'Clementia', 'Mechanist', 'Jacinta']) {
    const op = operators.find(op => op.name === name)!;
    assert.ok(op, name);
    assert.equal(op.translationCredit, 'Arkpedia (AI-assisted)');
    assert.doesNotMatch(JSON.stringify([op.trait, op.talents, op.skills, op.potential, op.modules, op.baseSkills, op.tags], (key, value) => key === 'rawName' || key === 'icon' ? undefined : value), /\p{Script=Han}/u, name);
    const preview = buildGachaOperatorPreview(operatorPreviewSource(op));
    assert.equal(preview.translationCredit, op.translationCredit);
    assert.deepEqual(preview.combatKeywords, op.combatKeywords);
  }
  const clementia = operators.find(op => op.name === 'Clementia')!;
  assert.ok(clementia.combatKeywords?.some(term => term.name === 'Corrosion'));
});

test('translations preserve all source numeric values, including every skill and talent upgrade', { skip: !hasSupplement && 'Older content snapshot has no translation supplement' }, () => {
  const data = JSON.parse(fs.readFileSync('data/operator-translations.json', 'utf8')) as Record<string, Translation>;
  const numbers = (text: string): string[] => (text.match(/\d+(?:\.\d+)?/g) ?? []).sort();
  for (const entry of Object.values(data)) for (const [source, english] of Object.entries(entry.strings)) {
    const remaining = numbers(english);
    for (const value of numbers(source)) {
      const index = remaining.indexOf(value);
      assert.ok(index >= 0, `${value} missing from ${english}`);
      remaining.splice(index, 1);
    }
  }
});

test('translated labels retain original skill and base-skill artwork paths', () => {
  const raw = { ...operator, name: 'Test', skills: { skillList: [{ name: '中文', icon: null, levels: [] }], skillCost: {} }, baseSkills: [{ name: '中文', icon: null }] } as unknown as Operator;
  const translated = translateOperator(raw, translations);
  assert.equal(getSkillList(translated)[0].icon, getSkillIconPath(raw.name, '中文'));
  assert.equal(getBaseSkillIconPath(translated.name, translated.baseSkills![0]), getBaseSkillIconPath(raw.name, raw.baseSkills![0]));
});

test('CN-only modules on Global operators translate without relabeling official skills', { skip: !hasSupplement && 'Older snapshot has no supplement' }, () => {
  for (const op of getAllOperators().filter(op => op.sourceRegion !== 'CN' && op.modules?.some(module => module.translationCredit))) {
    assert.equal(op.translationCredit, undefined);
    assert.doesNotMatch(JSON.stringify(op.modules), /\p{Script=Han}/u, op.name);
    const preview = buildGachaOperatorPreview(operatorPreviewSource(op));
    assert.deepEqual(preview.modules.map(module => module.translationCredit), op.modules?.map(module => module.translationCredit));
  }
});

test('old published operator props receive the same text enrichment as source compilation', async () => {
  const { completeOperatorText } = await import('../../lib/operators/operatorTextServer');
  const raw = JSON.parse(fs.readFileSync('data/operators-6star/Clementia.json', 'utf8')) as Operator;
  const page = { operator: raw, retained: 'other published page props' };
  const completed = await completeOperatorText(page);
  assert.equal(completed.retained, page.retained);
  assert.equal(completed.operator.operatorTextVersion, 2);
  assert.equal(getSkillList(completed.operator)[0].name, 'Erosion');
  assert.ok(completed.operator.combatKeywords?.some(term => term.name === 'Corrosion'));
  assert.equal(await completeOperatorText(completed), completed, 'already enriched published props remain authoritative');
  const legacy = await completeOperatorText({ operator: { ...raw, operatorTextVersion: 1 as const } });
  assert.equal(legacy.operator.operatorTextVersion, 2);
  assert.doesNotMatch(legacy.operator.review?.official ?? '', /\p{Script=Han}/u, 'version 1 payloads must receive the missing overview translation');
  assert.equal(getSkillList(raw)[0].name, '冲蚀', 'the cached published object is not mutated');
});
