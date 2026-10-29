/**
 * The greedy search's own yardstick: snapshot value of a crew (calculateBase, one login interval, weighted).
 * If a sheet formation beats the optimizer's crews on it, greedy construction missed a better crew.
 * Usage: npx tsx scripts/bench/snapshot-342.ts [loginInterval=12]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { optimizeBase, DEFAULT_WEIGHTS } from '../../lib/base/baseOptimizer';
import type { BaseAssignments } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';

const loginInterval = Number(process.argv[2] ?? 12);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
const w = DEFAULT_WEIGHTS;
const value = (assignments: BaseAssignments, products = FORMATIONS[0].products) => {
  const r = calculateBase({ ...base, assignments, factoryProducts: products, loginInterval, swapPolicy: 'onLogin' });
  return { total: r.dailyGoldWorthGreen * w.lmd + r.dailyExpGreen * w.exp + r.dailyGoldMadeGreen * w.goldMade, lmd: r.dailyGoldWorthGreen, exp: r.dailyExpGreen, made: r.dailyGoldMadeGreen };
};
const fmt = (l: string, v: ReturnType<typeof value>) => console.log(`${l.padEnd(26)} total ${v.total.toFixed(0).padStart(7)}  LMD ${v.lmd.toFixed(0).padStart(6)} EXP ${v.exp.toFixed(0).padStart(6)} made ${v.made.toFixed(1)}`);

const deep = process.argv[3] === 'deep';
const t0 = Date.now();
const plan = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products, deep });
console.log(`${deep ? 'DEEP' : 'plain'} search ${((Date.now() - t0) / 1000).toFixed(0)} s, ${plan.shape}, score ${plan.score.toFixed(0)}, LMD ${plan.simulation.perDay.lmd.toFixed(0)} EXP ${plan.simulation.perDay.exp.toFixed(0)} exhausted ${plan.simulation.events.filter(e => e.kind === 'exhausted').length}`);
plan.notes.filter(n => /Deep/.test(n)).forEach(n => console.log('  ', n));
plan.crews.forEach((c, i) => fmt(`optimizer crew ${i}`, value(c)));
for (const f of FORMATIONS) {
  const teams = Object.fromEntries(Object.entries(f.teams).filter(([r]) => !r.startsWith('dormitory')));
  fmt(`sheet ${f.name}`, value(assignmentsOf(teams, roster), f.products));
}
