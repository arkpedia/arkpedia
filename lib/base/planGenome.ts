import { settle } from './settle';
import { calculateBase } from './calculateBase';
import { exceedsSetups } from './rotationSetups';
import { snapshotTotals } from './snapshotMemo';
import { activeBaseSkills, cleanSkillName } from './activeBaseSkills';
import { simulateBase, type SimulationBase, type SimulationResult, type SimulationShift } from './baseSimulation';
import { DEFAULT_WEIGHTS, WORK_KINDS, sustainableOutput, type OptimizerResult, type OptimizerWeights, type OwnedOperator, type RoomExplanation, type ScheduleStep } from './baseOptimizer';
import type { BaseAssignments, FactoryProducts, SeatCrews, SlotAssignment } from './baseTypes';

/**
 * A whole base plan as a few independent choices, so a search can change one at a time and the simulator
 * can score the result. Two or three crews staff the work rooms; over `steps` staffing changes (2 to
 * MAX_GENOME_STEPS) `assign` says which crew staffs each room at each change. That expresses the alternation
 * (2 steps), duty and thirds (3: a room's main crew rests one change in three, all together or spread out), a
 * four-step duty and three distinct formations (three crews, as the reference sheet runs). A plan may not need
 * more distinct setups than the game stores as presets (MAX_ROTATION_SETUPS in rotationSetups.ts): the
 * staggered shape (4: two halves of the base change crew in turn) is four, so it scores as unusable. Core workers sit in the same room in every crew, so they work every change, refilled by
 * Fiammetta. Parked operators start at a set Morale and wait rather than rest when off shift (Dusk below 12).
 */
/** The most staffing changes a genome holds; the game's preset bound is on distinct setups, not changes. */
export const MAX_GENOME_STEPS = 4;

export interface Genome {
  steps: number;
  /** Logins per staffing change. */
  k: number;
  /** Two or three staffing templates. Placements may share an operator only when they never work together. */
  crews: BaseAssignments[];
  /** For each room, the crew (an index into `crews`) that staffs it at each change, `steps` long. */
  assign: Record<string, number[]>;
  /** Stagger: a seat that takes another crew's worker at some changes while the room's crew works on (the base
   *  expert's second rotation, for 12-hour and 8-hour logins): per room, per seat, the crew at each change where
   *  it differs from `assign`. Absent or undefined seats follow the room. */
  seatCrews?: SeatCrews;
  /** Fiammetta's refill list: workers placed in the same room in both crews. */
  core: string[];
  parked: Record<string, number>;
  products: FactoryProducts;
  /** Seat owned operators the plan does not use in empty beds (dorm head counts feed several skills). */
  fillBeds: boolean;
  /** Fiammetta gives her Morale to the lowest core member rather than the next in a fixed order. */
  refillLowest?: boolean;
  /** Every off-duty worker rests; otherwise only whoever just came off shift does, the rest wait unassigned and
   * their beds go to idle operators (Iris and Czerny's dorm skills feed Rosmontis, for one). */
  restAll: boolean;
}

export interface GenomeContext {
  base: SimulationBase;
  roster: Record<string, OwnedOperator>;
  loginInterval: number;
  weights?: OptimizerWeights;
  sustainable?: boolean;
  externalGold?: number;
  drones?: boolean;
  allowExhaustion?: boolean;
  /** Operators kept in the dorms in every shift; they take a bed each and never work. */
  lockedDorm?: string[];
}

export interface Evaluation { shifts: SimulationShift[]; sim: SimulationResult; value: number }

/** One room-rate cache per context (one base), shared by every evaluation a search makes in it. */
const rateCaches = new WeakMap<GenomeContext, Map<string, unknown>>();
const rateCacheFor = (ctx: GenomeContext) => { let c = rateCaches.get(ctx); if (!c) { c = new Map(); rateCaches.set(ctx, c); } return c; };

const operatorsIn = (a: BaseAssignments) => Object.values(a).flatMap(slots => (slots ?? []).flatMap(s => s ? [s.operatorName] : []));

/** The context's fixed pieces, computed once per context and reused by every decode. */
function layout(ctx: GenomeContext) {
  const { base, roster } = ctx;
  const byName = new Map(base.operators.map(o => [o.name, o]));
  const rooms = base.facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
  const dorms = base.facilities.filter(f => f.kind === 'dormitory' && f.capacity > 0);
  const locked = (ctx.lockedDorm ?? []).filter(name => byName.has(name) && name in roster);
  const slotOf = (name: string): SlotAssignment => ({ operatorName: name, eliteLevel: roster[name].eliteLevel, level: roster[name].level });
  const dormSkill = (name: string) => !!byName.get(name) && activeBaseSkills(byName.get(name)!, 'Dormitory', roster[name].eliteLevel, base.skillSlots, roster[name].level).length > 0;
  return { byName, rooms, dorms, locked, slotOf, dormSkill };
}
const layouts = new WeakMap<GenomeContext, ReturnType<typeof layout>>();
const fixed = (ctx: GenomeContext) => { let l = layouts.get(ctx); if (!l) { l = layout(ctx); layouts.set(ctx, l); } return l; };

/** Which crew (0 or 1) staffs `room` on change `step`. */
export const crewAt = (g: Genome, room: string, step: number) => g.assign[room]?.[step] ?? 0;
/** Which crew holds `seat` of `room` on change `step`: the seat's own crew where it staggers, else the room's. */
export const crewAtSeat = (g: Genome, room: string, seat: number, step: number) => g.seatCrews?.[room]?.[seat]?.[step] ?? crewAt(g, room, step);
/** The room's working staff on change `step`, seat by seat. */
export const staffAt = (g: Genome, room: string, step: number, capacity: number): (SlotAssignment | null)[] =>
  Array.from({ length: capacity }, (_, i) => g.crews[crewAtSeat(g, room, i, step)]?.[room]?.[i] ?? null);

/** Place one worker, removing only assignments that overlap its actual working changes.
 * A room may share that worker with another room on a different change. */
export function placeGenomeOperator(g: Genome, c: number, room: string, index: number, slot: SlotAssignment | null, capacity: number, reuseAcrossRooms = true): void {
  if (slot) {
    const active = Array.from({ length: g.steps }, (_, step) => step).filter(step => crewAtSeat(g, room, index, step) === c);
    for (const [otherCrew, crew] of g.crews.entries()) for (const [id, slots] of Object.entries(crew)) {
      const keptCore = g.core.includes(slot.operatorName) && id === room && otherCrew !== c;
      const conflict = reuseAcrossRooms
        ? (otherCrew === c && id === room) || active.some(step => (slots ?? []).some((_, j) => crewAtSeat(g, id, j, step) === otherCrew))
        : !keptCore;
      if (conflict) crew[id] = (slots ?? []).map(old => old?.operatorName === slot.operatorName ? null : old);
    }
  }
  const slots = [...(g.crews[c][room] ?? [])];
  while (slots.length < capacity) slots.push(null);
  slots[index] = slot;
  g.crews[c][room] = slots;
}

/** Split some uses of one template into an identical third template. The decoded plan stays unchanged. */
export function splitCrew(g: Genome, changes: { room: string; step: number }[]): Genome | null {
  if (g.crews.length !== 2) return null;
  const source = new Map<string, number>();
  for (const { room, step } of changes) {
    if (!g.assign[room] || step < 0 || step >= g.steps) return null;
    const crew = crewAt(g, room, step);
    if (source.has(room) && source.get(room) !== crew) return null;
    source.set(room, crew);
  }
  const next = structuredClone(g);
  next.crews.push(Object.fromEntries(Object.keys(g.assign).map(room => [room, structuredClone(g.crews[source.get(room) ?? 0][room] ?? [])])));
  for (const { room, step } of changes) next.assign[room][step] = 2;
  return next;
}

/** A retiming can make previously separate placements overlap. Check before an expensive score. */
export function hasWorkingCollision(g: Genome, rooms: string[] = Object.keys(g.assign)): boolean {
  for (let step = 0; step < g.steps; step++) {
    const on = new Set<string>();
    for (const id of rooms) for (const [i, slot] of (g.crews[crewAt(g, id, step)][id] ?? []).entries()) {
      const seat = g.seatCrews?.[id]?.[i]?.[step] !== undefined ? g.crews[crewAtSeat(g, id, i, step)]?.[id]?.[i] : slot;
      if (!seat) continue;
      if (on.has(seat.operatorName)) return true;
      on.add(seat.operatorName);
    }
  }
  return false;
}

/** The genome as the simulator's shift list. */
export function decode(g: Genome, ctx: GenomeContext): SimulationShift[] {
  const { rooms, dorms, locked, slotOf, dormSkill } = fixed(ctx);
  const parked = new Set(Object.keys(g.parked));
  const working = Array.from({ length: g.steps }, (_, s) => Object.fromEntries(rooms.map(f => [f.id, g.seatCrews?.[f.id] ? staffAt(g, f.id, s, f.capacity) : g.crews[crewAt(g, f.id, s)][f.id] ?? Array(f.capacity).fill(null)])) as BaseAssignments);
  // Fiammetta refills only with a core and while she works nowhere; otherwise she is a worker like any other and
  // rests like one (a plan of today's optimizer may staff a Trading Post with her).
  const everyone = [...new Set(g.crews.flatMap(operatorsIn))].filter(n => !locked.includes(n));
  const fiammetta = g.core.length > 0 && 'Fiammetta' in ctx.roster && !everyone.includes('Fiammetta') && dorms.length > 0;
  const idle = g.fillBeds
    ? Object.keys(ctx.roster).filter(n => fixed(ctx).byName.has(n) && !everyone.includes(n) && !parked.has(n) && !locked.includes(n) && n !== 'Fiammetta').sort((x, y) => Number(dormSkill(y)) - Number(dormSkill(x)) || x.localeCompare(y))
    : [];
  return working.map((w, s) => {
    const on = new Set(operatorsIn(w));
    const justWorked = new Set(operatorsIn(working[(s + g.steps - 1) % g.steps]));
    // Whoever just came off shift rests first; a parked operator waits rather than rest.
    const resting = everyone.filter(n => !on.has(n) && !parked.has(n) && (g.restAll || justWorked.has(n))).sort((x, y) => Number(justWorked.has(y)) - Number(justWorked.has(x)));
    const a: BaseAssignments = { ...w };
    const beds = dorms.map(d => ({ d, slots: Array<SlotAssignment | null>(d.capacity).fill(null) }));
    // Fiammetta keeps the head of the first dorm, so nobody arrives before her; locked residents keep the last beds.
    if (fiammetta) beds[0].slots[0] = slotOf('Fiammetta');
    locked.forEach((name, i) => { const b = beds[i % beds.length]; const at = b.slots.lastIndexOf(null); if (at >= 0) b.slots[at] = slotOf(name); });
    const queue = [...resting];
    for (const b of beds) for (let i = 0; i < b.slots.length && queue.length; i++) if (!b.slots[i]) b.slots[i] = slotOf(queue.shift()!);
    // Idle operators take the beds still empty, never in Fiammetta's dorm (she would swap her Morale with them).
    let next = 0;
    for (const b of beds) {
      if (fiammetta && b === beds[0]) continue;
      for (let i = 0; i < b.slots.length && next < idle.length; i++) if (!b.slots[i]) b.slots[i] = slotOf(idle[next++]);
    }
    for (const b of beds) a[b.d.id] = b.slots;
    return { assignments: a, factoryProducts: g.products, logins: g.k, ...(fiammetta && g.core.length ? { refill: g.core } : {}) };
  });
}

/** The account's score for a genome: same objective and penalties as optimizeBase. `lean` skips the Morale trace
 * and per-login Morale the search never reads (the score, events and warnings are the same); the plan shown to a
 * reader is evaluated in full. */
export function evaluate(g: Genome, ctx: GenomeContext, lean = false): Evaluation {
  const shifts = decode(g, ctx);
  const weights = ctx.weights ?? DEFAULT_WEIGHTS;
  const sim = simulateBase({
    base: ctx.base, shifts, loginInterval: ctx.loginInterval, initialMorale: g.parked, drones: ctx.drones, refillPolicy: g.refillLowest ? 'lowest' : 'rotation', rateCache: rateCacheFor(ctx), lean,
    droneWeights: { lmd: weights.lmd, exp: weights.exp, goldMade: weights.goldMade },
    ...(ctx.sustainable ? { droneFunding: { externalGold: ctx.externalGold ?? 0 } } : {}),
  });
  // More distinct setups than the game stores as presets cannot be set up, so it loses to any plan that can.
  return { shifts, sim, value: scoreOf(sim, ctx) - (exceedsSetups(shifts) ? 1e9 : 0) };
}

export function scoreOf(sim: SimulationResult, ctx: GenomeContext): number {
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const base = settle(ctx.sustainable
    ? sustainableOutput(sim.perDay, ctx.externalGold).lmd * w.lmd + sim.perDay.exp * w.exp
    : sim.perDay.lmd * w.lmd + sim.perDay.exp * w.exp + sim.perDay.goldMade * w.goldMade);
  return base - (sim.periodic ? 0 : 1e9) - (ctx.allowExhaustion ? 0 : 1e6 * sim.events.filter(e => e.kind === 'exhausted').length)
    - (sim.warnings.some(x => / twice\.$/.test(x)) ? 1e12 : 0);
}

/** Today's optimizer result as a genome, read from what was actually simulated. Null for a plan of more than
 * MAX_GENOME_STEPS staffing changes or fewer than two, and for one that needs more presets than the game stores. */
export function genomeFromResult(result: OptimizerResult, ctx: GenomeContext): Genome | null {
  const steps = result.shifts.length;
  if (steps < 2 || steps > MAX_GENOME_STEPS || exceedsSetups(result.shifts)) return null;
  const { rooms } = fixed(ctx);
  const roomIds = rooms.map(f => f.id);
  const crewIds = result.schedule.flatMap(step => step.crewIn.map(entry => entry.crew));
  if (crewIds.some(index => !Number.isInteger(index) || index < 0 || index > 2)) return null;
  const crews: BaseAssignments[] = Array.from({ length: Math.max(2, ...crewIds.map(index => index + 1)) }, () => ({}));
  const assign: Record<string, number[]> = {};
  for (const id of roomIds) {
    // The schedule says which crew comes into the room at each change; the shifts say who that crew is. A
    // staggered schedule lists only the rooms that change, so an unlisted room keeps the crew it had.
    const named = result.schedule.map(st => st.crewIn.find(c => c.rooms.includes(id))?.crew);
    if (named.length !== steps) return null;
    const byStep: number[] = Array(steps).fill(named.find(c => c !== undefined) ?? 0);
    for (let pass = 0; pass < 2; pass++) for (let s = 0; s < steps; s++) byStep[s] = named[s] ?? byStep[(s + steps - 1) % steps];
    for (let s = 0; s < steps; s++) crews[byStep[s]][id] ??= result.shifts[s].assignments[id] ?? Array(rooms.find(f => f.id === id)!.capacity).fill(null);
    const fallback = crews.find(crew => crew[id])?.[id] ?? Array(rooms.find(f => f.id === id)!.capacity).fill(null);
    for (const crew of crews) crew[id] ??= fallback;
    assign[id] = byStep;
  }
  const g: Genome = {
    steps, k: Math.max(1, Math.round(result.stepHours / ctx.loginInterval)), crews, assign,
    core: result.shifts[0].refill ?? [], refillLowest: result.refillPolicy === 'lowest', parked: result.initialMorale ?? {}, products: result.shifts[0].factoryProducts, fillBeds: true, restAll: true,
    ...(result.seatCrews ? { seatCrews: structuredClone(result.seatCrews) } : {}),
  };
  // A staggered room reads back seat by seat: the shifts say who holds each seat at each change, and the crews
  // are rebuilt from the changes the seat's crew holds it, so the decoded plan is the saved one.
  if (result.seatCrews) for (const [id, seats] of Object.entries(result.seatCrews)) seats.forEach((pattern, i) => {
    if (!pattern) return;
    for (let s = 0; s < steps; s++) { const c = pattern[s] ?? crewAt(g, id, s); const slots = [...(crews[c][id] ?? [])]; slots[i] = result.shifts[s].assignments[id]?.[i] ?? null; crews[c][id] = slots; }
  });
  // Which rest rule the plan used is not recorded; keep whichever scores higher.
  const other = { ...g, restAll: false };
  return evaluate(other, ctx).value > evaluate(g, ctx).value ? other : g;
}

/** The snapshot value of one crew's staffing (green: what one login collects), for explanations and screening.
 * Remembered by content (snapshotMemo.ts): the proxy sums every staffing change of a proposal, most unchanged. */
export function snapshotValue(assignments: BaseAssignments, g: Genome, ctx: GenomeContext): number {
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const r = snapshotTotals(ctx.base, assignments, g.products, ctx.loginInterval);
  return r.lmd * w.lmd + r.exp * w.exp + r.goldMade * w.goldMade;
}

/** The genome and its evaluation in the shape the account page renders. */
export function toOptimizerResult(g: Genome, e: Evaluation, ctx: GenomeContext, notes: string[] = []): OptimizerResult {
  const { rooms, byName } = fixed(ctx);
  const roomIds = rooms.map(f => f.id);
  const step = g.k * ctx.loginInterval;
  const schedule: ScheduleStep[] = Array.from({ length: g.steps }, (_, s) => {
    return {
      hour: s * step,
      crewIn: g.crews.map((_, c) => ({ crew: c, rooms: roomIds.filter(id => crewAt(g, id, s) === c) })).filter(x => x.rooms.length),
      resting: g.crews.map((_, c) => ({ crew: c, rooms: roomIds.filter(id => crewAt(g, id, s) !== c && g.assign[id]?.includes(c)) })).filter(x => x.rooms.length),
    };
  });
  const explanations: RoomExplanation[] = [];
  g.crews.forEach((crew, index) => {
    const whole = snapshotValue(crew, g, ctx);
    const r = calculateBase({ ...ctx.base, assignments: crew, factoryProducts: g.products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' });
    for (const f of rooms) {
      const names = (crew[f.id] ?? []).flatMap(s => s ? [s.operatorName] : []);
      if (!names.length) continue;
      const out = r.roomDailyOutput[f.id];
      explanations.push({
        crew: index, room: f.id, kind: f.kind,
        perDay: out ? { exp: out.exp, goldMade: out.goldMade, goldSold: out.goldSold, lmd: out.goldSold * 500 + out.extraLmd + out.pepeLmd } : { exp: 0, goldMade: 0, goldSold: 0, lmd: 0 },
        operators: names.map(name => ({
          name,
          marginal: whole - snapshotValue(Object.fromEntries(Object.entries(crew).map(([room, slots]) => [room, (slots ?? []).map(s => s?.operatorName === name ? null : s)])), g, ctx),
          skills: activeBaseSkills(byName.get(name)!, f.label, ctx.roster[name].eliteLevel, ctx.base.skillSlots, ctx.roster[name].level).map(s => ({ name: cleanSkillName(s.name), description: s.description ?? '' })),
        })),
      });
    }
  });
  const patterns = new Set(Object.values(g.assign).map(c => c.join()));
  const shape = g.crews.length > 2 || (g.core.length && g.steps === 2) ? 'formations' : g.steps === 4 ? 'staggered' : g.steps === 3 ? (patterns.size > 1 ? 'thirds' : 'duty') : 'alternate';
  // Longest run of changes one crew holds a room, somewhere in the base.
  const run = Math.max(1, ...Object.values(g.assign).map(a => { let best = 0, cur = 0; for (let i = 1; i < 2 * g.steps; i++) { cur = a[i % g.steps] === a[(i - 1) % g.steps] ? cur + 1 : 0; best = Math.max(best, cur + 1); } return Math.min(best, g.steps); }));
  return {
    shape, crews: g.crews, schedule, shifts: e.shifts, stepHours: step, workHours: run * step,
    simulation: e.sim, score: e.value, explanations, notes, evaluations: e.sim.evaluations,
    ...(Object.keys(g.parked).length ? { initialMorale: g.parked } : {}),
    ...(g.refillLowest && g.core.length ? { refillPolicy: 'lowest' as const } : {}),
    ...(staggeredRooms(g).length ? { seatCrews: structuredClone(g.seatCrews) } : {}),
  };
}

/** The rooms where some seat changes crew on its own. */
export function staggeredRooms(g: Genome): string[] {
  return Object.entries(g.seatCrews ?? {}).filter(([id, seats]) => seats.some((pattern, i) => pattern && pattern.some((c, s) => c !== undefined && c !== crewAt(g, id, s) && g.crews[c]?.[id]?.[i])) ).map(([id]) => id);
}

/** What a reader needs to know to run the plan: the parts a schedule alone does not say. */
export function genomeNotes(g: Genome, e: Evaluation, ctx: GenomeContext): string[] {
  const { rooms, dorms } = fixed(ctx);
  const notes: string[] = [];
  const patterns = new Set(Object.values(g.assign).map(c => c.join()));
  if (g.crews.length > 2) notes.push(`${g.crews.length} crews over ${g.steps} staffing changes: each room has its own order of crews (the schedule shows which), so the best workers can work more changes than they rest.`);
  else if (g.steps > 2) notes.push(patterns.size > 1
    ? `${g.steps} staffing changes a cycle, and rooms change crew on different ones (the schedule shows which), so only part of the base rests at a time.`
    : `${g.steps} staffing changes a cycle: the first crew works ${(Object.values(g.assign)[0] ?? []).filter(c => c === 0).length} of them and the second covers the rest.`);
  for (const id of staggeredRooms(g)) {
    const room = rooms.find(f => f.id === id);
    const seats = (g.seatCrews![id] ?? []).flatMap((pattern, i) => pattern && pattern.some((c, s) => c !== undefined && c !== crewAt(g, id, s)) ? [`seat ${i + 1} (${pattern.map((c, s) => (g.crews[c ?? crewAt(g, id, s)]?.[id]?.[i]?.operatorName ?? 'empty')).join(' → ')})`] : []);
    notes.push(`${room?.label ?? id} staggers: ${seats.join('; ')} change hands on their own while the rest of the crew works on, so the best workers return as soon as they have rested.`);
  }
  if (g.core.length) notes.push(`Fiammetta refills ${g.core.join(', ')}${g.refillLowest ? '' : ' in turn'} at the staffing changes: each works every shift and never rests. She sits at the head of ${dorms[0]?.label ?? 'the first dorm'} and, whenever she is full at a staffing change, ${g.refillLowest ? 'gives her Morale to whichever of them is lowest' : 'swaps her Morale with the next of them in that order'}.`);
  if (g.parked.Dusk !== undefined) notes.push(`Drain Dusk below 12 Morale once (any working room will do) and keep her there: below 12 "Unstirred by Gain" adds Worldly Plight +15${'Ling' in ctx.roster ? ' on top of Ling\'s +15 above 12' : ''}. In the Control Center with this crew she loses no Morale, and when off shift she waits unassigned rather than resting, so she stays below 12.`);
  if (!g.restAll) notes.push('Only whoever has just come off shift rests in the dorms; the others wait unassigned, which leaves beds for operators whose dorm skills count.');
  const crewNames = new Set(g.crews.flatMap(operatorsIn));
  const sitters = [...new Set(e.shifts.flatMap(sh => dorms.flatMap(d => (sh.assignments[d.id] ?? []).flatMap(s => s && !crewNames.has(s.operatorName) && s.operatorName !== 'Fiammetta' && !(ctx.lockedDorm ?? []).includes(s.operatorName) ? [s.operatorName] : []))))];
  if (sitters.length) notes.push(`${sitters.length} operators the plan does not otherwise use (${sitters.join(', ')}) sit in the dorms' empty beds: dorm head counts raise skills such as Mr. Nothing's Worldly Plight.`);
  for (const kind of ['office', 'receptionRoom'] as const) {
    const room = rooms.find(f => f.kind === kind);
    if (room && !e.shifts.some(s => (s.assignments[room.id] ?? []).some(Boolean))) notes.push(`${room.label} stays empty: its Speed bonus is not part of this plan's scored output (LMD, EXP, gold), so no owned operator shows a gain there -- true for every roster, not only this one.`);
  }
  return notes;
}
