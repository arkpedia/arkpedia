/**
 * The joint half: solve the per-room crew order while keeping the plan's own DORMS and resting structure, repairing
 * only the beds the changed room disturbs. The per-room-order solver (room-schedule-solver.ts) rebuilds the dorms
 * with decode()'s just-off rule, which is not what the plan actually runs; this starts from the plan's valid shifts,
 * swaps one room's staffing for another shift's, removes the displaced workers from work, beds the ones who lost a
 * place, and simulates exactly.
 *
 *   npx tsx scripts/bench/room-rest-solver.ts <fixture.json> [more...] [--seconds 300|--rounds 60] [--iterations 4] [--restarts 4]
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
import { simulateBase, type SimulationShift } from '../../lib/base/baseSimulation';
import { scoreOf, type GenomeContext } from '../../lib/base/planGenome';
import type { BaseAssignments } from '../../lib/base/baseTypes';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : undefined; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')) && !/^-?\d+$/.test(a));
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const known = new Set(operators.map(o => o.name));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never };

function patterns(n: number, k: number): number[][] {
  let out: number[][] = [[]];
  for (let s = 0; s < k; s++) out = out.flatMap(p => Array.from({ length: n }, (_, c) => [...p, c]));
  return out;
}

async function main() {
  let rng = flag('--seed') ?? 1;
  const random = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  for (const file of files) {
    const profile = profileFromData(JSON.parse(fs.readFileSync(file, 'utf8')))!;
    const roster: Record<string, OwnedOperator> = ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
    const loginInterval = 12;
    const result = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, ...(flag('--seconds') ? { searchSeconds: flag('--seconds') } : { searchSeconds: 6, annealRounds: flag('--rounds') ?? 60 }), drones: true });
    const r = result.recommendations[0];
    const plan = r.plan;
    const facilities = getFacilities(r.spots, r.levels);
    const ctx: GenomeContext = { base: { ...base, facilities }, roster, loginInterval, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true };
    const work = facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
    const dormRooms = facilities.filter(f => f.kind === 'dormitory' && f.capacity);
    const slotOf = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
    const workOf = (a: BaseAssignments) => Object.fromEntries(work.map(f => [f.id, a[f.id] ?? Array(f.capacity).fill(null)]));
    const shifts0 = plan.shifts;
    const steps = shifts0.length;
    const workShifts = shifts0.map(s => workOf(s.assignments));
    const pats = patterns(steps, steps);
    const sim = (shifts: SimulationShift[]) => simulateBase({ base: ctx.base, shifts, loginInterval, initialMorale: plan.initialMorale, drones: true, refillPolicy: plan.refillPolicy as never, lean: true, droneWeights: ctx.weights, droneFunding: { externalGold: 0 } });
    const score = (shifts: SimulationShift[]) => { const s = sim(shifts); if (!s.periodic || s.events.some(e => e.kind === 'exhausted')) return -Infinity; return scoreOf(s, ctx); };
    const planScore = scoreOf(plan.simulation, ctx);
    const trial = (room: string, pattern: number[]): SimulationShift[] | null => {
      const out: SimulationShift[] = [];
      for (let step = 0; step < steps; step++) {
        const next = workShifts[pattern[step]][room] ?? Array(work.find(f => f.id === room)!.capacity).fill(null);
        const assignments: BaseAssignments = { ...shifts0[step].assignments, [room]: next };
        // Nobody may work twice at one shift.
        const seen = new Set<string>();
        for (const f of work) for (const slot of assignments[f.id] ?? []) { if (!slot) continue; if (seen.has(slot.operatorName)) return null; seen.add(slot.operatorName); }
        const working = new Set(seen);
        const displaced = (shifts0[step].assignments[room] ?? []).flatMap(x => x ? [x.operatorName] : []).filter(n => !working.has(n));
        const dorms: BaseAssignments = {};
        for (const d of dormRooms) dorms[d.id] = (shifts0[step].assignments[d.id] ?? Array(d.capacity).fill(null)).map(x => x && !working.has(x.operatorName) ? x : null);
        let q = 0;
        for (const d of dormRooms) for (let i = 0; i < d.capacity && q < displaced.length; i++) if (!dorms[d.id][i]) dorms[d.id][i] = slotOf(displaced[q++]);
        out.push({ ...shifts0[step], assignments: { ...assignments, ...dorms } });
      }
      return out;
    };
    const rooms = work.map(f => f.id);
    const baseline = score(shifts0);
    let best = { shifts: shifts0, score: baseline };
    const descend = (shifts: SimulationShift[], startScore: number) => {
      let cur = shifts, curScore = startScore;
      for (let it = 0; it < (flag('--iterations') ?? 4); it++) {
        let improved = false;
        for (const room of rooms) {
          for (const p of pats) {
            const tr = trial(room, p);
            if (!tr) continue;
            const sc = score(tr);
            if (sc > curScore + 1e-6) { cur = tr; curScore = sc; improved = true; }
          }
        }
        if (!improved) break;
      }
      return { cur, curScore };
    };
    const first = descend(shifts0, baseline);
    best = { shifts: first.cur, score: first.curScore };
    for (let restart = 0; restart < (flag('--restarts') ?? 3); restart++) {
      const kicked = best.shifts.map(s => ({ ...s, assignments: { ...s.assignments } }));
      const k = 1 + Math.floor(random() * 2);
      for (let j = 0; j < k; j++) {
        const room = rooms[Math.floor(random() * rooms.length)];
        const step = Math.floor(random() * steps);
        const from = workShifts[Math.floor(random() * steps)][room];
        kicked.forEach((s, i) => { if (from) s.assignments[room] = i === step ? structuredClone(from) : s.assignments[room]; });
      }
      const kickedScore = score(kicked);
      if (kickedScore === -Infinity) continue;
      const out = descend(kicked, kickedScore);
      if (out.curScore > best.score) best = { shifts: out.cur, score: out.curScore };
    }
    const bestScore = score(best.shifts) > -Infinity ? score(best.shifts) : planScore;
    const usePlan = bestScore <= planScore;
    const finalScore = usePlan ? planScore : bestScore;
    console.log(`${path.basename(file).replace(/\.json$/, '')}: plan ${planScore.toFixed(0)} (${result.searched} sims), ${rooms.length} rooms x ${pats.length} patterns, ${steps} shifts`);
    console.log(`  best ${finalScore.toFixed(0)} ${finalScore > planScore ? '+' : ''}${((finalScore - planScore) / planScore * 100).toFixed(2)}% vs plan${usePlan ? ' (plan kept)' : ''}`);
    console.log(`RESULT ${path.basename(file).replace(/\.json$/, '')} plan ${planScore.toFixed(0)} best ${finalScore.toFixed(0)} delta ${((finalScore - planScore) / planScore * 100).toFixed(2)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
