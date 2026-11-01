import { activeBaseSkills } from './activeBaseSkills';
import { calculateBase } from './calculateBase';
import { simulateBase, type SimulationShift } from './baseSimulation';
import { WORK_KINDS, type OptimizerResult } from './baseOptimizer';
import { scoreOf, type GenomeContext } from './planGenome';
import type { FacilityDef, SlotAssignment } from './baseTypes';

const clone = (shifts: SimulationShift[]) => shifts.map(s => ({ ...s, assignments: Object.fromEntries(Object.entries(s.assignments).map(([id, slots]) => [id, [...slots]])) }));

/** Complete a production search with real, simulated support shifts. Never displace a
 * production worker, locked resident, dorm specialist or Fiammetta's refill setup.
 * Additional workers rotate only when their recovery supports it; Workshop is a crafting standby only.
 * This is applied to published results, not inside the annealing hot loop. */
export function completeStaffing(plan: OptimizerResult, ctx: GenomeContext): OptimizerResult {
  const { base, roster } = ctx;
  const byName = new Map(base.operators.map(o => [o.name, o]));
  const slot = (name: string): SlotAssignment => ({ operatorName: name, ...roster[name] });
  const dorms = base.facilities.filter(f => f.kind === 'dormitory' && f.capacity);
  const kind = new Map(base.facilities.map(f => [f.id, f.kind]));
  const workingNames = new Set(plan.shifts.flatMap(s => Object.entries(s.assignments).filter(([id]) => kind.get(id) !== 'dormitory').flatMap(([, slots]) => slots.flatMap(s => s ? [s.operatorName] : []))));
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
      const ordinary = available.filter(name => !skilled.includes(name));
      const ratings = [...skilled, ...ordinary].map(name => {
        const assignments = Object.fromEntries(Object.entries(plan.shifts[0].assignments).map(([id, slots]) => [id, slots.map(s => s?.operatorName === name ? null : s)]));
        assignments[room.id] = [slot(name), ...Array(room.capacity - 1).fill(null)];
        const r = calculateBase({ ...base, assignments, factoryProducts: plan.shifts[0].factoryProducts, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' }).rooms[room.id];
        const benefit = room.kind === 'receptionRoom' ? (r.clueSpeed ?? 0) : room.kind === 'office' ? (r.office?.speed ?? 0) : room.kind === 'powerPlant' ? (r.droneRate ?? 0) : room.kind === 'workshop' ? (r.workshop?.chance ?? 0) : room.kind === 'trainingRoom' ? (r.trainingSpeed ?? 0) : (r.productivity?.yellow ?? 0);
        return { name, benefit, drain: r.combinedMoraleRate };
      });
      ranked.set(key, ratings.sort((a, b) => b.benefit - a.benefit || a.drain - b.drain || a.name.localeCompare(b.name)).map(r => r.name));
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
  for (const room of rooms) for (let step = 0; step < shifts.length; step++) for (let index = 0; index < room.capacity; index++) {
    if (shifts[step].assignments[room.id]?.[index]) continue;
    // A bounded shortlist keeps an intermediate result responsive. Lower-ranked ordinary
    // staff are useful fallbacks when a specialist's Morale cost is unsustainable.
    const choices = candidates(room, step).slice(0, 12);
    let filled = false;
    for (const name of choices) {
      // Workshop spends Morale per craft; no craft is invented by a rotation.
      const rests = room.kind === 'workshop' ? [-1] : Array.from({ length: shifts.length - 1 }, (_, offset) => (step + 1 + offset) % shifts.length);
      for (const rest of rests) {
        const trial = clone(shifts);
        for (const shift of room.kind === 'workshop' ? trial : [trial[step]]) {
          const a = shift.assignments;
          for (const d of dorms) a[d.id] = (a[d.id] ?? Array(d.capacity).fill(null)).map(s => s?.operatorName === name ? null : s);
          const slots = a[room.id] ?? Array(room.capacity).fill(null);
          a[room.id] = Array.from({ length: room.capacity }, (_, i) => i === index && !slots[i] ? slot(name) : slots[i] ?? null);
        }
        if (rest >= 0 && !putToRest(trial, rest, name)) continue;
        const result = simulate(trial); evaluations += result.evaluations;
        if (!result.periodic || result.events.some(e => e.kind === 'exhausted') || result.warnings.some(w => / twice\.$/.test(w))) continue;
        shifts = trial; simulation = result; assigned.add(name); filled = true; break;
      }
      if (filled) break;
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
  if (rooms.some(r => r.kind === 'workshop')) notes.push('Workshop staff are a crafting standby; choose the crafter for your recipe. Crafting and its Morale costs are not scheduled; swap crafters and rest them after crafting.');
  if (!base.trainingTarget && base.facilities.some(f => f.kind === 'trainingRoom' && f.capacity)) notes.push('Training Room needs a training target; no mastery task is assumed.');
  for (const room of rooms) {
    const missing = shifts.flatMap((s, i) => (s.assignments[room.id] ?? []).filter(Boolean).length < room.capacity ? [i + 1] : []);
    if (missing.length) notes.push(`${room.label}: not fully staffed in shift${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. No safe assignment was found from the remaining roster and recovery beds.`);
  }
  return { ...plan, shifts, simulation, crews, schedule, score: scoreOf(simulation, ctx), explanations: [], notes, evaluations: plan.evaluations + evaluations };
}
