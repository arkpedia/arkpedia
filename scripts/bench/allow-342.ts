import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase } from '../../lib/base/baseOptimizer';
import type { SimulationBase } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, everyoneMaxed } from './sheet-342';
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
const interesting = ['Shamare', 'Bibeak', 'Tequila', 'Mr. Nothing', 'Proviso', 'Chongyue', 'Dusk', 'Ling', 'Mulberry', 'Fiammetta', 'Wind Chimes', 'Shu'];
const li = Number(process.argv[2] ?? 12);
for (const deep of (process.argv[3] === "deep" ? [true] : process.argv[3] === "plain" ? [false] : [false, true])) {
  const t0 = Date.now();
  const r = optimizeBase({ base, roster, loginInterval: li, factoryProducts: FORMATIONS[0].products, sustainable: true, externalGold: 0, deep, refill: process.env.NOREFILL ? false : true, drones: !!process.env.DRONES });
  const where = (n: string) => r.shifts.flatMap((s, i) => Object.entries(s.assignments).flatMap(([room, v]) => (v ?? []).some(x => x?.operatorName === n) ? [`s${i}:${room}`] : []));
  console.log(`login ${li}h deep=${deep}: ${r.shape} score ${r.score.toFixed(0)} LMD ${r.simulation.perDay.lmd.toFixed(0)} EXP ${r.simulation.perDay.exp.toFixed(0)} exhausted ${r.simulation.events.filter(e => e.kind === 'exhausted').length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  r.notes.filter(n => /Fiammetta/.test(n)).forEach(n => console.log('   NOTE:', n));
  console.log('   ', interesting.map(n => `${n}=${where(n).join('|') || '-'}`).join('  '));
}
