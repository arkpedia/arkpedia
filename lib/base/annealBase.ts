import { WORK_KINDS } from './baseOptimizer';
import { crewAt, decode, evaluate, snapshotValue, type Evaluation, type Genome, type GenomeContext } from './planGenome';
import { teamBlocks, type TeamBlock } from './teamBlocks';
import type { BaseAssignments, SlotAssignment } from './baseTypes';

/**
 * Simulated annealing over a plan genome (lib/base/planGenome.ts). Each round proposes several moves; moves that
 * change who works where are screened with the snapshot calculator and only the best few are simulated, while
 * moves that only change timing (crew patterns, core, parked Morale, rest rule) go straight to the simulator,
 * since only Morale over time can tell them apart. A worse plan is kept with probability exp(delta / T), T cooling
 * over the time budget, so the search can leave a local optimum; the best plan seen is always kept.
 */
export interface AnnealOptions {
  timeMs: number;
  seed?: number;
  /** Moves proposed per round, and how many of the staffing ones are simulated. */
  proposals?: number;
  simulated?: number;
  /** Stop early after this many rounds without a new best. */
  patience?: number;
  /** Stop after this many rounds whatever the time (tests use it so the same seed gives the same plan). */
  maxRounds?: number;
  onProgress?: (best: { genome: Genome; value: number }, round: number) => void;
  /** Called between rounds; returning true stops the search with the best so far. */
  shouldStop?: () => boolean;
}
export interface AnnealResult { genome: Genome; evaluation: Evaluation; rounds: number; simulations: number; improvements: string[] }

/** mulberry32: small, fast and seedable, so a run can be repeated exactly. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const clone = (g: Genome): Genome => ({ ...g, crews: g.crews.map(c => structuredClone(c)), assign: Object.fromEntries(Object.entries(g.assign).map(([r, a]) => [r, [...a]])), core: [...g.core], parked: { ...g.parked }, products: { ...g.products } });
const namesIn = (a: BaseAssignments) => Object.values(a).flatMap(s => (s ?? []).flatMap(x => x ? [x.operatorName] : []));
const key = (g: Genome) => JSON.stringify([g.steps, g.k, !!g.refillLowest, Object.entries(g.assign).sort(([a], [b]) => a < b ? -1 : 1), g.core, g.parked, g.products, g.fillBeds, g.restAll, g.crews.map(c => Object.entries(c).sort(([a], [b]) => a < b ? -1 : 1).map(([r, s]) => [r, (s ?? []).map(x => x?.operatorName ?? '')]))]);

type Move = { kind: string; timing: boolean; apply: (g: Genome) => Genome | null };
const BLOCK_REFRESH = 40;

export function anneal(seedGenome: Genome, ctx: GenomeContext, opts: AnnealOptions): AnnealResult {
  const random = rng(opts.seed ?? 1);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
  const start = Date.now();
  const rooms = ctx.base.facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
  const roomIds = rooms.map(f => f.id);
  const capacity = (id: string) => rooms.find(f => f.id === id)!.capacity;
  const slotOf = (name: string): SlotAssignment => ({ operatorName: name, eliteLevel: ctx.roster[name].eliteLevel, level: ctx.roster[name].level });
  const byName = new Set(ctx.base.operators.map(o => o.name));
  const owned = Object.keys(ctx.roster).filter(n => byName.has(n) && !(ctx.lockedDorm ?? []).includes(n));

  const cache = new Map<string, Evaluation>();
  let simulations = 0;
  const score = (g: Genome): Evaluation => {
    const k = key(g);
    let e = cache.get(k);
    if (!e) { e = evaluate(g, ctx); cache.set(k, e); simulations++; }
    return e;
  };
  // The snapshot proxy: every change's working staff, scored at full Morale, summed.
  const proxy = (g: Genome) => {
    let total = 0;
    for (let s = 0; s < g.steps; s++) total += snapshotValue(Object.fromEntries(roomIds.map(id => [id, g.crews[crewAt(g, id, s)][id] ?? []])), g, ctx);
    return total;
  };

  /** Put `name` into crew c, room `room`, slot i; it leaves every other place first (a core member stops being one). */
  const place = (g: Genome, c: number, room: string, i: number, name: string | null) => {
    if (name) {
      for (const crew of g.crews) for (const [id, slots] of Object.entries(crew)) crew[id] = (slots ?? []).map(s => s?.operatorName === name ? null : s);
      g.core = g.core.filter(n => n !== name);
    }
    const old = g.crews[c][room]?.[i]?.operatorName;
    if (old && g.core.includes(old)) {
      // Taking a core member's slot in one crew ends their core role; they keep the other crew's place.
      g.core = g.core.filter(n => n !== old);
    }
    const slots = [...(g.crews[c][room] ?? Array(capacity(room)).fill(null))];
    while (slots.length < capacity(room)) slots.push(null);
    slots[i] = name ? slotOf(name) : null;
    g.crews[c][room] = slots;
  };
  const unused = (g: Genome) => {
    const inPlan = new Set([...g.crews.flatMap(namesIn), ...(g.core.length ? ['Fiammetta'] : [])]);
    return owned.filter(n => !inPlan.has(n));
  };

  // A team's worth depends on the rest of the base it works beside (a Control Center for the crew it supports, a
  // factory beside the Trading Posts of its crew), so each crew draws from blocks built in its own context, and the
  // blocks are rebuilt every BLOCK_REFRESH rounds as the crews change (about a second each on a maxed roster).
  let blocksFor = new Map<string, Record<string, TeamBlock[]>>();
  let epoch = 0;
  const blocks = (g: Genome, c: number) => {
    const k = `${JSON.stringify(g.products)}|${c}`;
    let b = blocksFor.get(k);
    if (!b) { b = teamBlocks(ctx, g.crews[c], g.products, { top: 16 }); blocksFor.set(k, b); }
    return b;
  };

  const moves: { weight: number; make: () => Move }[] = [
    // A room's whole team in one crew, from that room's best teams.
    { weight: 4, make: () => ({ kind: 'team', timing: false, apply: g => {
      const room = pick(roomIds); const c = Math.floor(random() * g.crews.length);
      const options = (blocks(g, c)[room] ?? []).filter(b => b.names.join() !== namesIn({ x: g.crews[c][room] ?? [] }).join());
      if (!options.length) return null;
      const b = pick(options.slice(0, Math.max(2, Math.ceil(options.length * (0.3 + random() * 0.7)))));
      const n = clone(g);
      for (let i = 0; i < capacity(room); i++) place(n, c, room, i, null);
      b.names.forEach((name, i) => place(n, c, room, i, name));
      return n;
    } }) },
    // Two places trade operators, or a place takes someone unused.
    { weight: 4, make: () => ({ kind: 'swap', timing: false, apply: g => {
      const n = clone(g);
      const c = Math.floor(random() * n.crews.length), room = pick(roomIds), i = Math.floor(random() * capacity(room));
      const here = n.crews[c][room]?.[i]?.operatorName ?? null;
      if (random() < 0.5) {
        const pool = unused(n); if (!pool.length) return null;
        place(n, c, room, i, pick(pool));
        return n;
      }
      const c2 = Math.floor(random() * n.crews.length), room2 = pick(roomIds), j = Math.floor(random() * capacity(room2));
      const there = n.crews[c2][room2]?.[j]?.operatorName ?? null;
      if (here === there) return null;
      place(n, c, room, i, null); place(n, c2, room2, j, null);
      if (there) place(n, c, room, i, there);
      if (here) place(n, c2, room2, j, here);
      return n;
    } }) },
    // When each crew staffs a room: shift its order by a change, or give one change to another crew.
    { weight: 3, make: () => ({ kind: 'retime', timing: true, apply: g => {
      const n = clone(g); const room = pick(roomIds);
      const a = n.assign[room] ?? Array(n.steps).fill(0);
      if (random() < 0.5) n.assign[room] = a.map((_, s) => a[(s + n.steps - 1) % n.steps]);
      else { const s = Math.floor(random() * n.steps); const others = n.crews.map((_, c) => c).filter(c => c !== a[s]); n.assign[room] = a.map((c, t) => t === s ? pick(others) : c); }
      return n;
    } }) },
    // A third crew (a copy of the second, given one change in a few rooms, for the other moves to shape), or
    // back to two (its changes go to the second crew).
    { weight: 1, make: () => ({ kind: 'crews', timing: true, apply: g => {
      const n = clone(g);
      if (n.crews.length === 2) {
        n.crews.push(structuredClone(n.crews[1]));
        for (const room of roomIds) if (random() < 0.4) { const s = Math.floor(random() * n.steps); n.assign[room][s] = 2; }
      } else {
        n.crews.pop();
        for (const room of roomIds) n.assign[room] = n.assign[room].map(c => c === 2 ? 1 : c);
      }
      return n;
    } }) },
    // A worker joins or leaves Fiammetta's refill core (same room in both crews).
    { weight: 2, make: () => ({ kind: 'core', timing: true, apply: g => {
      if (!('Fiammetta' in ctx.roster)) return null;
      const n = clone(g);
      if (n.core.length && random() < 0.4) {
        const name = pick(n.core);
        n.core = n.core.filter(x => x !== name);
        // They stay in one crew's place and leave the others'.
        const keep = Math.floor(random() * n.crews.length);
        n.crews.forEach((crew, c) => { if (c !== keep) for (const [id, slots] of Object.entries(crew)) crew[id] = (slots ?? []).map(s => s?.operatorName === name ? null : s); });
        return n;
      }
      const c = Math.floor(random() * n.crews.length);
      const workers = roomIds.flatMap(id => (n.crews[c][id] ?? []).flatMap(s => s && !n.core.includes(s.operatorName) && s.operatorName !== 'Fiammetta' ? [{ id, name: s.operatorName }] : []));
      if (!workers.length) return null;
      const w = pick(workers);
      // In the same room in every crew, so they work every change.
      const kept = n.crews.map(crew => crew[w.id]);
      n.crews.forEach((crew, cc) => {
        if (cc === c || (crew[w.id] ?? []).some(s => s?.operatorName === w.name)) return;
        const slots = [...(kept[cc] ?? Array(capacity(w.id)).fill(null))];
        const free = slots.findIndex(x => !x);
        slots[free >= 0 ? free : Math.floor(random() * slots.length)] = slotOf(w.name);
        crew[w.id] = slots;
      });
      n.core = [...n.core, w.name];
      // Fiammetta now sits in a dorm, so she cannot also work.
      for (const crew of n.crews) for (const [id, s] of Object.entries(crew)) crew[id] = (s ?? []).map(x => x?.operatorName === 'Fiammetta' ? null : x);
      return n;
    } }) },
    // A room's whole team becomes the core at once, some of the old core kept (in their rooms), the rest back to one
    // crew's place. A bigger core only holds when all of it, and refilling the lowest first, arrive together: one
    // member at a time, each step runs someone out of Morale (the Shamare trio with Proviso, as hand-made sheets run).
    { weight: 1, make: () => ({ kind: 'core team', timing: true, apply: g => {
      if (!('Fiammetta' in ctx.roster)) return null;
      const n = clone(g);
      const c = Math.floor(random() * n.crews.length), room = pick(roomIds);
      const team = namesIn({ x: n.crews[c][room] ?? [] }).filter(x => x !== 'Fiammetta');
      if (!team.length || team.every(x => n.core.includes(x))) return null;
      const kept = n.core.filter(x => !team.includes(x) && random() < 0.5);
      const leaving = n.core.filter(x => !team.includes(x) && !kept.includes(x));
      n.crews.forEach((crew, cc) => { if (cc !== c) for (const [id, s] of Object.entries(crew)) crew[id] = (s ?? []).map(x => x && leaving.includes(x.operatorName) ? null : x); });
      // The team takes the same room in every crew; whoever had those places there goes unused.
      for (const crew of n.crews) {
        for (const [id, s] of Object.entries(crew)) if (id !== room) crew[id] = (s ?? []).map(x => x && team.includes(x.operatorName) ? null : x);
        crew[room] = structuredClone(n.crews[c][room]);
      }
      for (const crew of n.crews) for (const [id, s] of Object.entries(crew)) crew[id] = (s ?? []).map(x => x?.operatorName === 'Fiammetta' ? null : x);
      n.core = [...kept, ...team];
      n.refillLowest = random() < 0.7;
      return n;
    } }) },
    // Parked Morale (Dusk below 12), the rest rule, empty-bed filling, two to four changes, a factory's product.
    { weight: 2, make: () => ({ kind: 'setting', timing: true, apply: g => {
      const n = clone(g);
      const which = Math.floor(random() * 6);
      if (which === 0) { if (!('Dusk' in ctx.roster)) return null; if (n.parked.Dusk !== undefined) delete n.parked.Dusk; else n.parked.Dusk = 11; }
      else if (which === 1) n.restAll = !n.restAll;
      else if (which === 2) n.fillBeds = !n.fillBeds;
      else if (which === 5) { if (!n.core.length) return null; n.refillLowest = !n.refillLowest; }
      else if (which === 3) {
        // Two, three or four changes; each room's pattern is carried over by position.
        const next = pick([2, 3, 4].filter(x => x !== n.steps));
        for (const id of roomIds) { const a = n.assign[id] ?? Array(n.steps).fill(0); n.assign[id] = Array.from({ length: next }, (_, s) => a[s] ?? a[a.length - 1]); }
        n.steps = next;
      }
      else {
        const factories = Object.keys(n.products); if (!factories.length) return null;
        const f = pick(factories);
        const other = factories.filter(x => n.products[x] !== n.products[f]);
        // Half the time two factories trade products (EXP to the level 3 one, gold to the level 2), which one flip
        // at a time reaches only through a worse split.
        if (other.length && random() < 0.5) { const g = pick(other); [n.products[f], n.products[g]] = [n.products[g], n.products[f]]; }
        else n.products[f] = n.products[f] === 'Precious Metals' ? 'Battle Records' : 'Precious Metals';
      }
      return n;
    } }) },
  ];
  const totalWeight = moves.reduce((s, m) => s + m.weight, 0);
  const propose = (): Move => { let r = random() * totalWeight; for (const m of moves) { r -= m.weight; if (r <= 0) return m.make(); } return moves[0].make(); };

  let current = { genome: seedGenome, e: score(seedGenome) };
  let best = current;
  const improvements: string[] = [];
  const t0 = Math.max(1, Math.abs(current.e.value) * 0.004), t1 = Math.max(0.1, Math.abs(current.e.value) * 0.00005);
  const proposals = opts.proposals ?? 12, simulated = opts.simulated ?? 2, patience = opts.patience ?? 400;
  let round = 0, sinceBest = 0;
  while (Date.now() - start < opts.timeMs && sinceBest < patience && round < (opts.maxRounds ?? Infinity) && !opts.shouldStop?.()) {
    round++; sinceBest++;
    if (Math.floor(round / BLOCK_REFRESH) !== epoch) { epoch = Math.floor(round / BLOCK_REFRESH); blocksFor = new Map(); }
    const progress = Math.min(1, (Date.now() - start) / opts.timeMs);
    const temperature = t0 * Math.pow(t1 / t0, progress);
    const staffing: { g: Genome; kind: string; p: number }[] = [];
    const timing: { g: Genome; kind: string }[] = [];
    for (let i = 0; i < proposals; i++) {
      const m = propose();
      const g = m.apply(current.genome);
      if (!g) continue;
      if (m.timing) timing.push({ g, kind: m.kind }); else staffing.push({ g, kind: m.kind, p: 0 });
    }
    for (const s of staffing) s.p = proxy(s.g);
    const chosen = [...staffing.sort((x, y) => y.p - x.p).slice(0, simulated), ...timing.slice(0, 1)];
    let next: { genome: Genome; e: Evaluation; kind: string } | null = null;
    for (const c of chosen) {
      const e = score(c.g);
      if (!next || e.value > next.e.value) next = { genome: c.g, e, kind: c.kind };
    }
    if (!next) continue;
    const delta = next.e.value - current.e.value;
    if (delta > 0 || random() < Math.exp(delta / temperature)) current = { genome: next.genome, e: next.e };
    if (current.e.value > best.e.value + 1e-6) {
      improvements.push(`round ${round}: ${next.kind} -> ${current.e.value.toFixed(0)}`);
      best = current; sinceBest = 0;
      opts.onProgress?.({ genome: best.genome, value: best.e.value }, round);
    }
    // Stuck in a worse region for a while: go back to the best plan.
    if (sinceBest > 0 && sinceBest % 60 === 0) current = best;
  }
  blocksFor = new Map();
  return { genome: best.genome, evaluation: best.e, rounds: round, simulations, improvements };
}

/** For tests and benchmarks: whether a genome decodes to shifts that place nobody twice. */
export function placesNobodyTwice(g: Genome, ctx: GenomeContext): boolean {
  return decode(g, ctx).every(sh => { const n = namesIn(sh.assignments); return n.length === new Set(n).size; });
}
