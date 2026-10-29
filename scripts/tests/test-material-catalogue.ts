import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error Plain Node build script.
import { buildMaterialCatalogue } from '../build/build-material-catalogue.mjs';
// @ts-expect-error Plain Node helper.
import { itemTier, materialItems, readMaterialNames } from '../lib/material-items.mjs';
import { checkMaterialCatalogue, plannerCostNames } from '../../lib/farming/materialCatalogue.mjs';
import { materialOrderFor, sortMaterials } from '../../lib/farming/materialSortOrder';
import { withMaterialOrder } from '../../lib/content/materialOrderFallback';

/*
 * The planner's material catalogue is derived from the game's item tables, not typed out.
 * It used to be a list in lib/farming/materialSortOrder.ts, which missed the four materials
 * Closure, Crackborne and Kal'tsit - Esperanta cost on Global from 2026-10-14, with nothing to
 * say so. These cases hand the builder made-up tables shaped like the real ones.
 */

const item = (itemId: string, name: string, rarity: string, extra: object = {}) => ({ itemId, name, rarity, itemType: 'MATERIAL', classifyType: 'MATERIAL', ...extra });
const EN = {
  4001: item('4001', 'LMD', 'TIER_4', { itemType: 'GOLD' }),
  4006: item('4006', 'Purchase Certificate', 'TIER_3', { classifyType: 'NORMAL' }),
  2004: item('2004', 'Strategic Battle Record', 'TIER_5', { itemType: 'CARD_EXP' }),
  32001: item('32001', 'Chip Catalyst', 'TIER_4'),
  3213: item('3213', 'Vanguard Dualchip', 'TIER_5'),
  3212: item('3212', 'Vanguard Chip Pack', 'TIER_4'),
  3303: item('3303', 'Skill Summary - 3', 'TIER_4'),
  30063: item('30063', 'Integrated Device', 'TIER_3'),
  30062: item('30062', 'Device', 'TIER_2'),
  30135: item('30135', 'D32 Steel', 'TIER_5'),
  p_char_1_test: item('p_char_1_test', "Test's Token", 'TIER_6'),
};
/* The CN client has everything EN has, and the new line EN does not (31113/31114), under
   Chinese names. */
const CN = { ...EN, 31113: item('31113', '电极单元', 'TIER_3'), 31114: item('31114', '聚能动力单元', 'TIER_4') };
const NAMES = { version: 1, byItemId: { 31113: 'Electrode Unit', 31114: 'Concentrated Power Unit' } };
const recipe = (costs: [string, number][]) => ({ type: 'F_EVOLVE', room: 'WORKSHOP', count: 1, lmd: 0, costs: costs.map(([name, count]) => ({ name, count })), byproducts: [], byproductRate: 0, alternatives: [] });
const FORMULAS = {
  'Concentrated Power Unit': recipe([['Integrated Device', 1], ['Electrode Unit', 1]]),
  'Integrated Device': recipe([['Device', 3]]),
  'Vanguard Dualchip': { ...recipe([['Vanguard Chip Pack', 2], ['Chip Catalyst', 1]]), type: 'MANUFACTURE', room: 'FACTORY' },
  // A product no plan asks for: its ingredients must not come in with it.
  'Pure Gold': recipe([['Nothing Held', 1]]),
};
const cost = (...names: string[]) => names.map(name => ({ name, quantity: 1 }));
const closure = {
  name: 'Closure', internalName: 'char_4228_closur',
  potential: { totalCost: cost("Test's Token") },
  promotion: [{ cost: cost('LMD', 'Vanguard Dualchip', 'D32 Steel') }],
  skills: { skillList: [{ cost: { m3: cost('Skill Summary - 3', 'Concentrated Power Unit', 'Electrode Unit') } }], skillCost: {} },
  modules: [],
};
const SORT_IDS = { LMD: 10201, 'Purchase Certificate': 10205, 'Strategic Battle Record': 70001, 'Chip Catalyst': 400001, 'Vanguard Dualchip': 400002,
  'Vanguard Chip Pack': 400010, 'Skill Summary - 3': 80001, 'D32 Steel': 100004, 'Concentrated Power Unit': 100007, 'Electrode Unit': 100008,
  'Integrated Device': 100038, Device: 100039 };
const ICONS = [...Object.keys(SORT_IDS), "Test's Token"].map(name => `${name}.webp`);
const build = (over: object = {}) => buildMaterialCatalogue({ enItems: EN, cnItems: CN, names: NAMES, operators: [closure], formulas: FORMULAS,
  battleRecords: [{ name: 'Strategic Battle Record', exp: 2000 }], sortIds: SORT_IDS, icons: ICONS, ...over });

test('what a bill names, and what its crafts need, is what the depot holds', () => {
  const { catalogue, noItem, noIcon, noSortId } = build();
  assert.deepEqual([noItem, noIcon, noSortId], [[], [], []]);
  assert.deepEqual(catalogue.order, ['EXP', 'LMD', 'Purchase Certificate', 'Strategic Battle Record', 'Chip Catalyst', 'Vanguard Dualchip', 'Vanguard Chip Pack',
    'Skill Summary - 3', 'D32 Steel', 'Concentrated Power Unit', 'Electrode Unit', 'Integrated Device', 'Device']);
  // Potential tokens are not planned, and a recipe for something no plan asks for brings nothing in.
  assert.ok(!catalogue.order.includes("Test's Token") && !catalogue.order.includes('Nothing Held'));
  assert.deepEqual(catalogue.groups.map((group: { tag: string }) => group.tag), ['Skills & modules', 'Currency, records & chips', 'Tier 5', 'Tier 4', 'Tier 3', 'Tier 2']);
  assert.equal(checkMaterialCatalogue(catalogue), catalogue);
});

test('a material Global has not shipped takes its English name from material-names and its tier from the CN client', () => {
  const { catalogue } = build();
  assert.deepEqual(catalogue.items['Electrode Unit'], { itemId: '31113', tier: 3, client: 'CN' });
  assert.deepEqual(catalogue.items['Concentrated Power Unit'], { itemId: '31114', tier: 4, client: 'CN' });
  // Tier 4 before Tier 3, which the resolver's walk relies on.
  assert.ok(catalogue.order.indexOf('Concentrated Power Unit') < catalogue.order.indexOf('Electrode Unit'));
  assert.deepEqual(catalogue.groups.find((g: { tag: string }) => g.tag === 'Tier 3').names, ['Electrode Unit', 'Integrated Device']);
});

test('a cost with no item id, no icon or no depot place is left out and named, never guessed', () => {
  const noName = build({ names: { version: 1, byItemId: {} } });
  assert.ok(!noName.catalogue.order.includes('Electrode Unit'));
  assert.match(noName.noItem.join('\n'), /^Electrode Unit \(Closure's costs\)/m);
  const noIcon = build({ icons: ICONS.filter(file => file !== 'Concentrated Power Unit.webp') });
  assert.ok(!noIcon.catalogue.order.includes('Concentrated Power Unit'));
  assert.match(noIcon.noIcon.join('\n'), /^Concentrated Power Unit/m);
  const { Device: _, ...withoutDevice } = SORT_IDS;
  assert.match(build({ sortIds: withoutDevice }).noSortId.join('\n'), /^Device \(an ingredient of Integrated Device\)/m);
});

test('the item helpers read both mirrors\' rarity spellings, place CN-only items by the CN numbering, and report spent names', () => {
  assert.equal(itemTier({ rarity: 'TIER_3' }), 3);
  assert.equal(itemTier({ rarity: 2 }), 3, 'yuanyan3060 numbers the enum from 0');
  assert.equal(itemTier({}), null);
  const items = materialItems({ enItems: { 1: { name: 'A', sortId: 5 } }, cnItems: { 1: { name: 'Ａ', sortId: 7 }, 2: { name: '乙', sortId: 6 } }, names: { byItemId: { 2: 'B' } } });
  assert.deepEqual([items.idOf('A'), items.idOf('B'), items.idOf('乙'), items.nameOf('2'), items.sortId('1')], ['1', '2', '2', 'B', 7]);
  const spent = materialItems({ enItems: { 2: { name: 'B2' } }, cnItems: {}, names: { byItemId: { 2: 'B' } } }).spentNames();
  assert.deepEqual(spent, [{ id: '2', name: 'B', en: 'B2' }]);
  assert.throws(() => readMaterialNames({ version: 1, byItemId: { 1: ' padded ' } }), /is not/);
});

test('pages that only sort costs carry the slice of the catalogue order they need', () => {
  const { catalogue } = build();
  const order = materialOrderFor(catalogue, plannerCostNames(closure));
  assert.deepEqual(order, ['LMD', 'Vanguard Dualchip', 'Skill Summary - 3', 'D32 Steel', 'Concentrated Power Unit', 'Electrode Unit']);
  assert.deepEqual(sortMaterials(cost('Electrode Unit', 'Unknown', 'LMD'), order).map(i => i.name), ['LMD', 'Electrode Unit', 'Unknown']);
});

test('the checked-in catalogue and names are well formed, and the release job builds them', () => {
  checkMaterialCatalogue(JSON.parse(fs.readFileSync('data/material-catalogue.json', 'utf8')));
  readMaterialNames(JSON.parse(fs.readFileSync('data/material-names.json', 'utf8')));
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const at = (text: string) => { const i = workflow.indexOf(text); assert.ok(i >= 0, text); return i; };
  // After the records settle (the English refresh renames costs), before the gate reads it.
  assert.ok(at('stage operator-english') < at('stage material-catalogue --') && at('stage material-catalogue --') < at('stage import-aliases --needs material-catalogue --output data/material-catalogue.json'));
  assert.ok(at('stage import-aliases') < at('stage completeness'));
  // Both are records in arkpedia-data, pulled with the rest (scripts/content/pull-data.mjs).
  for (const file of ['data/material-catalogue.json', 'data/material-names.json']) assert.ok(fs.existsSync(file), `${file} was not pulled`);
});

test('a page from a release older than materialOrder gets it from the deployment, never crashes', async () => {
  const names = () => ['Electrode Unit', 'LMD', 'Nobody Heard Of This'];
  const upgraded = await withMaterialOrder({ value: 1 } as { value: number; materialOrder?: string[] }, names);
  assert.deepEqual(upgraded.materialOrder, ['LMD', 'Electrode Unit']);
  // A payload that carries its own is left alone: the release's order wins.
  const own = { value: 2, materialOrder: ['Electrode Unit', 'LMD'] };
  assert.equal(await withMaterialOrder(own, names), own);
  for (const page of ['pages/operators/[name].tsx', 'pages/events/[slug].tsx']) assert.match(fs.readFileSync(page, 'utf8'), /withMaterialOrder\(props, /, page);
});
