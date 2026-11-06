/**
 * Integer 3-setup rotations with their rest order, from the plan's setups and the column generation's generated ones:
 * every ordered triple and every whole-login allocation is built as a rotation (decode's rest rule: whoever just came
 * off shift rests; empty beds take dorm-skill operators), simulated exactly, and compared with the plan. This is the
 * practical form of the "integer shifts with the rest order" study: no LP rest approximation, the simulator is the
 * judge.
 *
 *   npx tsx scripts/bench/rotation-search.ts <fixture.json> [more...] [--rounds 60|--seconds 300] [--pool 8] [--max-l 12]
 *
 * If no rotation beats the plan by the +0.5% bar, generated setups cannot pay for a server-side generator.
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
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { simulateBase, type SimulationShift } from '../../lib/base/baseSimulation';
import { scoreOf, type GenomeContext } from '../../lib/base/planGenome';
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
    const result = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, ...(flag('--seconds') ? { searchSeconds: flag('--seconds') } : { searchSeconds: 6, annealRounds: flag('--rounds') ?? 60 }), drones: true });
    const r = result.recommendations[0];
    const plan = r.plan;
    const products = r.products as FactoryProducts;
    const facilities = getFacilities(r.spots, r.levels);
    const ctx: GenomeContext = { base: { ...base, facilities }, roster, loginInterval, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true };
    const work = new Set(facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind)).map(f => f.id));
    const dormRooms = facilities.filter(f => f.kind === 'dormitory' && f.capacity);
    const beds = dormRooms.reduce((sum, f) => sum + f.capacity, 0);
    const workShifts = plan.shifts.map(s => Object.fromEntries(Object.entries(s.assignments).filter(([id]) => work.has(id))) as BaseAssignments);
    const recovery = Math.max(...plan.shifts.map(s => Math.max(...Object.values(calculateBase({ ...ctx.base, assignments: s.assignments, factoryProducts: products, loginInterval, swapPolicy: 'onLogin' }).dormitoryRecoveryByFacility).flat().map(x => x.base + x.bonus), 0)));
    const refilled = new Set(plan.shifts.flatMap(s => s.refill ?? []));
    const mixed = await rotationMix(ctx, products, workShifts, { recovery, beds, refilled, iterations: 12, price: true });
    const seen = new Set<string>();
    const pool = [...workShifts, ...mixed.mix.slice().sort((a, b) => b.share - a.share).map(m => m.assignments)]
      .filter(a => { const k = JSON.stringify(a); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, flag('--pool') ?? 8)
      .map(assignments => ({
        assignments,
        workers: [...new Set(Object.values(assignments).flatMap(x => (x ?? []).flatMap(v => v ? [v.operatorName] : [])))],
      }));
    const parked = plan.initialMorale ?? {};
    const byName = new Map(base.operators.map(o => [o.name, o]));
    const slotOf = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
    const dormSkill = (n: string) => activeBaseSkills(byName.get(n)!, 'Dormitory', roster[n].eliteLevel, base.skillSlots, roster[n].level).length;
    const everyone = new Set(pool.flatMap(p => p.workers));
    const idle = Object.keys(roster).filter(n => byName.has(n) && !everyone.has(n) && !(n in parked) && n !== 'Fiammetta').sort((a, b) => dormSkill(b) - dormSkill(a) || a.localeCompare(b));
    const core = plan.shifts[0].refill ?? [];
    const planScore = scoreOf(plan.simulation, ctx);
    const build = (seq: { workers: string[]; assignments: BaseAssignments }[], logins: number[]): SimulationShift[] | null => {
      const out: SimulationShift[] = [];
      for (let step = 0; step < seq.length; step++) {
        const s = seq[step];
        const working = new Set(s.workers);
        const prev = new Set(seq[(step + seq.length - 1) % seq.length].workers);
        const resting = [...prev].filter(n => !working.has(n) && !(n in parked));
        if (!resting.length || resting.length > beds) return null;
        const bedsOut: BaseAssignments = Object.fromEntries(dormRooms.map(d => [d.id, Array.from({ length: d.capacity }, () => null as ReturnType<typeof slotOf> | null)]));
        let q = 0;
        for (const d of dormRooms) for (let i = 0; i < d.capacity && q < resting.length; i++) bedsOut[d.id][i] = slotOf(resting[q++]);
        // Empty beds take the best dorm-skill operators, as decode() does with fillBeds.
        let next = 0;
        for (const d of dormRooms) for (let i = 0; i < d.capacity && next < idle.length; i++) if (!bedsOut[d.id][i]) bedsOut[d.id][i] = slotOf(idle[next++]);
        out.push({ assignments: { ...s.assignments, ...bedsOut }, factoryProducts: products, hours: logins[step] * loginInterval, ...(core.length ? { refill: core.filter(n => working.has(n)) } : {}) });
      }
      return out;
    };
    let best = { score: planScore, label: 'plan' };
    const planCount = Math.min(workShifts.length, pool.length);
    let bestOwn = { score: -Infinity, label: 'none' }, bestGen = { score: -Infinity, label: 'none' };
    const comps = (L: number): number[][] => { const out: number[][] = []; for (let a = 1; a <= L - 2; a++) for (let b = 1; b <= L - a - 1; b++) out.push([a, b, L - a - b]); return out; };
    const Ls = [3, 4, 6, 9, 12].filter(L => L <= (flag('--max-l') ?? 12));
    let tried = 0;
    for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) for (let k = 0; k < pool.length; k++) {
      if (i === j || j === k || i === k) continue;
      const seq = [pool[i], pool[j], pool[k]];
      for (const L of Ls) for (const m of comps(L)) {
        const shifts = build(seq, m);
        if (!shifts) continue;
        tried++;
        const sim = simulateBase({ base: ctx.base, shifts, loginInterval, initialMorale: plan.initialMorale, drones: true, refillPolicy: plan.refillPolicy as never, lean: true, droneWeights: ctx.weights, droneFunding: { externalGold: 0 } });
        if (!sim.periodic || sim.events.some(e => e.kind === 'exhausted')) continue;
        const value = scoreOf(sim, ctx);
        const own = i < planCount && j < planCount && k < planCount;
        const label = `${m.join('/')} logins from pool ${i + 1}/${j + 1}/${k + 1}`;
        if (own) { if (value > bestOwn.score) bestOwn = { score: value, label }; }
        else if (value > bestGen.score) bestGen = { score: value, label };
        if (value > best.score) best = { score: value, label };
      }
    }
    const pct = (x: number, base: number) => `${x > -Infinity ? `${((x - base) / base * 100) >= 0 ? '+' : ''}${((x - base) / base * 100).toFixed(2)}%` : 'none'}`;
    console.log(`${path.basename(file).replace(/\.json$/, '')}: plan ${planScore.toFixed(0)}, pool ${pool.length} (${planCount} plan), tried ${tried} rotations`);
    console.log(`  plan-own best ${bestOwn.score > -Infinity ? bestOwn.score.toFixed(0) : 'none'} (${pct(bestOwn.score, planScore)}) [${bestOwn.label}], generated best ${bestGen.score > -Infinity ? bestGen.score.toFixed(0) : 'none'} (${pct(bestGen.score, planScore)}) [${bestGen.label}]`);
    console.log(`  generated vs plan-own: ${bestGen.score > -Infinity && bestOwn.score > -Infinity ? `${((bestGen.score - bestOwn.score) / bestOwn.score * 100) >= 0 ? '+' : ''}${((bestGen.score - bestOwn.score) / bestOwn.score * 100).toFixed(2)}%` : 'n/a'}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
