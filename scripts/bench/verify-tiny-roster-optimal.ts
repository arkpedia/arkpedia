/** Same as verify-small-roster-optimal.ts, for the tiny (15-operator) roster and its winning layout. */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { optimizeBase, sustainableOutput, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { productOptions } from '../../lib/base/accountOptimizer';
import type { SimulationBase } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);
const tinyNames = [...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)];
const roster: Record<string, OwnedOperator> = Object.fromEntries(tinyNames.map(n => [n, { eliteLevel: 'Base', level: 30 }]));

const layout = { id: '252 max-left', label: '252 max left', spots: presetSpots('2-5-2-left'), levels: presetLevels('2-5-2-left') };
const facilities = getFacilities(layout.spots, layout.levels);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
const loginInterval = 12;

let bestPlain = -Infinity, bestDeep = -Infinity;
for (const products of productOptions(layout)) {
  const plain = optimizeBase({ base, roster, loginInterval, factoryProducts: products, sustainable: true, externalGold: 0, drones: true });
  if (plain.simulation.periodic && !plain.simulation.events.some(e => e.kind === 'exhausted')) {
    const out = sustainableOutput(plain.simulation.perDay, 0);
    bestPlain = Math.max(bestPlain, out.lmd + out.exp);
  }
  const deep = optimizeBase({ base, roster, loginInterval, factoryProducts: products, sustainable: true, externalGold: 0, deep: true, drones: true });
  if (deep.simulation.periodic && !deep.simulation.events.some(e => e.kind === 'exhausted')) {
    const out = sustainableOutput(deep.simulation.perDay, 0);
    bestDeep = Math.max(bestDeep, out.lmd + out.exp);
  }
}
console.log(`plain (production path) best: ${bestPlain.toFixed(0)}`);
console.log(`deep (multi-start) best:      ${bestDeep.toFixed(0)}`);
console.log(`gap: ${(bestDeep - bestPlain).toFixed(0)} (${(100 * (bestDeep - bestPlain) / bestPlain).toFixed(2)}%)`);
console.log(`previously recorded production result for this layout: 49,108 (from weak-roster-joint-plan.ts)`);
