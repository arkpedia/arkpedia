/**
 * Can the column generation's setups be dropped into a plan's rotation? Takes a freshly optimized plan, asks
 * staffingMip.ts's rotationMix for the best time-share of whole setups (its own plus generated ones), then replaces
 * each of the plan's three shifts in turn with a generated setup and simulates the rotation exactly (completeStaffing
 * fills the support seats; the beds stay the plan's own rest groups).
 *
 *   npx tsx scripts/bench/integer-rotation.ts <fixture.json> [more fixtures...] [--rounds 60] [--iterations 12]
 *
 * It found that the generated setups cannot be dropped in: the plan's beds and rest groups are built for its own
 * crews, so a generated crew's workers have nowhere to recover in the other two shifts and the rotation exhausts
 * (scores around -1e7 with the simulator's exhaustion penalty). The LP's slack is not a setup list; it relaxes the
 * joint staffing-and-rest schedule. A server-side generator would have to solve that schedule, not just the setups.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities } from '../../lib/base/baseConfig';
import { WORK_KINDS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import { calculateBase } from '../../lib/base/calculateBase';
import { simulateBase, type SimulationShift } from '../../lib/base/baseSimulation';
import { scoreOf, type GenomeContext } from '../../lib/base/planGenome';
import { completeStaffing } from '../../lib/base/completeStaffing';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import { rotationMix } from './staffingMip';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : undefined; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const known = new Set(operators.map(o => o.name));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never };

async function main() {
  for (const file of files) {
    const profile = profileFromData(JSON.parse(fs.readFileSync(file, 'utf8')))!;
    const roster: Record<string, OwnedOperator> = ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
    const loginInterval = 12;
    const result = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, searchSeconds: 6, annealRounds: flag('--rounds') ?? 60, drones: true });
    const r = result.recommendations[0];
    const plan = r.plan;
    const products = r.products as FactoryProducts;
    const facilities = getFacilities(r.spots, r.levels);
    const ctx: GenomeContext = { base: { ...base, facilities }, roster, loginInterval, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true };
    const work = new Set(facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind)).map(f => f.id));
    const workOf = (a: BaseAssignments): BaseAssignments => Object.fromEntries(Object.entries(a).filter(([id]) => work.has(id)));
    const workShifts = plan.shifts.map(s => workOf(s.assignments));
    const recovery = Math.max(...plan.shifts.map(s => Math.max(...Object.values(calculateBase({ ...ctx.base, assignments: s.assignments, factoryProducts: products, loginInterval, swapPolicy: 'onLogin' }).dormitoryRecoveryByFacility).flat().map(x => x.base + x.bonus), 0)));
    const beds = facilities.filter(f => f.kind === 'dormitory').reduce((sum, f) => sum + f.capacity, 0);
    const refilled = new Set(plan.shifts.flatMap(s => s.refill ?? []));
    const mixed = await rotationMix(ctx, products, workShifts, { recovery, beds, refilled, iterations: flag('--iterations') ?? 12, price: true });
    const simOf = (shifts: SimulationShift[]) => simulateBase({ base: ctx.base, shifts, loginInterval, initialMorale: plan.initialMorale, drones: true, refillPolicy: plan.refillPolicy as never, lean: true, droneWeights: ctx.weights, droneFunding: { externalGold: 0 } });
    const baseline = scoreOf(plan.simulation, ctx);
    // Fill the rest of a rotation (beds, support) the way the optimizer does, then score it.
    const completed = (shifts: SimulationShift[], label: string) => {
      const sim = simOf(shifts);
      if (!sim.periodic) return { score: -Infinity, label };
      const done = completeStaffing({ ...plan, shifts, simulation: sim, notes: [] }, ctx, { refineSupport: false });
      return { score: scoreOf(done.simulation, ctx), label };
    };
    const name = path.basename(file).replace(/\.json$/, '');
    console.log(`${name}: plan ${r.score.toFixed(0)} (sim ${baseline.toFixed(0)}), LP mix ${mixed.value.toFixed(0)} from ${mixed.columns} columns`);
    const planKeys = new Set(workShifts.map(a => JSON.stringify(a)));
    const generated = mixed.mix.filter(m => !planKeys.has(JSON.stringify(m.assignments))).slice(0, 8);
    const workersOf = (a: BaseAssignments) => new Set(Object.values(a).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : []))).size;
    console.log(`  ${generated.length} generated setups in the mix; workers plan ${workShifts.map(workersOf).join('/')} vs generated ${generated.slice(0, 4).map(g => workersOf(g.assignments)).join('/')}; beds ${beds}`);
    // Test: replace one of the plan's three shifts with a generated setup, leave the other two as they are.
    let best = { score: baseline, label: 'plan' };
    for (const g of generated) for (let i = 0; i < plan.shifts.length; i++) {
      const working = new Set(Object.values(g.assignments).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : [])));
      const shifts = plan.shifts.map((s, j) => j === i
        ? { ...s, assignments: { ...Object.fromEntries(Object.entries(s.assignments).filter(([id]) => !work.has(id)).map(([id, slots]) => [id, slots.map(x => x && working.has(x.operatorName) ? null : x)])), ...g.assignments } }
        : s);
      const value = completed(shifts, `generated for shift ${i + 1}`);
      if (value.score > best.score) best = value;
      console.log(`  shift ${i + 1} <- generated: ${value.score.toFixed(0)} ${value.score > baseline ? '+' : ''}${((value.score - baseline) / baseline * 100).toFixed(2)}%`);
    }
    console.log(`  best: ${best.label} ${best.score.toFixed(0)} ${best.score > baseline ? '+' : ''}${((best.score - baseline) / baseline * 100).toFixed(2)}% vs the plan`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
