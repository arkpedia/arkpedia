#!/usr/bin/env node
/**
 * Checks that the three foreign planner formats still read.
 *
 * WHY THIS EXISTS. data/import-aliases.json drifting away from
 * MATERIAL_SORT_ORDER already fails the build -- lib/planner/foreignImport.ts
 * asserts it at module load. What nothing catches is the PARSERS going wrong:
 * Krooster's CSV finds its columns by header name, ark-nights' crafting list is
 * the one field beyond the inventory that maps to anything here, and an absent
 * crafting section has to stay distinguishable from an empty one. Break any of
 * those and an import still lands, still says it landed, and is quietly missing
 * a column -- the class of wrong answer this site keeps paying for.
 *
 * The fixtures are trimmed from real exports and inlined, so this needs no
 * network and no file anybody has to keep.
 *
 * Run:  npm run audit:import
 */
import { parseTransfer, formatBundle } from '@/lib/planner/transfer';
import { clampBuilderStates, knownPlanNames } from '@/lib/planner/builderStates';
import { MAX_IMPORT_BYTES } from '@/lib/planner/untrusted';

let failures = 0;
function check(label: string, cond: boolean, saw = '') {
  if (!cond) { failures++; console.log(`FAIL  ${label}${saw ? ` -- saw ${saw}` : ''}`); }
  else console.log(`ok    ${label}`);
}

/* --- Krooster's CSV. Real ids and counts, four rows plus the EXP row it always
   carries. `needed` is present precisely so we can check it is NOT read. */
const CSV = [
  'itemId, itemName, owned, needed',
  '4001,LMD,10410973,1061409',
  '30012,Orirock Cube,1374,13',
  '30084,Manganese Trihydrate,0,0',
  'mod_unlock_token,Module Data Block,20,12',
  'EXP,Operator EXP,0,588286',
].join('\n');

const csv = parseTransfer(CSV);
check('CSV reads', csv?.shape === 'krooster-csv', String(csv?.shape));
check('CSV: LMD by itemId', csv?.depot?.LMD === 10410973, String(csv?.depot?.LMD));
check('CSV: a token id resolves', csv?.depot?.['Module Data Block'] === 20, String(csv?.depot?.['Module Data Block']));
check('CSV: a zero is not stored', csv?.depot?.['Manganese Trihydrate'] === undefined);
check('CSV: `needed` is not read', csv?.depot?.['Orirock Cube'] === 1374, String(csv?.depot?.['Orirock Cube']));
check('CSV: operator EXP is a named skip', JSON.stringify(csv?.unheld) === '["EXP"]', JSON.stringify(csv?.unheld));
check('CSV: carries no roster or goals', csv?.roster === null && csv?.goals === null);
check('CSV: says nothing about crafting', csv?.crafting === null, JSON.stringify(csv?.crafting));

/* Columns are found by name, so a reordered header must still read right --
   this one puts `needed` where `owned` was. */
const SWAPPED = 'itemId, itemName, needed, owned\n30012,Orirock Cube,13,1374';
check('CSV: columns are found by header name, not position',
  parseTransfer(SWAPPED)?.depot?.['Orirock Cube'] === 1374,
  String(parseTransfer(SWAPPED)?.depot?.['Orirock Cube']));

/* --- Krooster's penguin-stats JSON: the same ids, `have` instead of `owned`. */
const PENGUIN = JSON.stringify({
  '@type': '@penguin-statistics/planner/config',
  items: [{ id: '4001', have: 10410973, need: 1061409 }, { id: '30012', have: 1374, need: 13 }],
});
const peng = parseTransfer(PENGUIN);
check('penguin reads', peng?.shape === 'penguin-stats', String(peng?.shape));
check('penguin: same numbers as the CSV',
  peng?.depot?.LMD === 10410973 && peng?.depot?.['Orirock Cube'] === 1374);

/* --- ark-nights, keyed on arkgraph's codes rather than the game's ids. */
const ARKN = JSON.stringify({
  version: '2.6.0',
  records: [],
  stock: { 'G-4-1': 1234, 'E-2-1': 47890, 'M-4-8': 124, 'W-5-1': 240781, 'M-4-20': 99 },
  focus_materials: [],
  compound_materials: [{ id: 'M-4-8', options: {} }, { id: 'M-5-2', options: {} }],
});
const arkn = parseTransfer(ARKN);
check('ark-nights reads', arkn?.shape === 'ark-nights', String(arkn?.shape));
check('ark-nights: G-4-1 is LMD', arkn?.depot?.LMD === 1234, String(arkn?.depot?.LMD));
check('ark-nights: M-4-8 is Manganese Trihydrate', arkn?.depot?.['Manganese Trihydrate'] === 124);
check('ark-nights: W-5-1 is a module token', arkn?.depot?.['Module Data Block'] === 240781);
check('ark-nights: a CN-only code is skipped, not fatal',
  JSON.stringify(arkn?.unheld) === '["M-4-20"]', JSON.stringify(arkn?.unheld));
check('ark-nights: compound_materials becomes the crafting list',
  JSON.stringify(arkn?.crafting) === '["Bipolar Nanoflake","Manganese Trihydrate"]',
  JSON.stringify(arkn?.crafting));
check('ark-nights: an empty compound list is a statement, not silence',
  JSON.stringify(parseTransfer(JSON.stringify({ version: '1', stock: { 'G-4-1': 1 }, compound_materials: [] }))?.crafting) === '[]');
check('ark-nights: an absent compound list is silence',
  parseTransfer(JSON.stringify({ version: '1', stock: { 'G-4-1': 1 } }))?.crafting === null);

/* --- our own format, which must not have regressed under any of that. */
const bundle = formatBundle({ LMD: 5 }, {}, ['Texas'], { Texas: {} }, new Set(['D32 Steel']));
const own = parseTransfer(bundle);
check('our bundle still reads', own?.shape === 'bundle', String(own?.shape));
check('our bundle carries crafting', JSON.stringify(own?.crafting) === '["D32 Steel"]', JSON.stringify(own?.crafting));
const older = JSON.parse(bundle) as Record<string, unknown>;
delete older.crafting;
check('a bundle from before the crafting field says nothing rather than nothing-at-all',
  parseTransfer(JSON.stringify(older))?.crafting === null);
check('an old bare depot export still reads', parseTransfer('{"Orirock Cube": 4}')?.shape === 'depot');
check('a bundle version from the future is refused', parseTransfer('{"kind":"arkpedia-planner","version":99}') === null);

/* --- what must be refused. A count we cannot read fails the whole file; a KEY
   we do not know does not, because every real export carries a few. */
const refuse: [string, string][] = [
  ['a row shifted by a comma in a material name', 'itemId, itemName, owned, needed\n30012,Orirock, Cube,1374,0'],
  ['a count that is not a number', 'itemId, itemName, owned, needed\n30012,Orirock Cube,lots,0'],
  ['a CSV with no owned column', 'itemId, itemName, needed\n30012,Orirock Cube,0'],
  ['a file whose every id is unknown', 'itemId, itemName, owned, needed\n99999999,Nothing,5,0'],
  ['penguin with a bad have', '{"@type":"@penguin-statistics/planner/config","items":[{"id":"4001","have":"x"}]}'],
  ['ark-nights with a bad count', '{"version":"2.6.0","stock":{"G-4-1":"lots"}}'],
  ['ark-nights naming nothing at all', '{"version":"2.6.0","stock":{}}'],
  ['ark-nights with a malformed compound entry', '{"version":"2.6.0","stock":{"G-4-1":1},"compound_materials":[{"nope":1}]}'],
  ['gibberish', 'hello'],
  ['nothing', '   '],
];
for (const [label, text] of refuse) check(`refused: ${label}`, parseTransfer(text) === null);

/* --- what a HOSTILE file can and cannot do. Nothing in an import can run code:
   every string becomes a React text node and the page has no HTML sink. What
   it could do, before these guards, was exhaust and confuse -- a count of 1e300,
   a mastery target of a billion that goalsFor counts up to, a key of __proto__
   that re-parents the object it lands in, a hundred thousand names that each
   fetch their own JSON -- and because the page saves what it loads, hang the
   planner on every visit until site data is cleared. Each guard below has been
   proven by breaking it once; keep it that way. */
const plain = Object.prototype;

const protoDepot = parseTransfer('{"__proto__": 5, "constructor": 9, "Orirock Cube": 4}');
check('hostile: a prototype key in a bare depot is dropped, not assigned',
  protoDepot?.shape === 'depot' && JSON.stringify(Object.keys(protoDepot.depot ?? {})) === '["Orirock Cube"]'
    && Object.getPrototypeOf(protoDepot.depot) === plain, JSON.stringify(protoDepot?.depot));

const state = '{"elite":1,"level":1,"skillLevel":1,"masteries":{}}';
const protoRoster = parseTransfer(`{"__proto__": ${state.replace('"elite":1', '"elite":2')}, "Texas": ${state}}`);
check('hostile: a __proto__ operator does not re-parent the roster',
  protoRoster?.shape === 'roster' && JSON.stringify(Object.keys(protoRoster.roster ?? {})) === '["Texas"]'
    && Object.getPrototypeOf(protoRoster.roster) === plain
    && (protoRoster.roster as Record<string, unknown>)['elite'] === undefined,
  JSON.stringify(protoRoster?.roster));

const ctorCsv = parseTransfer('itemId, itemName, owned, needed\nconstructor,Nope,5,0\n4001,LMD,10,0');
check('hostile: an itemId of "constructor" is an unknown key, not Object',
  JSON.stringify(ctorCsv?.depot) === '{"LMD":10}' && JSON.stringify(ctorCsv?.unheld) === '["Nope"]',
  `${JSON.stringify(ctorCsv?.depot)} ${JSON.stringify(ctorCsv?.unheld)}`);
const ctorArk = parseTransfer('{"version":"2.6.0","stock":{"constructor":5,"__proto__":7,"G-4-1":1}}');
check('hostile: ark-nights codes are own-property lookups',
  JSON.stringify(ctorArk?.depot) === '{"LMD":1}' && ctorArk?.unheld.includes('constructor') === true,
  JSON.stringify(ctorArk?.depot));

const tooBig: [string, string][] = [
  ['a bare depot count of 1e300', '{"Orirock Cube": 1e300}'],
  ['a CSV count past the ceiling', 'itemId, itemName, owned, needed\n4001,LMD,999999999999999,0'],
  ['a penguin have of 1e300', '{"@type":"@penguin-statistics/planner/config","items":[{"id":"4001","have":1e300}]}'],
  ['an ark-nights stock of 1e300', '{"version":"2.6.0","stock":{"G-4-1":1e300}}'],
  ['a bundle whose depot holds 1e300', '{"kind":"arkpedia-planner","version":1,"depot":{"LMD":1e300},"operators":{}}'],
  ['an empty bare map (a mispaste, not "I own nothing")', '{}'],
  /* Valid JSON with a real material after the padding, so only the size rule
     can be what refuses it. */
  ['a paste past the size limit', '{"Orirock Cube": 4' + ' '.repeat(MAX_IMPORT_BYTES) + '}'],
];
for (const [label, text] of tooBig) check(`refused: ${label}`, parseTransfer(text) === null);

/* The saved-plan gate. Every field bounded, unknown operators dropped, and a
   legal plan untouched. */
const ops = [{ name: 'Texas', rarity: 6 }, { name: 'Kroos', rarity: 3 }];
const hostile = clampBuilderStates({
  Texas: {
    elite: 2, level: 60, skillLevel: 7,
    masteryTargets: { 0: 1e9, 1: 3, 2: 'x', 999999999: 2 },
    moduleStageTargets: { 0: 1e9, 1: 1, '-1': 2 },
    startingElite: 1e9, startingLevel: -1e9, startingSkillLevel: 'abc',
    startingMasteryLevels: { 0: 1e9 }, startingModuleStages: null,
  },
  Nobody: { elite: 2, level: 90, skillLevel: 7, masteryTargets: { 0: 1e9 } },
  ['__proto__']: { elite: 2 },
  Kroos: 'not an object',
}, ops);
check('hostile: unknown operators and prototype keys are dropped from a plan',
  JSON.stringify(Object.keys(hostile)) === '["Texas"]', JSON.stringify(Object.keys(hostile)));
const t = hostile.Texas;
check('hostile: mastery targets are bounded to slots 0-7 and M1-M3',
  JSON.stringify(t?.masteryTargets) === '{"1":3}', JSON.stringify(t?.masteryTargets));
check('hostile: module targets are bounded to stages 0-2',
  JSON.stringify(t?.moduleStageTargets) === '{"1":1}', JSON.stringify(t?.moduleStageTargets));
check('hostile: a starting point outside the game reads as unbuilt',
  t?.startingElite === 0 && t?.startingLevel === 1 && t?.startingSkillLevel === 1
    && JSON.stringify(t?.startingMasteryLevels) === '{}' && JSON.stringify(t?.startingModuleStages) === '{}',
  JSON.stringify(t));
check('hostile: the target still stands where it was legal',
  t?.elite === 2 && t?.level === 60 && t?.skillLevel === 7, `${t?.elite}/${t?.level}/${t?.skillLevel}`);

const legal = {
  Texas: {
    elite: 2, level: 80, skillLevel: 7, masteryTargets: { 1: 3 }, moduleStageTargets: { 0: 2 },
    startingElite: 2, startingLevel: 60, startingSkillLevel: 7, startingMasteryLevels: { 1: 1 }, startingModuleStages: { 0: 0 },
  },
};
check('a legal plan comes back byte for byte', JSON.stringify(clampBuilderStates(legal, ops)) === JSON.stringify(legal),
  JSON.stringify(clampBuilderStates(legal, ops)));
check('a target below its start is lifted to it',
  clampBuilderStates({ Texas: { ...legal.Texas, elite: 0, level: 1, skillLevel: 1 } }, ops).Texas?.elite === 2);

const names = knownPlanNames(['Texas', 'Texas', 'Nobody', 5, null, 'Kroos'], clampBuilderStates(legal, ops));
check('hostile: plan names are known, unique and have a state', JSON.stringify(names) === '["Texas"]', JSON.stringify(names));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll import-format checks passed.');
process.exit(failures ? 1 : 0);
