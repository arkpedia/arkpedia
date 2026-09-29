import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error Node import scripts are plain JavaScript.
import { fillMasteryCosts } from '../sync/sync-skill-masteries.mjs';
// @ts-expect-error Node import scripts are plain JavaScript.
import { materialItems } from '../lib/material-items.mjs';
import { recommendationsTellApart } from '../../lib/operators/skillRecommendation';

/*
 * An operator's mastery costs come from the game's own tables where the record lacks them
 * (scripts/sync/sync-skill-masteries.mjs): Pepe's first skill had M1 and no M2 or M3, and 36
 * operators had 53 skills with a mastery missing, which the operator page showed as "No
 * cost data". The tables here are invented; the shapes are the game's.
 */
const items = materialItems({
  enItems: { 3303: { name: 'Skill Summary - 3' }, 30073: { name: 'Loxic Kohl' }, 30135: { name: 'Crystalline Circuit' } },
  cnItems: { 31104: { name: '液化醚吸聚体' }, 31199: { name: '未命名材料' } },
  names: { version: 1, byItemId: { 31104: 'Liquified Ether Absorber' } },
});
const step = (...cost: [string, number][]) => ({ levelUpCost: cost.map(([id, count]) => ({ id, count, type: 'MATERIAL' })) });
const masteries = (a: [string, number][], b: [string, number][], c: [string, number][]) => [step(...a), step(...b), step(...c)];
const tables = (characters: object, skills: object = {}) => ({ characters, skills });
// A record's skills, as loose as the JSON.
const record = (name: string, skills: any[], rarity = 6) => ({ name, internalName: `char_${name}`, rarity, skills: { skillList: skills, skillCost: {} } });

test('a Global operator\'s missing masteries come from the Global table, and what the record has is kept', () => {
  const pepe = record('pepe', [{ name: 'Get Stamped!', cost: { m1: [{ name: 'Kept As Is', quantity: 1 }] } }]);
  const en = tables(
    { char_pepe: { skills: [{ skillId: 'skchr_pepe_1', levelUpCostCond: masteries([['3303', 8]], [['3303', 12], ['30135', 4]], [['3303', 15], ['30073', 1]]) }] } },
    { skchr_pepe_1: { levels: [{ name: 'Get Stamped!' }] } });
  const result = fillMasteryCosts(pepe, { en, cn: null, nameOf: items.nameOf });
  assert.deepEqual(result.filled.map(({ mastery }: { mastery: string }) => mastery), ['m2', 'm3']);
  assert.deepEqual(result.missing, []);
  const cost = result.operator.skills.skillList[0].cost;
  assert.deepEqual(Object.keys(cost), ['m1', 'm2', 'm3']);
  assert.deepEqual(cost.m1, [{ name: 'Kept As Is', quantity: 1 }], 'a mastery the record has is never touched');
  assert.deepEqual(cost.m3, [{ name: 'Skill Summary - 3', quantity: 15 }, { name: 'Loxic Kohl', quantity: 1 }]);
  assert.equal(pepe.skills.skillList[0].cost.m2, undefined, 'the record passed in is not changed');
  // Nothing left to fill: the same object back.
  assert.equal(fillMasteryCosts(result.operator, { en, cn: null, nameOf: items.nameOf }).operator, result.operator);
});

test('a CN-only operator\'s come from the CN table, with a CN-only material by its English name', () => {
  const thumpy = record('thumpy', [{ name: 'Aren\'t You Going?' }]);
  const cn = tables({ char_thumpy: { skills: [{ skillId: 'sk_1', levelUpCostCond: masteries([['3303', 8]], [['3303', 12]], [['3303', 15], ['31104', 6]]) }] } });
  const result = fillMasteryCosts(thumpy, { en: tables({}), cn, nameOf: items.nameOf });
  assert.equal(result.filled.length, 3);
  assert.deepEqual(result.operator.skills.skillList[0].cost.m3, [{ name: 'Skill Summary - 3', quantity: 15 }, { name: 'Liquified Ether Absorber', quantity: 6 }]);
});

test('a skill the Global table names differently, or a material with no English name, is reported and not filled', () => {
  const renamed = record('bubble', [{ name: 'Some Other Skill' }]);
  const en = tables({ char_bubble: { skills: [{ skillId: 'sk_b', levelUpCostCond: masteries([['3303', 8]], [['3303', 12]], [['3303', 15]]) }] } }, { sk_b: { levels: [{ name: '"Beaten Up"' }] } });
  const one = fillMasteryCosts(renamed, { en, cn: null, nameOf: items.nameOf });
  assert.equal(one.operator, renamed);
  assert.match(one.missing[0].why, /names this skill differently/);
  // Quotes and case are not a different name.
  assert.equal(fillMasteryCosts(record('bubble', [{ name: 'Beaten Up' }]), { en, cn: null, nameOf: items.nameOf }).filled.length, 3);

  const unnamed = record('new', [{ name: 'x' }]);
  const cn = tables({ char_new: { skills: [{ skillId: 'sk_n', levelUpCostCond: masteries([['3303', 8]], [['3303', 12]], [['31199', 6]]) }] } });
  const two = fillMasteryCosts(unnamed, { en: tables({}), cn, nameOf: items.nameOf });
  assert.deepEqual(two.filled.map(({ mastery }: { mastery: string }) => mastery), ['m1', 'm2']);
  assert.match(two.missing[0].why, /no English name yet \(item 31199\)/);
  // No table at all: reported as such.
  assert.match(fillMasteryCosts(record('none', [{ name: 'x' }]), { en: tables({}), cn: tables({}), nameOf: items.nameOf }).missing[0].why, /no table has it yet/);
});

test('below 4 stars there are no masteries to fill', () => {
  const three = record('three', [{ name: 'x' }], 3);
  assert.deepEqual(fillMasteryCosts(three, { en: tables({}), cn: null, nameOf: items.nameOf }), { operator: three, filled: [], missing: [] });
});

test('the stage runs in the refresh, after the English refresh and before the material catalogue', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const at = (name: string) => workflow.indexOf(`stage ${name} `);
  assert.ok(at('operator-english') > 0 && at('operator-english') < at('skill-masteries') && at('skill-masteries') < at('material-catalogue'));
});

test('a skill recommendation is shown only where it tells the skills apart', () => {
  // Pepe: every skill M3 with no order says nothing about any one of them.
  assert.equal(recommendationsTellApart([1, 2, 3].map(() => ({ recommendation: [{ mastery: 'm3', rating: 0 }] }))), false);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: null }]), false);
  // Ranked, or one skill recommended and not another.
  assert.equal(recommendationsTellApart([{ recommendation: [{ mastery: 'm3', order: '1st' }] }, { recommendation: [{ mastery: 'm3', order: '2nd' }] }]), true);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: [{ mastery: 'm3' }] }]), true);
  const pepe = JSON.parse(fs.readFileSync('data/operators-6star/Pepe.json', 'utf8'));
  assert.equal(recommendationsTellApart(pepe.skills.skillList), false);
});
