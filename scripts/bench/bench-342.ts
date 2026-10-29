/**
 * Sheet rotation vs the optimizer, both scored by our own simulator on the same layout and roster.
 * Usage: npx tsx scripts/bench/bench-342.ts [loginInterval=8] [skipOptimizer]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { simulateBase, type SimulationShift, type SimulationBase } from '../../lib/base/baseSimulation';
import { optimizeBase, DEFAULT_WEIGHTS } from '../../lib/base/baseOptimizer';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';

const loginInterval = Number(process.argv[2] ?? 8);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
const dorms = SHEET_FACILITIES.filter(f => f.kind === 'dormitory' && f.capacity > 0);
console.log('dorm capacities', dorms.map(d => `${d.id}:${d.capacity}`).join(' '));

const weighted = (o: { lmd: number; exp: number; goldMade: number }) => o.lmd * DEFAULT_WEIGHTS.lmd + o.exp * DEFAULT_WEIGHTS.exp + o.goldMade * DEFAULT_WEIGHTS.goldMade;
const show = (label: string, p: { lmd: number; exp: number; goldMade: number; goldSold?: number }) =>
  console.log(`${label.padEnd(22)} LMD ${p.lmd.toFixed(0).padStart(7)}  EXP ${p.exp.toFixed(0).padStart(6)}  gold made ${p.goldMade.toFixed(1).padStart(6)}  weighted ${weighted(p).toFixed(0)}`);

// The sheet's rotation: three formations, each working one step; everyone else rests in the dorms that fit.
const workingOf = (i: number) => new Set(Object.values(FORMATIONS[i].teams).flat());
const shifts: SimulationShift[] = FORMATIONS.map((f, i) => {
  const teams = { ...f.teams };
  const resting = [...new Set(FORMATIONS.flatMap((g, j) => (j === i ? [] : Object.values(g.teams).flat())))].filter(n => !workingOf(i).has(n));
  const queue = [...resting];
  for (const d of dorms) teams[d.id] = [...(teams[d.id] ?? [])].concat(queue.splice(0, Math.max(0, d.capacity - (teams[d.id]?.length ?? 0))));
  return { assignments: assignmentsOf(teams, roster), factoryProducts: f.products, logins: 1 };
});
const t0 = Date.now();
const sheet = simulateBase({ base, shifts, loginInterval });
show('sheet rotation', sheet.perDay);
console.log('  periodic', sheet.periodic, 'events', sheet.events.map(e => e.kind).join(',') || 'none', `(${Date.now() - t0} ms)`);

if (process.argv[3] !== 'skipOptimizer') {
  const t1 = Date.now();
  const r = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products });
  show(`optimizer (${r.shape})`, r.simulation.perDay);
  console.log('  periodic', r.simulation.periodic, 'exhausted', r.simulation.events.filter(e => e.kind === 'exhausted').length, 'evaluations', r.evaluations, `(${((Date.now() - t1) / 1000).toFixed(0)} s)`);
  for (const [i, crew] of r.crews.entries()) console.log('  crew', i, JSON.stringify(Object.fromEntries(Object.entries(crew).map(([k, v]) => [k, (v ?? []).flatMap(s => s ? [s.operatorName] : [])]).filter(([, v]) => (v as string[]).length))));
}
if (process.argv[3] === 'who') {
  for (const e of sheet.events.filter(e => e.kind === 'exhausted')) console.log('  exhausted @', e.time.toFixed(1), e.room, (e.operators ?? []).join(','), '|', e.detail.slice(0, 90));
}
