import { WORK_KINDS } from './baseOptimizer';
import { anneal, type AnnealOptions, type AnnealResult } from './annealBase';
import { evaluate, splitCrew, type Evaluation, type Genome, type GenomeContext } from './planGenome';
import type { BaseAssignments, SlotAssignment } from './baseTypes';

const namesIn = (slots: (SlotAssignment | null)[] | undefined) => (slots ?? []).flatMap(s => s ? [s.operatorName] : []);

/**
 * A second start for the search, shaped like hand-made rotation sheets: one Trading Post or Factory team joins
 * Fiammetta's refill core whole (with the core already there, and optionally one member of another Trading Post's
 * team), the crews spread over three so each works fewer changes, and Fiammetta refills whoever is lowest. The
 * search does not reach this from today's plan by itself: a bigger core only holds once all three changes are in
 * place, and every partial step runs someone out of Morale. On the 3-4-2 sheet's operators this is the Shamare
 * trio plus Proviso, the sheet's own core.
 * Returns the best such plan nobody runs out in, or null (no Fiammetta, or every variant runs someone out).
 */
export function coreSeed(g: Genome, ctx: GenomeContext): { genome: Genome; evaluation: Evaluation } | null {
  if (!('Fiammetta' in ctx.roster)) return null;
  const rooms = ctx.base.facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
  const capacity = (id: string) => rooms.find(f => f.id === id)!.capacity;
  const slotOf = (name: string): SlotAssignment => ({ operatorName: name, eliteLevel: ctx.roster[name].eliteLevel, level: ctx.roster[name].level });
  const teamsIn = (id: string) => g.crews.map(c => namesIn(c[id]).filter(n => n !== 'Fiammetta')).filter(t => t.length);
  const tradingPosts = rooms.filter(f => f.kind === 'tradingPost').map(f => f.id);
  const tried = new Set<string>();
  let best: { genome: Genome; evaluation: Evaluation } | null = null;
  const tryCore = (members: { name: string; room: string }[]) => {
    const key = members.map(m => `${m.room}:${m.name}`).sort().join('+');
    if (tried.has(key)) return;
    tried.add(key);
    const names = members.map(m => m.name);
    let n = structuredClone(g);
    // Each member takes their room in every crew (an empty place first, else one not in the new core) and leaves any
    // other place; Fiammetta leaves work to refill.
    for (const crew of n.crews) {
      for (const [id, slots] of Object.entries(crew)) crew[id] = (slots ?? []).map(s => s && ((names.includes(s.operatorName) && !members.some(m => m.room === id && m.name === s.operatorName)) || s.operatorName === 'Fiammetta') ? null : s);
      for (const m of members) {
        const slots = [...(crew[m.room] ?? [])];
        while (slots.length < capacity(m.room)) slots.push(null);
        if (slots.some(s => s?.operatorName === m.name)) continue;
        let at = slots.findIndex(s => !s);
        if (at < 0) at = slots.findIndex(s => s && !names.includes(s.operatorName));
        if (at < 0) return;
        slots[at] = slotOf(m.name);
        crew[m.room] = slots;
      }
    }
    // Earlier core members stay core only while they still work every change.
    const placedEverywhere = (name: string) => n.crews.every(crew => Object.values(crew as BaseAssignments).some(slots => namesIn(slots ?? undefined).includes(name)));
    n.core = [...g.core.filter(x => !names.includes(x) && placedEverywhere(x)), ...names];
    // A third template takes a repeated change without replacing it with another crew’s workers.
    if (n.crews.length === 2) {
      const changes = Object.entries(n.assign).flatMap(([room, a]) => {
        const step = a.findIndex((crew, index) => a.indexOf(crew) !== index);
        return step < 0 ? [] : [{ room, step }];
      });
      n = splitCrew(n, changes)!;
    }
    n.refillLowest = true;
    const evaluation = evaluate(n, ctx);
    // Not repeating, someone run out, or someone placed twice (scored far below zero).
    if (!evaluation.sim.periodic || evaluation.value <= 0 || evaluation.sim.events.some(e => e.kind === 'exhausted')) return;
    if (!best || evaluation.value > best.evaluation.value) best = { genome: n, evaluation };
  };
  for (const f of rooms.filter(x => x.kind === 'tradingPost' || x.kind === 'factory')) {
    for (const team of teamsIn(f.id)) {
      if (team.length < 2 || team.every(x => g.core.includes(x))) continue;
      const members = team.map(name => ({ name, room: f.id }));
      tryCore(members);
      // With one member of another Trading Post's team, who keeps that room (Proviso beside the Shamare trio).
      for (const other of tradingPosts) if (other !== f.id) for (const t of teamsIn(other)) for (const name of t) if (!team.includes(name)) tryCore([...members, { name, room: other }]);
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
