import { WORK_KINDS } from './baseOptimizer';
import { anneal, type AnnealOptions, type AnnealResult } from './annealBase';
import { evaluate, type Evaluation, type Genome, type GenomeContext } from './planGenome';
import type { BaseAssignments, SlotAssignment } from './baseTypes';

const namesIn = (slots: (SlotAssignment | null)[] | undefined) => (slots ?? []).flatMap(s => s ? [s.operatorName] : []);

/**
 * A second start for the search, shaped like hand-made rotation sheets: one Trading Post or Factory team joins
 * Fiammetta's refill core whole (with the core already there), the crews spread over three so each works fewer
 * changes, and Fiammetta refills whoever is lowest. The search does not reach this from today's plan by itself:
 * a bigger core only holds once all three changes are in place, and every partial step runs someone out of
 * Morale. On the 3-4-2 sheet's operators this is the Shamare trio plus Proviso, the sheet's own core.
 * Returns the best such plan nobody runs out in, or null (no Fiammetta, or every variant runs someone out).
 */
export function coreSeed(g: Genome, ctx: GenomeContext): { genome: Genome; evaluation: Evaluation } | null {
  if (!('Fiammetta' in ctx.roster)) return null;
  const rooms = ctx.base.facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
  const tried = new Set<string>();
  let best: { genome: Genome; evaluation: Evaluation } | null = null;
  for (const f of rooms.filter(x => x.kind === 'tradingPost' || x.kind === 'factory')) {
    for (const from of g.crews) {
      const team = namesIn(from[f.id]).filter(n => n !== 'Fiammetta');
      const key = `${f.id}:${[...team].sort().join('+')}`;
      if (team.length < 2 || team.every(n => g.core.includes(n)) || tried.has(key)) continue;
      tried.add(key);
      const n = structuredClone(g);
      // The team takes the room in every crew and leaves any other place.
      for (const crew of n.crews) {
        for (const [id, slots] of Object.entries(crew)) if (id !== f.id) crew[id] = (slots ?? []).map(s => s && (team.includes(s.operatorName) || s.operatorName === 'Fiammetta') ? null : s);
        crew[f.id] = structuredClone(from[f.id]);
      }
      // Earlier core members stay core only while they still work every change.
      const placedEverywhere = (name: string) => n.crews.every(crew => Object.values(crew as BaseAssignments).some(slots => namesIn(slots ?? undefined).includes(name)));
      n.core = [...g.core.filter(x => !team.includes(x) && placedEverywhere(x)), ...team];
      // A third crew, a copy of the second, takes one change of every room that one crew staffs twice.
      if (n.crews.length === 2) {
        n.crews.push(structuredClone(n.crews[1]));
        for (const id of Object.keys(n.assign)) {
          const a = n.assign[id];
          const twice = a.findIndex((c, i) => a.indexOf(c) !== i);
          if (twice >= 0) a[twice] = 2;
        }
      }
      n.refillLowest = true;
      const evaluation = evaluate(n, ctx);
      // Not repeating, someone run out, or someone placed twice (scored far below zero).
      if (!evaluation.sim.periodic || evaluation.value <= 0 || evaluation.sim.events.some(e => e.kind === 'exhausted')) continue;
      if (!best || evaluation.value > best.evaluation.value) best = { genome: n, evaluation };
    }
  }
  return best;
}

/**
 * The search from today's plan and from its core seed, in turn, the best kept. Today's plan goes first so a best
 * plan shows early; the core seed gets the rest of the time, including any the first search did not need.
 */
export function annealFromBothStarts(g: Genome, ctx: GenomeContext, opts: AnnealOptions): AnnealResult {
  const start = Date.now();
  const plain = anneal(g, ctx, { ...opts, timeMs: opts.timeMs / 2 });
  const left = opts.timeMs - (Date.now() - start);
  if (left < 1000 || opts.shouldStop?.()) return plain;
  const core = coreSeed(g, ctx);
  if (!core) return plain;
  opts.onProgress?.({ genome: core.genome, value: core.evaluation.value }, 0);
  const shaped = anneal(core.genome, ctx, { ...opts, timeMs: opts.timeMs - (Date.now() - start), seed: (opts.seed ?? 1) + 1000 });
  const best = shaped.evaluation.value > plain.evaluation.value ? shaped : plain;
  return { ...best, rounds: plain.rounds + shaped.rounds, simulations: plain.simulations + shaped.simulations, improvements: [...plain.improvements, ...shaped.improvements.map(x => `core seed ${x}`)] };
}
