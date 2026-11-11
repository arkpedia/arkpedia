/**
 * Team Rainbow in the Control Center: Ash, Frost, Tachanka and Blitz each give every operator there +0.05 Morale an
 * hour per Team Rainbow operator, so the four cover 0.8 of the hourly drain. This lists who, as the fifth, brings
 * every seat's drain to zero or below (a Control Center that never changes staff), from a maxed catalogue.
 *
 *   npx tsx scripts/bench/rainbow-cc.ts
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const base = { operators, facilities, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never };
const at = (name: string) => ({ operatorName: name, eliteLevel: 'Elite 2' as const, level: 90 });
const four = ['Ash', 'Frost', 'Tachanka', 'Blitz'];
const cc = facilities.find(f => f.kind === 'controlCenter')!;
const drains = (names: string[]) => { const r = calculateBase({ ...base, assignments: { [cc.id]: names.map(at) }, factoryProducts: {}, loginInterval: 12, swapPolicy: 'onLogin' }).rooms[cc.id]; return names.map(n => r.perOperatorMorale?.[n] ?? r.combinedMoraleRate); };
const raw = (names: string[]) => { const r = calculateBase({ ...base, assignments: { [cc.id]: names.map(at) }, factoryProducts: {}, loginInterval: 12, swapPolicy: 'onLogin' }).rooms[cc.id]; return JSON.stringify({ per: r.perOperatorMorale, combined: r.combinedMoraleRate, keys: Object.keys(r) }); };
if (process.env.RAW) { console.log(raw(['12F'])); console.log(raw(four)); console.log(raw([...four, 'Amiya'])); console.log(raw(['Ash', 'Frost', '12F'])); }
console.log('four alone:', drains(four).map(d => d.toFixed(2)).join(' '));
const rows = operators.filter(o => !four.includes(o.name)).map(o => ({ name: o.name, d: drains([...four, o.name]) })).filter(r => Math.max(...r.d) <= 1e-9);
console.log(`${rows.length} fifths bring every seat to zero or below:`);
for (const r of rows.sort((a, b) => Math.max(...a.d) - Math.max(...b.d))) console.log(` ${r.name}: ${r.d.map(d => d.toFixed(2)).join(' ')}`);
