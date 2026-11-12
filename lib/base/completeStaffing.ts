import { activeBaseSkills } from './activeBaseSkills';
import { countFeeders } from './countFeeders';
import { operatorDependency } from './dependencyClass';
import { calculateBase } from './calculateBase';
import { simulateBase, type SimulationShift } from './baseSimulation';
import { WORK_KINDS, type OptimizerResult } from './baseOptimizer';
import { scoreOf, type GenomeContext } from './planGenome';
import { MAX_ROTATION_SETUPS, distinctSetups, setupGroups } from './rotationSetups';
import type { FacilityDef, SlotAssignment } from './baseTypes';

const clone = (shifts: SimulationShift[]) => shifts.map(s => ({ ...s, assignments: Object.fromEntries(Object.entries(s.assignments).map(([id, slots]) => [id, [...slots]])) }));

/** An unbuilt operator (Elite 0) loses a production seat to an idle built one when the funded score falls by no
 *  more than this share of itself: the output lost is a hair beside raising an operator the reader has not built. */
export const BUILT_FIRST_MARGIN = 0.005;
const SUPPORT_SKILL_ROOMS = new Set<string>(['receptionRoom', 'office']);
/** Rooms nobody is scheduled to work in: the Workshop waits for a craft the rotation does not invent, and the
 *  Training Room's teaching is outside the score. A seat there is free, so it goes to a count raiser where one is idle. */
const STANDBY_ROOMS = new Set<string>(['workshop', 'trainingRoom']);
/** Every room whose occupant is counted across the base without the room's own work being scored: the seat is worth
 *  taking for what a skill elsewhere counts (countFeeders.ts), so an idle count raiser leads the equally useful. */
const COUNT_SEAT_ROOMS = new Set<string>([...SUPPORT_SKILL_ROOMS, ...STANDBY_ROOMS]);
const PRODUCTION_ROOMS = new Set<string>(['factory', 'tradingPost', 'powerPlant']);
/** The rooms a bed freed by the prune is offered to again: never a production seat the prune just judged worthless. */
const SUPPORT_FILL_KINDS = new Set<string>(['controlCenter', 'powerPlant', 'receptionRoom', 'office']);

/** Complete a production search with real, simulated support shifts. Never displace a
 * production worker, locked resident, dorm specialist or Fiammetta's refill setup.
 * Additional workers rotate only when their recovery supports it; Workshop is a crafting standby only.
 * This is applied to published results, not inside the annealing hot loop.
 *
 * A seat counts across the base wherever it is, so where two candidates do the room equal good the idle one a skill
 * elsewhere counts goes in (`countFeeders.ts`): the Workshop's and Training Room's standby seat, which nothing else
 * in the score cares about, and a tie in the other rooms.
 *
 * Then three refinements, each kept only where the simulated funded score allows: the Reception Room and
 * Office seats the search filled with whichever skilled operator its last move left are given back to the fill,
 * which ranks by the room's own speed and the reader's build (`refineSupport`, off when the search had a scored
 * reason for its choice); an Elite 0 worker in a production room gives way to an idle built operator with a
 * skill there when the score falls by at most BUILT_FIRST_MARGIN; and a Factory or Trading Post worker whose
 * removal does not lower the score is removed, but only when their beds seat more than their leaving opens.
 *
 * Every room but the Training Room ends staffed wherever the rotation can carry it (owner, 2026-11-11; the Training
 * Room's operator depends on the skill being trained, so the plan never picks one without a training target). A
 * seat the fill cannot staff from a free bed goes to a worker of the plan who is off in that shift, or to a new
 * worker in a bed its resident can spare; the Reception Room and Office take an operator without a skill for them
 * last of all, and the plan says so. Never at the cost of an exhausted operator or a lower score. */
export function completeStaffing(plan: OptimizerResult, ctx: GenomeContext, options: { refineSupport?: boolean } = {}): OptimizerResult {
  const { base, roster } = ctx;
  const byName = new Map(base.operators.map(o => [o.name, o]));
  const slot = (name: string): SlotAssignment => ({ operatorName: name, ...roster[name] });
  const dorms = base.facilities.filter(f => f.kind === 'dormitory' && f.capacity);
  const kind = new Map(base.facilities.map(f => [f.id, f.kind]));
  const seatsOf = (name: string) => plan.shifts.flatMap(s => Object.entries(s.assignments).filter(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(x => x?.operatorName === name)).map(([id]) => kind.get(id)!));
  const allWorking = new Set(plan.shifts.flatMap(s => Object.entries(s.assignments).filter(([id]) => kind.get(id) !== 'dormitory').flatMap(([, slots]) => slots.flatMap(s => s ? [s.operatorName] : []))));
  // The search's Reception Room and Office occupants who work nowhere else: the fill chooses those seats afresh,
  // unless the occupant's seat scores (Mulberry in HR lifting a Trading Post, a Rhine Lab operator raising Nasti's
  // count, countFeeders.ts): one by one, an occupant leaves only when the plan scores the same without them.
  const refineSupport = options.refineSupport !== false;
  const supportOnly = refineSupport ? [...allWorking].filter(name => seatsOf(name).every(k => SUPPORT_SKILL_ROOMS.has(k)) && !(plan.shifts.some(s => s.refill?.includes(name)) || name in (plan.initialMorale ?? {}) || (ctx.lockedDorm ?? []).includes(name))).sort() : [];
  const evicted = new Set<string>();
  let shifts = clone(plan.shifts), simulation = plan.simulation;
  for (const name of supportOnly) {
    const trial = clone(shifts);
    for (const s of trial) for (const [id, slots] of Object.entries(s.assignments)) s.assignments[id] = slots.map(x => x?.operatorName === name ? null : x);
    const result = simulateBase({ base, shifts: trial, loginInterval: ctx.loginInterval, initialMorale: plan.initialMorale, refillPolicy: plan.refillPolicy, drones: ctx.drones, droneWeights: ctx.weights, ...(ctx.sustainable ? { droneFunding: { externalGold: ctx.externalGold ?? 0 } } : {}) });
    if (scoreOf(result, ctx) >= scoreOf(simulation, ctx) - 1e-6) { shifts = trial; simulation = result; evicted.add(name); }
  }
  const workingNames = new Set([...allWorking].filter(name => !evicted.has(name)));
  const protectedNames = new Set([...workingNames, ...(ctx.lockedDorm ?? []), ...Object.keys(plan.initialMorale ?? {}), ...plan.shifts.flatMap(s => s.refill ?? []), ...(base.trainingTarget?.operatorName ? [base.trainingTarget.operatorName] : [])]);
  if (plan.shifts.some(s => s.refill?.length)) {
    protectedNames.add('Fiammetta');
    for (const s of plan.shifts) for (const d of dorms) if (s.refill?.length && s.assignments[d.id]?.some(x => x?.operatorName === 'Fiammetta')) {
      for (const resident of s.assignments[d.id]) if (resident) protectedNames.add(resident.operatorName);
    }
  }
  const skills = (name: string, label: string) => activeBaseSkills(byName.get(name)!, label, roster[name].eliteLevel, base.skillSlots, roster[name].level);
  // Preserve residents with actual recovery or cross-room dorm skills. Other idle residents
  // may exchange a bed with a support worker, retaining the head count where possible.
  for (const s of plan.shifts) for (const d of dorms) for (const resident of s.assignments[d.id] ?? []) {
    if (resident && byName.has(resident.operatorName) && roster[resident.operatorName] && skills(resident.operatorName, d.label).length) protectedNames.add(resident.operatorName);
  }
  const available = Object.keys(roster).filter(n => byName.has(n) && !protectedNames.has(n)).sort();
  const assigned = new Set<string>();
  let evaluations = 0;
  const feeders = countFeeders(base, roster);
  const cache = new Map<string, unknown>();
  const simulate = (trial: SimulationShift[]) => simulateBase({
    base, shifts: trial, loginInterval: ctx.loginInterval, initialMorale: plan.initialMorale,
    refillPolicy: plan.refillPolicy, drones: ctx.drones, droneWeights: ctx.weights,
    ...(ctx.sustainable ? { droneFunding: { externalGold: ctx.externalGold ?? 0 } } : {}), rateCache: cache,
  });
  const priority = ['controlCenter', 'powerPlant', 'receptionRoom', 'office', 'tradingPost', 'factory', 'workshop', 'trainingRoom'];
  const rooms = base.facilities.filter(f => f.capacity && (WORK_KINDS.includes(f.kind) || f.kind === 'workshop' || (f.kind === 'trainingRoom' && ctx.base.trainingTarget)))
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind) || a.id.localeCompare(b.id));
  const ranked = new Map<string, { name: string; benefit: number }[]>();
  /** Whether a shift has `name` nowhere at all. A count reads every placed operator, a Dormitory bed included, so a
   *  seat taken for the count's sake pays only where the plan has the operator neither working nor resting. */
  const unseated = (name: string) => shifts.some(s => !Object.values(s.assignments).some(slots => slots.some(x => x?.operatorName === name)));
  function candidates(room: FacilityDef, step: number): string[] {
    const key = `${room.kind}:${room.level}:${plan.shifts[0].factoryProducts[room.id] ?? ''}`;
    if (!ranked.has(key)) {
      const skilled = available.filter(name => skills(name, room.label).length);
      // The Reception Room and Office take only an operator with a skill for the room, or one whose seat raises a
      // base-wide count another's skill reads (countFeeders.ts; seated only where that scores, `fill`); any other
      // body there is never a plan (the search keeps the same rule, annealBase.ts).
      // The Workshop and Training Room take any body, and nothing they do there is scored, so a count raiser is the
      // one ordinary candidate worth more than the next (ranked below, once the plan says who is still unseated).
      const ordinary = SUPPORT_SKILL_ROOMS.has(room.kind) ? available.filter(name => feeders.has(name) && !skilled.includes(name)) : available.filter(name => !skilled.includes(name));
      const ratings = [...skilled, ...ordinary].map(name => {
        const assignments = Object.fromEntries(Object.entries(plan.shifts[0].assignments).map(([id, slots]) => [id, slots.map(s => s?.operatorName === name ? null : s)]));
        assignments[room.id] = [slot(name), ...Array(room.capacity - 1).fill(null)];
        const r = calculateBase({ ...base, assignments, factoryProducts: plan.shifts[0].factoryProducts, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' }).rooms[room.id];
        const benefit = room.kind === 'receptionRoom' ? (r.clueSpeed ?? 0) : room.kind === 'office' ? (r.office?.speed ?? 0) : room.kind === 'powerPlant' ? (r.droneRate ?? 0) : room.kind === 'workshop' ? (r.workshop?.chance ?? 0) : room.kind === 'trainingRoom' ? (r.trainingSpeed ?? 0) : (r.productivity?.yellow ?? 0);
        // The candidate's own drain, skills included: the room-wide rate is the headcount baseline alone, which read
        // 1.00 Morale/h for every Office candidate, Brigid's +1 and Penance's +0.5 unseen.
        return { name, benefit, drain: r.perOperatorMorale?.[name] ?? r.combinedMoraleRate };
      });
      // Equal benefit and drain: the operator the reader has built, so an E0 level 1 copy of a skill never
      // displaces a promoted one (Brigid at E0 over Haruka at E2 in HR was the reader's own complaint).
      const built = (name: string) => ['Base', 'Elite 1', 'Elite 2'].indexOf(roster[name].eliteLevel) * 100 + roster[name].level;
      // Then the operator whose skills need the least from others (docs/development/base-design-notes.md).
      const dependency = (name: string) => operatorDependency(byName.get(name)!, room.label, roster[name].eliteLevel, base.skillSlots, roster[name].level);
      ranked.set(key, ratings.sort((a, b) => b.benefit - a.benefit || a.drain - b.drain || dependency(a.name) - dependency(b.name) || built(b.name) - built(a.name) || a.name.localeCompare(b.name)).map(r => ({ name: r.name, benefit: r.benefit })));
    }
    const open = ranked.get(key)!.filter(r => room.kind === 'workshop' ? !assigned.has(r.name) : !Object.entries(shifts[step].assignments).some(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(s => s?.operatorName === r.name)));
    // Two operators the room gains as much from: the one a skill elsewhere counts, while the plan leaves them out of a
    // shift entirely. Stable and under the room's own benefit, so a crafter still leads the Workshop and drain, the
    // reader's build and the dependency order still decide the rest.
    if (COUNT_SEAT_ROOMS.has(room.kind)) {
      const idle = new Set(open.flatMap(r => feeders.has(r.name) && unseated(r.name) ? [r.name] : []));
      if (idle.size) open.sort((a, b) => b.benefit - a.benefit || (idle.has(a.name) ? 0 : 1) - (idle.has(b.name) ? 0 : 1));
    }
    return open.map(r => r.name);
  }
  function putToRest(trial: SimulationShift[], rest: number, name: string): boolean {
    const a = trial[rest].assignments;
    if (Object.entries(a).some(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(s => s?.operatorName === name))) return false;
    if (dorms.some(d => a[d.id]?.some(s => s?.operatorName === name))) return true;
    // A resident who works anywhere in the rotation is resting for that work, whichever step seated them (the
    // built-first swap hands an idle operator the whole schedule of the worker they replace, beds included, after
    // `protectedNames` was taken): evicting them runs them out of Morale and the fill is refused.
    const working = new Set(trial.flatMap(s => Object.entries(s.assignments).flatMap(([id, slots]) => kind.get(id) === 'dormitory' ? [] : slots.flatMap(x => x ? [x.operatorName] : []))));
    for (const replace of [false, true]) for (const d of dorms) {
      // Do not seat someone ahead of, or alongside, Fiammetta's refill target.
      if (a[d.id]?.some(s => s?.operatorName === 'Fiammetta') && trial[rest].refill?.length) continue;
      const slots = a[d.id] ?? Array(d.capacity).fill(null);
      const at = slots.findIndex(s => !s || (replace && !protectedNames.has(s.operatorName) && !assigned.has(s.operatorName) && !working.has(s.operatorName)));
      if (at >= 0) { a[d.id] = slots.map((s, i) => i === at ? slot(name) : s); return true; }
    }
    return false;
  }
  // ---------------------------------------------------------------- refinements, before the fill
  const scoreNow = () => scoreOf(simulation, ctx);
  const sound = (result: ReturnType<typeof simulate>) => result.periodic && !result.events.some(e => e.kind === 'exhausted') && !result.warnings.some(w => / twice\.$/.test(w));
  /** A changed rotation, kept when it simulates soundly within the presets and scores at least `floor`. */
  const keepIf = (trial: SimulationShift[], floor: number): boolean => {
    if (distinctSetups(trial) > MAX_ROTATION_SETUPS) return false;
    const result = simulate(trial); evaluations += result.evaluations;
    if (!sound(result) || scoreOf(result, ctx) < floor) return false;
    shifts = trial; simulation = result;
    return true;
  };
  const placedNames = () => new Set(shifts.flatMap(s => Object.values(s.assignments).flatMap(slots => slots.flatMap(x => x ? [x.operatorName] : []))));
  const untouchable = new Set([...(ctx.lockedDorm ?? []), ...Object.keys(plan.initialMorale ?? {}), ...plan.shifts.flatMap(s => s.refill ?? []), ...(plan.shifts.some(s => s.refill?.length) ? ['Fiammetta'] : [])]);
  const production = base.facilities.filter(f => f.capacity && PRODUCTION_ROOMS.has(f.kind));

  // Built first: an Elite 0 worker in a production room gives their whole schedule (work and rest) to an idle built
  // operator with a skill for the room, when the funded score keeps within the margin.
  const builtSwaps: string[] = [];
  for (const room of production) {
    // A robot (rarity 1) has no promotion: Elite 0 is its whole build, never a worker to replace.
    const unbuilt = [...new Set(shifts.flatMap(s => (s.assignments[room.id] ?? []).flatMap(x => x && roster[x.operatorName]?.eliteLevel === 'Base' && byName.get(x.operatorName)?.rarity !== 1 && !untouchable.has(x.operatorName) ? [x.operatorName] : [])))];
    for (const name of unbuilt) {
      const placed = placedNames();
      // Idle built operators in the fill's own order for the room (what each brings to it, then drain, dependency,
      // build), so the strongest is tried first rather than the most promoted.
      const idleBuilt = candidates(room, 0).filter(n => !placed.has(n) && roster[n].eliteLevel !== 'Base' && !untouchable.has(n) && skills(n, room.label).length);
      const floor = scoreNow() * (1 - BUILT_FIRST_MARGIN);
      for (const candidate of idleBuilt.slice(0, 6)) {
        const trial = clone(shifts);
        for (const s of trial) for (const [id, slots] of Object.entries(s.assignments)) s.assignments[id] = slots.map(x => x?.operatorName === name ? slot(candidate) : x);
        if (keepIf(trial, floor)) { builtSwaps.push(`${candidate} for ${name} in ${room.label}`); break; }
      }
    }
  }
  // Shifts with the same setup are one saved preset in the game. A fill goes into every shift of its group and
  // the worker rests in every shift of another group, so the groups stay identical and the rotation needs no
  // more presets than it did; failing that, shift by shift, as long as the rotation still fits the presets.
  const countSeats: string[] = [];
  const groups = setupGroups(plan.shifts);
  const cycleAfter = (from: number, steps: number[]) => [...steps].sort((x, y) => (x - from - 1 + shifts.length) % shifts.length - (y - from - 1 + shifts.length) % shifts.length);
  /** One worker into `into` (the shifts of one setup) at a room's place, resting in every step of `rest`. */
  function tryFill(room: FacilityDef, index: number, into: number[], rest: number[] | null, name: string): boolean {
    const trial = clone(shifts);
    // Workshop spends Morale per craft; no craft is invented by a rotation.
    for (const shift of room.kind === 'workshop' ? trial : into.map(i => trial[i])) {
      const a = shift.assignments;
      for (const d of dorms) a[d.id] = (a[d.id] ?? Array(d.capacity).fill(null)).map(s => s?.operatorName === name ? null : s);
      const slots = a[room.id] ?? Array(room.capacity).fill(null);
      a[room.id] = Array.from({ length: room.capacity }, (_, i) => i === index && !slots[i] ? slot(name) : slots[i] ?? null);
    }
    if (rest && !rest.every(i => putToRest(trial, i, name))) return false;
    if (distinctSetups(trial) > MAX_ROTATION_SETUPS) return false;
    const result = simulate(trial); evaluations += result.evaluations;
    if (!result.periodic || result.events.some(e => e.kind === 'exhausted') || result.warnings.some(w => / twice\.$/.test(w))) return false;
    // Someone without a skill for the room is there for the count alone. A Reception Room or Office seat is a real
    // choice, so it must raise the score; the Workshop and Training Room are staffed as a standby whatever happens,
    // so there the seat must only not cost anything (a count can be one a skill wants kept low).
    if (!skills(name, room.label).length) {
      const score = scoreOf(result, ctx);
      if (SUPPORT_SKILL_ROOMS.has(room.kind) && !(score > scoreNow() + 1e-6)) return false;
      if (STANDBY_ROOMS.has(room.kind) && score < scoreNow() - 1e-6) return false;
      // Only say a seat is counted where the score says so: a count raiser whose reader the plan never places, or
      // whose count is already at its cap, is in the standby room as a tie, and the note would be telling the reader
      // to keep someone there for nothing.
      if (COUNT_SEAT_ROOMS.has(room.kind) && feeders.has(name) && score > scoreNow() + 1e-6) countSeats.push(`${name} in ${room.label}`);
    }
    shifts = trial; simulation = result; assigned.add(name);
    return true;
  }
  /** Every open seat of `toFill`, a setup group at a time, then shift by shift. */
  const fill = (toFill: FacilityDef[]) => { for (const room of toFill) for (const group of groups) for (let index = 0; index < room.capacity; index++) {
    if (!shifts[group[0]].assignments[room.id]?.[index]) {
      // A bounded shortlist keeps an intermediate result responsive. Lower-ranked ordinary
      // staff are useful fallbacks when a specialist's Morale cost is unsustainable. Rest groups come in the
      // order they follow this group in the cycle.
      const after = (g: number[]) => (g[0] - group[group.length - 1] - 1 + shifts.length) % shifts.length;
      const rests: (number[] | null)[] = room.kind === 'workshop' ? [null] : groups.filter(g => g !== group).sort((x, y) => after(x) - after(y));
      candidates(room, group[0]).slice(0, 12).some(name => rests.some(rest => tryFill(room, index, group, rest, name)));
    }
    // Shift by shift otherwise (a seed whose shifts are all alike has no other group to rest in).
    for (const step of group) {
      if (shifts[step].assignments[room.id]?.[index]) continue;
      const rests: (number[] | null)[] = room.kind === 'workshop' ? [null] : cycleAfter(step, shifts.map((_, i) => i).filter(i => i !== step)).map(i => [i]);
      candidates(room, step).slice(0, 12).some(name => rests.some(rest => tryFill(room, index, [step], rest, name)));
    }
  } };
  fill(rooms);
  // ---------------------------------------------------------------- every seat filled
  // What the fill above leaves open, it leaves for want of a bed: its worker is new to the plan and must rest in a
  // free bed of another shift. Two more ways to a full room, each kept only when the rotation stays sound, within
  // the presets and scores no lower: a worker of the plan who is neither working nor resting in that shift takes the
  // seat (no bed needed), and a new worker takes one of the beds of a resident who rests more than once a cycle.
  // The Training Room is never part of this: who teaches there depends on the skill being trained.
  const plainSupport: string[] = [];
  const built = (name: string) => ['Base', 'Elite 1', 'Elite 2'].indexOf(roster[name].eliteLevel) * 100 + roster[name].level;
  const seated = (trial: SimulationShift[], room: FacilityDef, index: number, step: number, name: string) => {
    const slots = trial[step].assignments[room.id] ?? [];
    trial[step].assignments[room.id] = Array.from({ length: room.capacity }, (_, i) => i === index ? slot(name) : slots[i] ?? null);
    return trial;
  };
  const accept = (trial: SimulationShift[], room: FacilityDef, name: string) => {
    if (!keepIf(trial, scoreNow() - 1e-6)) return false;
    assigned.add(name);
    if (SUPPORT_SKILL_ROOMS.has(room.kind) && !skills(name, room.label).length && !plainSupport.includes(`${name} in ${room.label}`)) plainSupport.push(`${name} in ${room.label}`);
    return true;
  };
  /** Who may take the room: its skilled first; the Reception Room and Office take anyone else only when `anyone`. */
  const eligible = (names: string[], room: FacilityDef, anyone: boolean) => {
    const skilled = names.filter(n => skills(n, room.label).length), rest = names.filter(n => !skilled.includes(n));
    return SUPPORT_SKILL_ROOMS.has(room.kind) && !anyone ? skilled : [...skilled, ...rest];
  };
  function seatIdleWorker(room: FacilityDef, index: number, step: number, anyone: boolean): boolean {
    const inShift = new Set(Object.values(shifts[step].assignments).flatMap(slots => slots.flatMap(x => x ? [x.operatorName] : [])));
    const workers = [...new Set(shifts.flatMap(s => Object.entries(s.assignments).flatMap(([id, slots]) => kind.get(id) === 'dormitory' ? [] : slots.flatMap(x => x ? [x.operatorName] : []))))];
    const pool = workers.filter(n => !inShift.has(n) && !untouchable.has(n) && byName.has(n) && roster[n] && n !== base.trainingTarget?.operatorName).sort((x, y) => built(y) - built(x) || x.localeCompare(y));
    return eligible(pool, room, anyone).slice(0, 8).some(name => accept(seated(clone(shifts), room, index, step, name), room, name));
  }
  function seatWithSharedBed(room: FacilityDef, index: number, step: number, anyone: boolean): boolean {
    const placed = placedNames();
    const ranked = candidates(room, step).filter(n => !placed.has(n));
    const others = anyone ? available.filter(n => !placed.has(n) && !ranked.includes(n)).sort((x, y) => built(y) - built(x) || x.localeCompare(y)) : [];
    const rests = cycleAfter(step, shifts.map((_, i) => i).filter(i => i !== step));
    for (const name of eligible([...ranked, ...others], room, anyone).slice(0, 4)) for (const rest of rests) {
      const free = seated(clone(shifts), room, index, step, name);
      if (putToRest(free, rest, name) && accept(free, room, name)) return true;
      const restCount = (n: string) => shifts.filter(s => dorms.some(d => s.assignments[d.id]?.some(x => x?.operatorName === n))).length;
      for (const d of dorms) {
        if (shifts[rest].refill?.length && shifts[rest].assignments[d.id]?.some(x => x?.operatorName === 'Fiammetta')) continue;
        for (const [at, resident] of (shifts[rest].assignments[d.id] ?? []).entries()) {
          if (!resident || untouchable.has(resident.operatorName) || restCount(resident.operatorName) < 2) continue;
          const trial = seated(clone(shifts), room, index, step, name);
          trial[rest].assignments[d.id] = trial[rest].assignments[d.id].map((x, i) => i === at ? slot(name) : x);
          if (accept(trial, room, name)) return true;
        }
      }
    }
    return false;
  }
  const fillRest = (anyone: boolean) => { for (const room of rooms) {
    if (STANDBY_ROOMS.has(room.kind) || (anyone && !SUPPORT_SKILL_ROOMS.has(room.kind))) continue;
    for (let step = 0; step < shifts.length; step++) for (let index = 0; index < room.capacity; index++) {
      if (!shifts[step].assignments[room.id]?.[index]) { if (!seatIdleWorker(room, index, step, anyone)) seatWithSharedBed(room, index, step, anyone); }
    }
  } };
  // The room's own skilled staff everywhere first; an operator without a skill for the Reception Room or Office only
  // where nobody skilled could be seated (the room's base speed still runs, and the seat is not left open).
  const fillEverySeat = () => { fillRest(false); fillRest(true); };
  const emptySeats = () => rooms.filter(r => r.kind !== 'trainingRoom').reduce((sum, room) => sum + shifts.reduce((n, s) => n + room.capacity - (s.assignments[room.id] ?? []).filter(Boolean).length, 0), 0);
  // ---------------------------------------------------------------- refinements, after the fill
  // The prune below empties seats, and its freed beds can seat the support rooms. Both ways are completed, with and
  // without it, and the one with fewer open seats is kept (then the higher score; a tie keeps every worker).
  const unpruned = { shifts, simulation, assigned: [...assigned], countSeats: countSeats.length, plainSupport: plainSupport.length };
  fillEverySeat();
  const whole = { shifts, simulation, assigned: [...assigned], countSeats: [...countSeats], plainSupport: [...plainSupport], empty: emptySeats() };
  shifts = unpruned.shifts; simulation = unpruned.simulation;
  assigned.clear(); for (const name of unpruned.assigned) assigned.add(name);
  countSeats.length = unpruned.countSeats; plainSupport.length = unpruned.plainSupport;
  // ---------------------------------------------------------------- refinements, after the fill
  // Prune: a Factory or Trading Post worker whose removal from the room (in every shift) leaves the funded score
  // where it is: what they add is output the base cannot fund (gold no post sells, orders no gold fills). Power
  // Plant workers are never judged this way: drone charge has uses the score does not count.
  const pruned: string[] = [];
  for (const room of production.filter(f => f.kind !== 'powerPlant')) {
    const workers = [...new Set(shifts.flatMap(s => (s.assignments[room.id] ?? []).flatMap(x => x && !untouchable.has(x.operatorName) ? [x.operatorName] : [])))];
    for (const name of workers) {
      const trial = clone(shifts);
      for (const s of trial) s.assignments[room.id] = (s.assignments[room.id] ?? []).map(x => x?.operatorName === name ? null : x);
      if (keepIf(trial, scoreNow() - 1e-6)) pruned.push(`${name} from ${room.label}`);
    }
  }
  // A pruned worker no longer needs their beds. Freed beds go back to the fill for the support rooms (the Control
  // Center, Power Plants, Reception Room and Office are last in no bed's line otherwise); a pruned operator whose
  // Dormitory skill still serves their roommates keeps the bed, as does anyone the rotation protects.
  // (A parked Morale, `initialMorale`, protects a worker from the built-first swap, not a bed nobody works for any more.)
  const keepsBed = new Set([...(ctx.lockedDorm ?? []), ...plan.shifts.flatMap(s => s.refill ?? []), ...(plan.shifts.some(s => s.refill?.length) ? ['Fiammetta'] : [])]);
  const prunedNames = pruned.map(p => p.split(' from ')[0]).filter(name => !keepsBed.has(name) && !skills(name, 'Dormitory').length && !shifts.some(s => Object.entries(s.assignments).some(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(x => x?.operatorName === name))));
  if (prunedNames.length) {
    const before = { shifts, simulation, assigned: assigned.size };
    const trial = clone(shifts);
    for (const s of trial) for (const d of dorms) s.assignments[d.id] = (s.assignments[d.id] ?? []).map(x => x && prunedNames.includes(x.operatorName) ? null : x);
    // A bed can count for a skill (a Dormitory headcount), so leaving it costs a hair of output: allowed within the
    // built-first margin, and only when the fill then seats someone in the freed bed; otherwise the resident stays.
    if (keepIf(trial, scoreNow() * (1 - BUILT_FIRST_MARGIN))) {
      fill(rooms.filter(r => SUPPORT_FILL_KINDS.has(r.kind)));
      if (assigned.size === before.assigned) { shifts = before.shifts; simulation = before.simulation; }
    }
  }
  fillEverySeat();
  if (whole.empty < emptySeats() || (whole.empty === emptySeats() && scoreOf(whole.simulation, ctx) >= scoreNow() - 1e-6)) {
    shifts = whole.shifts; simulation = whole.simulation; pruned.length = 0;
    assigned.clear(); for (const name of whole.assigned) assigned.add(name);
    countSeats.splice(0, countSeats.length, ...whole.countSeats); plainSupport.splice(0, plainSupport.length, ...whole.plainSupport);
  }

  // Present the actual completed staffing as one template per change. Never leave old
  // crew/schedule metadata referring to a different rotation than the saved shifts.
  const crews = shifts.map(s => Object.fromEntries(Object.entries(s.assignments).filter(([id]) => kind.get(id) !== 'dormitory')));
  const schedule = shifts.map((s, step) => {
    const resting = new Set(dorms.flatMap(d => (s.assignments[d.id] ?? []).flatMap(s => s ? [s.operatorName] : [])));
    return { hour: plan.schedule[step].hour, crewIn: [{ crew: step, rooms: Object.keys(crews[step]) }],
      resting: crews.flatMap((crew, index) => index === step ? [] : [{ crew: index, rooms: Object.entries(crew).filter(([, slots]) => slots.some(s => s && resting.has(s.operatorName))).map(([id]) => id) }]).filter(c => c.rooms.length) };
  });
  const notes = plan.notes.filter(n => !n.includes('stays empty: its Speed bonus'));
  if (assigned.size) notes.push('Open work slots are filled from the remaining roster, with recovery checked across the full rotation. Displayed production includes these staff.');
  // A room whose storage fills before the next login wastes production (docs/development/base-design-notes.md):
  // name it, so the reader can swap a capacity-raising skill in or log in sooner.
  const capped = Object.entries(simulation.rooms).filter(([, r]) => r.idleFullHours > 0.5).map(([id, r]) => `${base.facilities.find(f => f.id === id)?.label ?? id} ${r.idleFullHours.toFixed(1)} h a day`);
  if (capped.length) notes.push(`Storage full before a login: ${capped.join('; ')}. Capacity-raising skills (Vulcan, Bena, Scavenger, Myrtle's order limit) stop the waste; so do more logins.`);
  if (builtSwaps.length) notes.push(`Built operators first: ${builtSwaps.join('; ')} (an Elite 0 worker gives way to an idle built one when the funded output keeps within ${BUILT_FIRST_MARGIN * 100}%).`);
  if (pruned.length) notes.push(`Left out as adding nothing to the funded output (gold no post sells, orders no gold fills): ${pruned.join('; ')}.`);
  if (countSeats.length) notes.push(`Seated to be counted in the base, not for the room's own work: ${countSeats.join('; ')}. A skill elsewhere counts how many of their faction or group are in the base, and a Dormitory bed counts the same, so this seat is worth it only while they have no bed.`);
  if (plainSupport.length) notes.push(`Seated so the room is not left open, without a skill for it: ${plainSupport.join('; ')}. The room runs at its base speed; nobody with a skill for it could be rested in this rotation.`);
  if (rooms.some(r => r.kind === 'workshop')) notes.push('Workshop staff are a crafting standby; choose the crafter for your recipe. Crafting and its Morale costs are not scheduled; swap crafters and rest them after crafting.');
  if (!base.trainingTarget && base.facilities.some(f => f.kind === 'trainingRoom' && f.capacity)) notes.push('Training Room needs a training target; no mastery task is assumed.');
  // The usual reason on a full roster (19 of 21 Krooster profiles, 2026-11-05): no bed is free in any shift.
  const bedsFull = dorms.length > 0 && shifts.every(s => dorms.every(d => (s.assignments[d.id] ?? []).filter(Boolean).length >= d.capacity));
  for (const room of rooms) {
    const missing = shifts.flatMap((s, i) => (s.assignments[room.id] ?? []).filter(Boolean).length < room.capacity ? [i + 1] : []);
    if (!missing.length) continue;
    // A support room the production crews' beds left unstaffed: the reader can still run it by hand, so name
    // the skilled operators the plan leaves idle (the fill's own order), rather than only reporting the gap.
    const byHand = SUPPORT_SKILL_ROOMS.has(room.kind) ? candidates(room, missing[0] - 1).filter(name => skills(name, room.label).length && !shifts.some(s => Object.values(s.assignments).some(slots => slots.some(x => x?.operatorName === name)))).slice(0, 3) : [];
    if (SUPPORT_SKILL_ROOMS.has(room.kind) && !Object.keys(roster).some(name => byName.has(name) && skills(name, room.label).length) && shifts.every(s => !s.assignments[room.id]?.some(Boolean))) { notes.push(`${room.label}: left empty, nobody in the roster has a skill for it (an operator without one adds nothing there).`); continue; }
    notes.push(`${room.label}: not fully staffed in shift${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. No safe assignment was found from the remaining roster and recovery beds.${bedsFull ? ' Every Dormitory bed is in use in every shift, so a worker here would take a bed this plan rests someone in.' : ''}${byHand.length ? ` To staff it by hand, with their own rests: ${byHand.join(', ')}.` : ''}`);
  }
  return { ...plan, shifts, simulation, crews, schedule, score: scoreOf(simulation, ctx), explanations: [], notes, evaluations: plan.evaluations + evaluations };
}
