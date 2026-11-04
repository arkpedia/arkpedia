import { activeBaseSkills } from './activeBaseSkills';
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
const PRODUCTION_ROOMS = new Set<string>(['factory', 'tradingPost', 'powerPlant']);

/** Complete a production search with real, simulated support shifts. Never displace a
 * production worker, locked resident, dorm specialist or Fiammetta's refill setup.
 * Additional workers rotate only when their recovery supports it; Workshop is a crafting standby only.
 * This is applied to published results, not inside the annealing hot loop.
 *
 * Then three refinements, each kept only where the simulated funded score allows: the Reception Room and
 * Office seats the search filled with whichever skilled operator its last move left are given back to the fill,
 * which ranks by the room's own speed and the reader's build (`refineSupport`, off when the search had a scored
 * reason for its choice); an Elite 0 worker in a production room gives way to an idle built operator with a
 * skill there when the score falls by at most BUILT_FIRST_MARGIN; and a Factory or Trading Post worker whose
 * removal does not lower the score is removed. */
export function completeStaffing(plan: OptimizerResult, ctx: GenomeContext, options: { refineSupport?: boolean } = {}): OptimizerResult {
  const { base, roster } = ctx;
  const byName = new Map(base.operators.map(o => [o.name, o]));
  const slot = (name: string): SlotAssignment => ({ operatorName: name, ...roster[name] });
  const dorms = base.facilities.filter(f => f.kind === 'dormitory' && f.capacity);
  const kind = new Map(base.facilities.map(f => [f.id, f.kind]));
  const seatsOf = (name: string) => plan.shifts.flatMap(s => Object.entries(s.assignments).filter(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(x => x?.operatorName === name)).map(([id]) => kind.get(id)!));
  const allWorking = new Set(plan.shifts.flatMap(s => Object.entries(s.assignments).filter(([id]) => kind.get(id) !== 'dormitory').flatMap(([, slots]) => slots.flatMap(s => s ? [s.operatorName] : []))));
  // The search's Reception Room and Office occupants who work nowhere else: the fill chooses those seats afresh.
  const refineSupport = options.refineSupport !== false;
  const evicted = new Set(refineSupport ? [...allWorking].filter(name => seatsOf(name).every(k => SUPPORT_SKILL_ROOMS.has(k)) && !(plan.shifts.some(s => s.refill?.includes(name)) || name in (plan.initialMorale ?? {}) || (ctx.lockedDorm ?? []).includes(name))) : []);
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
  let shifts = clone(plan.shifts), simulation = plan.simulation;
  let evaluations = 0;
  if (evicted.size) {
    for (const s of shifts) for (const [id, slots] of Object.entries(s.assignments)) s.assignments[id] = slots.map(x => x && evicted.has(x.operatorName) ? null : x);
    simulation = simulateBase({ base, shifts, loginInterval: ctx.loginInterval, initialMorale: plan.initialMorale, refillPolicy: plan.refillPolicy, drones: ctx.drones, droneWeights: ctx.weights, ...(ctx.sustainable ? { droneFunding: { externalGold: ctx.externalGold ?? 0 } } : {}) });
  }
  const cache = new Map<string, unknown>();
  const simulate = (trial: SimulationShift[]) => simulateBase({
    base, shifts: trial, loginInterval: ctx.loginInterval, initialMorale: plan.initialMorale,
    refillPolicy: plan.refillPolicy, drones: ctx.drones, droneWeights: ctx.weights,
    ...(ctx.sustainable ? { droneFunding: { externalGold: ctx.externalGold ?? 0 } } : {}), rateCache: cache,
  });
  const priority = ['controlCenter', 'powerPlant', 'receptionRoom', 'office', 'tradingPost', 'factory', 'workshop', 'trainingRoom'];
  const rooms = base.facilities.filter(f => f.capacity && (WORK_KINDS.includes(f.kind) || f.kind === 'workshop' || (f.kind === 'trainingRoom' && ctx.base.trainingTarget)))
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind) || a.id.localeCompare(b.id));
  const ranked = new Map<string, string[]>();
  function candidates(room: FacilityDef, step: number): string[] {
    const key = `${room.kind}:${room.level}:${plan.shifts[0].factoryProducts[room.id] ?? ''}`;
    if (!ranked.has(key)) {
      const skilled = available.filter(name => skills(name, room.label).length);
      // The Reception Room and Office take only an operator with a skill for the room; an unskilled body there
      // is never a plan (the search keeps the same rule, annealBase.ts).
      const ordinary = SUPPORT_SKILL_ROOMS.has(room.kind) ? [] : available.filter(name => !skilled.includes(name));
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
      ranked.set(key, ratings.sort((a, b) => b.benefit - a.benefit || a.drain - b.drain || built(b.name) - built(a.name) || a.name.localeCompare(b.name)).map(r => r.name));
    }
    return ranked.get(key)!.filter(n => room.kind === 'workshop' ? !assigned.has(n) : !Object.entries(shifts[step].assignments).some(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(s => s?.operatorName === n)));
  }
  function putToRest(trial: SimulationShift[], rest: number, name: string): boolean {
    const a = trial[rest].assignments;
    if (Object.entries(a).some(([id, slots]) => kind.get(id) !== 'dormitory' && slots.some(s => s?.operatorName === name))) return false;
    if (dorms.some(d => a[d.id]?.some(s => s?.operatorName === name))) return true;
    for (const replace of [false, true]) for (const d of dorms) {
      // Do not seat someone ahead of, or alongside, Fiammetta's refill target.
      if (a[d.id]?.some(s => s?.operatorName === 'Fiammetta') && trial[rest].refill?.length) continue;
      const slots = a[d.id] ?? Array(d.capacity).fill(null);
      const at = slots.findIndex(s => !s || (replace && !protectedNames.has(s.operatorName) && !assigned.has(s.operatorName)));
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
  const built = (name: string) => ['Base', 'Elite 1', 'Elite 2'].indexOf(roster[name].eliteLevel) * 100 + roster[name].level;
  const production = base.facilities.filter(f => f.capacity && PRODUCTION_ROOMS.has(f.kind));

  // Built first: an Elite 0 worker in a production room gives their whole schedule (work and rest) to an idle built
  // operator with a skill for the room, when the funded score keeps within the margin.
  const builtSwaps: string[] = [];
  for (const room of production) {
    const unbuilt = [...new Set(shifts.flatMap(s => (s.assignments[room.id] ?? []).flatMap(x => x && roster[x.operatorName]?.eliteLevel === 'Base' && !untouchable.has(x.operatorName) ? [x.operatorName] : [])))];
    for (const name of unbuilt) {
      const placed = placedNames();
      const idleBuilt = Object.keys(roster).filter(n => byName.has(n) && !placed.has(n) && roster[n].eliteLevel !== 'Base' && !untouchable.has(n) && skills(n, room.label).length).sort((a, b) => built(b) - built(a) || a.localeCompare(b));
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
    shifts = trial; simulation = result; assigned.add(name);
    return true;
  }
  for (const room of rooms) for (const group of groups) for (let index = 0; index < room.capacity; index++) {
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
  }
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
  if (builtSwaps.length) notes.push(`Built operators first: ${builtSwaps.join('; ')} (an Elite 0 worker gives way to an idle built one when the funded output keeps within ${BUILT_FIRST_MARGIN * 100}%).`);
  if (pruned.length) notes.push(`Left out as adding nothing to the funded output (gold no post sells, orders no gold fills): ${pruned.join('; ')}.`);
  if (rooms.some(r => r.kind === 'workshop')) notes.push('Workshop staff are a crafting standby; choose the crafter for your recipe. Crafting and its Morale costs are not scheduled; swap crafters and rest them after crafting.');
  if (!base.trainingTarget && base.facilities.some(f => f.kind === 'trainingRoom' && f.capacity)) notes.push('Training Room needs a training target; no mastery task is assumed.');
  for (const room of rooms) {
    const missing = shifts.flatMap((s, i) => (s.assignments[room.id] ?? []).filter(Boolean).length < room.capacity ? [i + 1] : []);
    if (!missing.length) continue;
    // A support room the production crews' beds left unstaffed: the reader can still run it by hand, so name
    // the skilled operators the plan leaves idle (the fill's own order), rather than only reporting the gap.
    const byHand = SUPPORT_SKILL_ROOMS.has(room.kind) ? candidates(room, missing[0] - 1).filter(name => skills(name, room.label).length && !shifts.some(s => Object.values(s.assignments).some(slots => slots.some(x => x?.operatorName === name)))).slice(0, 3) : [];
    if (SUPPORT_SKILL_ROOMS.has(room.kind) && !Object.keys(roster).some(name => byName.has(name) && skills(name, room.label).length)) { notes.push(`${room.label}: left empty, nobody in the roster has a skill for it (an operator without one adds nothing there).`); continue; }
    notes.push(`${room.label}: not fully staffed in shift${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. No safe assignment was found from the remaining roster and recovery beds.${byHand.length ? ` To staff it by hand, with their own rests: ${byHand.join(', ')}.` : ''}`);
  }
  return { ...plan, shifts, simulation, crews, schedule, score: scoreOf(simulation, ctx), explanations: [], notes, evaluations: plan.evaluations + evaluations };
}
