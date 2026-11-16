import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TranslationNote from '../../components/operators/TranslationNote';
import { applyBaseSkillGlossary, type BaseSkillGlossary } from '../../lib/operators/baseSkillGlossary';
import { getSkillList } from '../../lib/operators/operatorTypes';
import { getSkillIconPath, getBaseSkillIconPath } from '../../lib/operators/operatorIconPaths';
import { enrichOperatorText, translateOperator, type Translation } from '../../lib/operators/operatorTranslations';
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

test('CN shared base terms use game IDs, consistent English and the same member explanations', () => {
  const glossary = JSON.parse(fs.readFileSync('data/base-skill-glossary.json', 'utf8')) as BaseSkillGlossary;
  const ops = getAllOperators();
  const orchid = ops.find(op => op.name === 'Violet Mizutsune Orchid')!;
  const recon = ops.find(op => op.name === 'Rhodes Island Recon')!;
  const orchidGroup = orchid.baseSkills!.flatMap(skill => skill.keywords ?? []).find(term => term.term === 'cc.tag.mh2')!;
  const reconGroup = recon.baseSkills!.flatMap(skill => skill.keywords ?? []).find(term => term.term === 'cc.tag.mh2')!;
  assert.deepEqual(orchidGroup, reconGroup);
  assert.equal(orchidGroup.name, 'Bubble Kingdom Hunting Squad');
  for (const name of ['Violet Mizutsune Orchid', 'Zinogre S Catapult', 'Rhodes Island Recon']) assert.ok(orchidGroup.definition.includes(name));
  const helper = recon.baseSkills!.find(skill => skill.buffId === 'dorm_rec_single&tag[000]')!;
  assert.match(helper.description!, /Monster Hunter Party/);
  assert.doesNotMatch(helper.description!, /Monster Hunter Squad/);
  const firstParty = helper.keywords!.find(term => term.term === 'cc.tag.mh')!;
  assert.match(firstParty.definition, /Kirin R Yato/);
  assert.doesNotMatch(firstParty.definition, /Violet Mizutsune Orchid/);
  assert.notEqual(firstParty.term, reconGroup.term, 'the two Monster Hunter groups stay distinct');
  const plain = { ...helper, buffId: 'unrelated', keywords: undefined, description: 'Monster Hunter Squad' };
  assert.equal(applyBaseSkillGlossary([plain], glossary)![0].description, plain.description, 'similar wording without the game term ID is not enough');
  const official = { ...recon, sourceRegion: 'Global' as const, baseSkills: [{ ...helper, description: 'Monster Hunter Squad' }] };
  assert.deepEqual(enrichOperatorText(official, {}, [], glossary).baseSkills, official.baseSkills, 'official Global prose and keywords remain exactly as published');
  const again = applyBaseSkillGlossary(recon.baseSkills, glossary)!;
  assert.deepEqual(again, recon.baseSkills, 're-enrichment does not duplicate keywords');
  assert.match(recon.review!.official!, /Bubble Kingdom/);
  assert.doesNotMatch(recon.review!.official!, /Land of Bubbles|Aigis/);
  assert.match(ops.find(op => op.name === 'Aegis')!.review!.official!, /Aegis/);
});

test('populated CN mechanics are English at every rank and previews retain definitions and attribution', { skip: !hasSupplement && 'Older content snapshot has no translation supplement' }, () => {
  const operators = getAllOperators();
  for (const op of operators.filter(op => op.sourceRegion === 'CN')) {
    const name = op.name;
    assert.ok(op, name);
    if (op.translationCredit) assert.equal(op.translationCredit, 'Arkpedia (AI-assisted)');
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
  for (const entry of Object.values(data)) for (const [source, english] of [...Object.entries(entry.strings), ...Object.entries(entry.legacyStrings ?? {})]) {
    const remaining = numbers(english).map(Number);
    for (const value of numbers(source)) {
      const index = remaining.indexOf(Number(value));
      assert.ok(index >= 0, `${value} missing from ${english}`);
      remaining.splice(index, 1);
    }
  }
});

test('CN wording uses the same beast terminology and states module squad caps explicitly', { skip: !hasSupplement }, () => {
  const ops = getAllOperators();
  const herdbells = ops.find(op => op.internalName === 'char_4170_hdbell')!;
  assert.match(herdbells.review?.official ?? '', /burdenbeast/);
  assert.doesNotMatch(herdbells.review?.official ?? '', /herdbeast/i);
  assert.match(JSON.stringify(getSkillList(herdbells)), /burdenbeast/);
  for (const [id, limit] of [['char_1045_svash2', 7], ['char_4246_dminon', 9]] as const) {
    const op = ops.find(op => op.internalName === id)!;
    assert.ok(JSON.stringify(op.modules?.map(module => module.mission)).includes(`at most ${limit} other Operators`), op.name);
  }
});

test('older English fan corrections are exact and bypass official Global module prose', () => {
  const source = 'Older fan sentence';
  const supplement: Record<string, Translation> = { char_test: { translator: 'Test translator', strings: {}, legacyStrings: { [source]: 'Corrected fan sentence' } } };
  const raw = { ...operator, trait: '', talents: [], review: { official: source }, modules: [{ name: source, type: 'Upgrade', stages: [] }] } as unknown as Operator;
  assert.equal(translateOperator(raw, supplement).review?.official, 'Corrected fan sentence');
  assert.equal(translateOperator({ ...raw, review: { ...raw.review!, official: `${source} (revised)` } }, supplement).review?.official, `${source} (revised)`);
  const official = { ...raw, sourceRegion: 'Global' as const };
  assert.equal(translateOperator(official, supplement), official);
});

test('version 4 published fan wording receives the corrected CN overview', { skip: !hasSupplement }, async () => {
  const op = getAllOperators().find(op => op.internalName === 'char_4170_hdbell')!;
  const older = { ...op, operatorTextVersion: 4 as const, review: { ...op.review!, official: op.review!.official!.replaceAll('burdenbeast', 'herdbeast') } };
  const { completeOperatorText } = await import('../../lib/operators/operatorTextServer');
  const result = await completeOperatorText({ operator: older });
  assert.equal(result.operator.operatorTextVersion, 5);
  assert.match(result.operator.review?.official ?? '', /burdenbeast/);
  assert.doesNotMatch(result.operator.review?.official ?? '', /herdbeast/);
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
  assert.equal(completed.operator.operatorTextVersion, 5);
  assert.equal(getSkillList(completed.operator)[0].name, 'Erosion');
  assert.ok(completed.operator.combatKeywords?.some(term => term.name === 'Corrosion'));
  assert.equal(await completeOperatorText(completed), completed, 'already enriched published props remain authoritative');
  const legacy = await completeOperatorText({ operator: { ...raw, operatorTextVersion: 1 as const } });
  assert.equal(legacy.operator.operatorTextVersion, 5);
  assert.doesNotMatch(legacy.operator.review?.official ?? '', /\p{Script=Han}/u, 'version 1 payloads must receive the missing overview translation');
  assert.equal(getSkillList(raw)[0].name, '冲蚀', 'the cached published object is not mutated');
});

test('Talulah talents include every promotion and potential and retain scoped wiki attribution', { skip: !hasSupplement }, async () => {
  const op = getAllOperators().find(op => op.name === 'Talulah')!;
  assert.equal(op.talents?.[0].name, 'Never Compromise');
  assert.equal(op.talents?.[1].name, 'I Am The Flame');
  assert.equal(op.talents?.[0].rows.length, 6);
  assert.equal(op.talents?.[1].rows.length, 2);
  assert.match(op.talents![0].rows[4].description!, /11%.*Burn.*3 seconds.*15%/s);
  assert.match(op.talents![1].rows[0].description!, /While deployed.*5 seconds.*passable ground.*3 seconds.*25 tiles.*12%.*0.3 seconds/s);
  assert.match(op.translationCredits?.talents ?? '', /Arknights Terra Wiki.*CC BY-SA 4.0.*oldid=780685/);
  assert.equal(op.translationCredits?.review, 'Arkpedia (AI-assisted)', 'wiki credit must not be applied to an independently translated overview');
  const html = renderToStaticMarkup(createElement(TranslationNote, { region: 'CN', credit: op.translationCredits?.talents, text: op.talents }));
  assert.match(html, /href="https:\/\/arknights.wiki.gg\/w\/index.php\?title=Talulah&amp;oldid=780685"/);
  const { completeOperatorText } = await import('../../lib/operators/operatorTextServer');
  const raw = JSON.parse(fs.readFileSync('data/operators-6star/Talulah.json', 'utf8')) as Operator;
  const completed = await completeOperatorText({ operator: { ...raw, operatorTextVersion: 3 as const } });
  assert.equal(completed.operator.talents?.[0].name, 'Never Compromise', 'the production version 3 payload must receive the missing mechanics');
});

test('checked CN mechanics preserve qualifications omitted or incorrect in the wiki', { skip: !hasSupplement }, () => {
  const ops = getAllOperators();
  const caleido = ops.find(op => op.name === 'Caleido')!;
  for (const rank of getSkillList(caleido)[1].levels!) assert.match(rank.description!, /converts 30%.*half that amount of Frenzy/);
  const toska = ops.find(op => op.internalName === 'char_4244_tocka')!;
  assert.match(toska.talents![1].rows[0].description!, /after applying a Trigger effect/);
  const territory = ops.find(op => op.internalName === 'char_4246_dminon')!;
  assert.match(territory.talents![1].rows[0].description!, /all ground enemies/);
  const source = JSON.parse(fs.readFileSync('data/operators-6star/Территория.json', 'utf8')) as Operator;
  getSkillList(source)[2].levels!.forEach((rank, index) => {
    const [, atk, aspd] = rank.description!.match(/攻击力\+(\d+)%，攻击速度\+(\d+)/)!;
    assert.ok(getSkillList(territory)[2].levels![index].description!.includes(`ATK +${atk}%, ASPD +${aspd}`));
  });
});
