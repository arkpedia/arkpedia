/**
 * The per-room joint solver: keep the plan's crews, products and number of staffing changes, and solve the per-room
 * crew ORDER (the `assign` map) that decides the whole rotation -- who works each room at each change, and therefore
 * who has just come off shift and rests in the beds. This is the schedule the integer-rotation study showed the LP
 * does not model.
 *
 * Coordinate descent with the exact simulator: for each room try every crew pattern in turn, keep the best, repeat;
 * then perturb 1-2 rooms at random and descend again. The plan's own schedule is the start, so the result is never
 * worse than the plan's genome.
 *
 *   npx tsx scripts/bench/room-schedule-solver.ts <fixture.json> [more...] [--seconds 300|--rounds 60]
 *     [--iterations 4] [--restarts 4] [--seed 1]
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities } from '../../lib/base/baseConfig';
import type { OwnedOperator } from '../../lib/base/baseOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import { evaluate, genomeFromResult, hasWorkingCollision, scoreOf, type Genome, type GenomeContext } from '../../lib/base/planGenome';
import { exceedsSetups } from '../../lib/base/rotationSetups';
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

function patterns(crews: number, steps: number): number[][] {
  let out: number[][] = [[]];
  for (let s = 0; s < steps; s++) out = out.flatMap(p => Array.from({ length: crews }, (_, c) => [...p, c]));
  return out;
}

async function main() {
  const seed = flag('--seed') ?? 1;
  let rng = seed;
  const random = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  for (const file of files) {
    const profile = profileFromData(JSON.parse(fs.readFileSync(file, 'utf8')))!;
    const roster: Record<string, OwnedOperator> = ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
    const loginInterval = 12;
    const result = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, ...(flag('--seconds') ? { searchSeconds: flag('--seconds') } : { searchSeconds: 6, annealRounds: flag('--rounds') ?? 60 }), drones: true });
    const r = result.recommendations[0];
    const facilities = getFacilities(r.spots, r.levels);
    const ctx: GenomeContext = { base: { ...base, facilities }, roster, loginInterval, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true };
    const start = genomeFromResult(r.plan, ctx);
    if (!start) { console.log(`${path.basename(file)}: no genome`); continue; }
    const rooms = Object.keys(start.assign);
    const pats = patterns(start.crews.length, start.steps);
    const score = (g: Genome) => {
      if (hasWorkingCollision(g)) return -Infinity;
      const ev = evaluate(g, ctx);
      if (exceedsSetups(ev.shifts)) return -Infinity;
      return ev.value;
    };
    const current = (g: Genome) => Object.keys(g.assign).map(r => `${r}:${g.assign[r].join('')}`).join(' ');
    const planScore = scoreOf(r.plan.simulation, ctx);
    const startScore = score(start);
    console.log(`${path.basename(file).replace(/\.json$/, '')}: plan ${planScore.toFixed(0)} (${result.searched} simulations), genome ${startScore.toFixed(0)}, ${rooms.length} rooms x ${pats.length} patterns, ${start.crews.length} crews/${start.steps} steps`);
    let best = structuredClone(start), bestScore = startScore;
    const descend = (g: Genome, baseScore: number) => {
      let cur = structuredClone(g), curScore = baseScore;
      for (let it = 0; it < (flag('--iterations') ?? 4); it++) {
        let improved = false;
        for (const room of rooms) {
          for (const p of pats) {
            if (p.join() === cur.assign[room].join()) continue;
            const trial = structuredClone(cur);
            trial.assign[room] = [...p];
            if (trial.seatCrews) delete trial.seatCrews[room];
            const sc = score(trial);
            if (sc > curScore + 1e-6) { cur = trial; curScore = sc; improved = true; }
          }
        }
        if (!improved) break;
      }
      return { cur, curScore };
    };
    const first = descend(start, startScore);
    best = first.cur; bestScore = first.curScore;
    for (let restart = 0; restart < (flag('--restarts') ?? 4); restart++) {
      const trial = structuredClone(best);
      const kicks = 1 + Math.floor(random() * 2);
      for (let k = 0; k < kicks; k++) {
        const room = rooms[Math.floor(random() * rooms.length)];
        trial.assign[room] = [...pats[Math.floor(random() * pats.length)]];
        if (trial.seatCrews) delete trial.seatCrews[room];
      }
      const kickedScore = score(trial);
      if (kickedScore === -Infinity) continue;
      const out = descend(trial, kickedScore);
      if (out.curScore > bestScore) { best = out.cur; bestScore = out.curScore; }
    }
    // If the descent never reached a valid schedule, keep the plan: an exhausted genome is not a candidate.
    const bestEval = evaluate(best, ctx);
    const valid = bestEval.sim.periodic && !bestEval.sim.events.some(e => e.kind === 'exhausted') && !hasWorkingCollision(best);
    const candidate = valid ? scoreOf(bestEval.sim, ctx) : -Infinity;
    // A valid schedule the descent found can still be worse than the plan (the plan's own dorms are not the decode's
    // rest rule): keep the plan unless the candidate beats it.
    const bestPlan = candidate > planScore ? candidate : planScore;
    console.log(`  best ${bestPlan.toFixed(0)} ${bestPlan > planScore ? '+' : ''}${((bestPlan - planScore) / planScore * 100).toFixed(2)}% vs plan (genome ${bestScore.toFixed(0)}, ${valid ? 'valid' : 'invalid'}${candidate > planScore ? '' : ' -> plan'})`);
    console.log(`RESULT ${path.basename(file).replace(/\.json$/, '')} plan ${planScore.toFixed(0)} best ${bestPlan.toFixed(0)} delta ${((bestPlan - planScore) / planScore * 100).toFixed(2)}`);
    console.log(`  ${current(best)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
