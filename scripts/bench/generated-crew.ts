/**
 * Can a column-generation setup become one of a plan's crews? The shift-replacement bench (integer-rotation.ts)
 * showed a generated setup cannot be dropped into a plan's shifts because the rest order is built around its own
 * crews. This test goes through the genome instead, two ways:
 *
 *   1. replace one of the plan's crew templates with a generated setup, keep the plan's per-room schedule;
 *   2. use the generated setup as one step of a plain 0,1,2 rotation of the plan's other crews.
 *
 *   npx tsx scripts/bench/generated-crew.ts <fixture.json> [more fixtures...] [--rounds 120]
 *
 * Both fail: with the plan's schedule the generated crew is used at steps the plan built for another crew's rests;
 * under the plain rotation the plan's own crews exhaust too, so the per-room schedule is what makes the plan valid.
 * A generated setup needs the rest order planned with it, which is the joint staffing-and-rest problem.
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
import { decode, evaluate, genomeFromResult, hasWorkingCollision, scoreOf, type GenomeContext } from '../../lib/base/planGenome';
import { anneal } from '../../lib/base/annealBase';
import { rotationMix } from './staffingMip';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
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
    const result = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, searchSeconds: 6, annealRounds: 60, drones: true });
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
    const mixed = await rotationMix(ctx, products, workShifts, { recovery, beds, refilled, iterations: 12, price: true });
    const genome = genomeFromResult(plan, ctx);
    const name = path.basename(file).replace(/\.json$/, '');
    const planScore = scoreOf(plan.simulation, ctx);
    console.log(`${name}: plan ${planScore.toFixed(0)}, LP mix ${mixed.value.toFixed(0)}, genome ${genome ? `${genome.crews.length} crews/${genome.steps} steps` : 'none'}`);
    if (!genome) continue;
    const planKeys = new Set(workShifts.map(a => JSON.stringify(a)));
    const generated = mixed.mix.filter(m => !planKeys.has(JSON.stringify(m.assignments))).slice(0, 6);
    // A generated setup used as one step of a plain 3-crew rotation, with the plan's other two crews. The plan's
    // own schedule is optimized per room; this replaces it with the simplest rotation so the generated crew gets
    // one consecutive shift and then rests. The same rotation with the plan's crews is the baseline.
    const identity = (source: typeof genome, replaced: number | null, setup?: BaseAssignments) => {
      const trial = structuredClone(source);
      if (replaced !== null && setup) trial.crews[replaced] = structuredClone(setup);
      for (const room of Object.keys(trial.assign)) trial.assign[room] = Array.from({ length: trial.steps }, (_, s) => s % trial.crews.length);
      trial.seatCrews = undefined;
      return trial;
    };
    const plain = identity(genome, null);
    const plainEv = evaluate(plain, ctx);
    if (plainEv.sim.periodic) console.log(`  plain 3-crew rotation with the plan's own crews: ${scoreOf(plainEv.sim, ctx).toFixed(0)} ${((scoreOf(plainEv.sim, ctx) - planScore) / planScore * 100).toFixed(2)}%`);
    for (const [gi, g] of generated.slice(0, 4).entries()) {
      for (let c = 0; c < genome.crews.length; c++) {
        const trial = identity(genome, c, g.assignments as BaseAssignments);
        if (hasWorkingCollision(trial)) { console.log(`  rotation setup ${gi + 1} crew ${c + 1}: collision`); continue; }
        const ev = evaluate(trial, ctx);
        if (!ev.sim.periodic || ev.sim.events.some(e => e.kind === 'exhausted')) { console.log(`  rotation setup ${gi + 1} crew ${c + 1}: exhausts`); continue; }
        const seed = scoreOf(ev.sim, ctx);
        const moved = anneal(trial, ctx, { timeMs: 120_000, seed: 3, maxRounds: flag('--rounds') ?? 120, countSeats: false, lns: 'off' });
        const final = scoreOf(moved.evaluation.sim, ctx);
        console.log(`  rotation setup ${gi + 1} crew ${c + 1}: ${seed.toFixed(0)} ${((seed - planScore) / planScore * 100) >= 0 ? '+' : ''}${((seed - planScore) / planScore * 100).toFixed(2)}%, annealed ${final.toFixed(0)} ${((final - planScore) / planScore * 100) >= 0 ? '+' : ''}${((final - planScore) / planScore * 100).toFixed(2)}%`);
      }
    }
    for (const [gi, g] of generated.entries()) {
      for (let c = 0; c < genome.crews.length; c++) {
        const trial = structuredClone(genome);
        trial.crews[c] = structuredClone(g.assignments) as BaseAssignments;
        if (hasWorkingCollision(trial)) { console.log(`  setup ${gi + 1} crew ${c + 1}: collision, skipped`); continue; }
        trial.core = trial.core.filter(n => Object.values(trial.crews[c]).some(s => (s ?? []).some(x => x?.operatorName === n)));
        const ev = evaluate(trial, ctx);
        if (!ev.sim.periodic || ev.sim.events.some(e => e.kind === 'exhausted')) {
          const ex = ev.sim.events.filter(e => e.kind === 'exhausted').slice(0, 4).map(e => e.detail).join(' | ');
          const workers = Object.values(g.assignments).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : [])).length;
          console.log(`  setup ${gi + 1} crew ${c + 1}: seed exhausts (${workers} workers): ${ex}`);
          continue;
        }
        const seedScore = scoreOf(ev.sim, ctx);
        const rounds = flag('--rounds') ?? 120;
        const moved = anneal(trial, ctx, { timeMs: 120_000, seed: 3, maxRounds: rounds, countSeats: false, lns: 'off' });
        const finalScore = scoreOf(moved.evaluation.sim, ctx);
        console.log(`  setup ${gi + 1} crew ${c + 1}: seed ${seedScore.toFixed(0)} ${(seedScore - planScore) / planScore * 100 >= 0 ? '+' : ''}${((seedScore - planScore) / planScore * 100).toFixed(2)}%, after ${rounds} rounds ${finalScore.toFixed(0)} ${((finalScore - planScore) / planScore * 100) >= 0 ? '+' : ''}${((finalScore - planScore) / planScore * 100).toFixed(2)}%`);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
