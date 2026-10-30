/** Annealing chains on the 3-4-2 sheet pool, run side by side as separate processes, best kept: does more search
 * in the same wall time close the gap to the sheet's own rotation (simulated here, drones on)?
 * Usage: npx tsx scripts/bench/anneal-chains-342.ts seed <file>           -- compute today's plan as a genome, save it
 *        npx tsx scripts/bench/anneal-chains-342.ts sheet <file>          -- the sheet's three formations as a genome
 *        npx tsx scripts/bench/anneal-chains-342.ts chain <file> <seed> <s> -- anneal from it, print the result and
 *                                                                           save the best genome to <file>.<seed>.json */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, WORK_KINDS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { evaluate, genomeFromResult, type Genome, type GenomeContext } from '../../lib/base/planGenome';
import { simulateBase } from '../../lib/base/baseSimulation';
import { anneal, placesNobodyTwice } from '../../lib/base/annealBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, SHEET_REFILL, assignmentsOf, everyoneMaxed, sheetShifts } from './sheet-342';

const [mode, file, seedArg, secondsArg] = process.argv.slice(2);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const maxed = everyoneMaxed(operators);
const names = new Set([...FORMATIONS.flatMap(f => Object.values(f.teams).flat()), 'Fiammetta']);
const roster: Record<string, OwnedOperator> = Object.fromEntries([...names].filter(n => maxed[n]).map(n => [n, maxed[n]]));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
// ALLOW_EXHAUSTION=1 lets plans run workers to 0 Morale, as the sheet's own rotation does (a fairness check only).
const ctx: GenomeContext = { base, roster, loginInterval: 8, drones: true, allowExhaustion: process.env.ALLOW_EXHAUSTION === '1' };

// The target: the sheet's own rotation with its better refill policy, never a constant written down earlier.
const target = Math.max(...(['rotation', 'lowest'] as const).map(refillPolicy => {
  const s = simulateBase({ base, shifts: sheetShifts(SHEET_REFILL, maxed), loginInterval: 8, drones: true, refillPolicy });
  return s.perDay.lmd + s.perDay.exp + 500 * s.perDay.goldMade;
}));

if (mode === 'seed') {
  const today = optimizeBase({ base, roster, loginInterval: 8, factoryProducts: FORMATIONS[0].products, drones: true, formations: true });
  const g = genomeFromResult(today, ctx)!;
  fs.writeFileSync(file, JSON.stringify(g));
  console.log(`seed ${today.shape} ${today.score.toFixed(0)} saved`);
} else if (mode === 'sheet') {
  // The sheet's three formations as three crews, each room following them in order. The refill core is who works
  // the same room in all three; the rest rule and bed filling are the genome's own (the sheet lists only who matters).
  const rooms = SHEET_FACILITIES.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind)).map(f => f.id);
  const crews = FORMATIONS.map(f => assignmentsOf(Object.fromEntries(rooms.map(r => [r, (f.teams[r] ?? []).filter(n => n !== 'Fiammetta')])), roster));
  const g: Genome = { steps: 3, k: 1, crews, assign: Object.fromEntries(rooms.map(r => [r, [0, 1, 2]])), core: ['Shamare', 'Bibeak', 'Tequila', 'Proviso'], parked: {}, products: FORMATIONS[0].products, fillBeds: true, restAll: true, refillLowest: true };
  fs.writeFileSync(file, JSON.stringify(g));
  const e = evaluate(g, ctx);
  console.log(`sheet genome ${e.value.toFixed(0)} (${(100 * e.value / target).toFixed(1)}% of the sheet's rotation, ${target.toFixed(0)}), exhausted ${e.sim.events.filter(x => x.kind === 'exhausted').length}`);
} else {
  const g = JSON.parse(fs.readFileSync(file, 'utf8')) as Genome;
  const r = anneal(g, ctx, { timeMs: Number(secondsArg) * 1000, seed: Number(seedArg) });
  console.log(`chain ${seedArg}: ${r.evaluation.value.toFixed(0)} (${(100 * r.evaluation.value / target).toFixed(1)}% of ${target.toFixed(0)}), ${r.rounds} rounds, crews ${r.genome.crews.length}, steps ${r.genome.steps}, core [${r.genome.core.join(', ')}], exhausted ${r.evaluation.sim.events.filter(e => e.kind === 'exhausted').length}, no-dup ${placesNobodyTwice(r.genome, ctx)}`);
  fs.writeFileSync(`${file}.${seedArg}.json`, JSON.stringify(r.genome));
}
