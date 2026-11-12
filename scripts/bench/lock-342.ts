/**
 * Recovery boosters locked in the dorms. Usage: npx tsx scripts/bench/lock-342.ts [loginInterval=12] [dormLevel=sheet|5]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities } from '../../lib/base/baseConfig';
import { optimizeBase } from '../../lib/base/baseOptimizer';
import type { SimulationBase } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, SHEET_LEVELS, SHEET_SPOTS, everyoneMaxed } from './sheet-342';

const loginInterval = Number(process.argv[2] ?? 12);
const dormLevel = process.argv[3] ?? 'sheet';
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const facilities = dormLevel === '5' ? getFacilities(SHEET_SPOTS, { ...SHEET_LEVELS, dormitory1: 5, dormitory2: 5, dormitory3: 5, dormitory4: 5 }) : SHEET_FACILITIES;
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
console.log(`login ${loginInterval}h, dorm levels ${facilities.filter(f => f.kind === 'dormitory').map(f => f.level).join('/')}`);
const sets: Record<string, string[]> = {
  'none': [],
  'Bobbing': ['Bobbing'],
  'Bobbing+Entelechia': ['Bobbing', 'Entelechia'],
  'Bobbing+Entelechia+Penance+Lumen': ['Bobbing', 'Entelechia', 'Penance', 'Lumen'],
};
for (const [label, lockedDorm] of Object.entries(sets)) {
  const t0 = Date.now();
  const r = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products, sustainable: true, externalGold: 0, lockedDorm });
  console.log(`${label.padEnd(34)} ${r.shape.padEnd(9)} score ${r.score.toFixed(0)}  LMD ${r.simulation.perDay.lmd.toFixed(0)} EXP ${r.simulation.perDay.exp.toFixed(0)} exhausted ${r.simulation.events.filter(e => e.kind === 'exhausted').length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
