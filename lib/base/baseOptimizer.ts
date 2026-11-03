import { calculateBase } from './calculateBase';
import { MAX_ROTATION_SETUPS, exceedsSetups } from './rotationSetups';
import { activeBaseSkills, cleanSkillName } from './activeBaseSkills';
import { simulateBase, dronesPerHour, droneTargets, allocateDrones, type DailyOutput, type SimulationBase, type SimulationResult, type SimulationShift } from './baseSimulation';
import type { BaseAssignments, FacilityDef, FacilityKind, FactoryProducts, SlotAssignment } from './baseTypes';

/**
 * Proposes base staffing and a rotation for an imported roster.
 *
 * The search is a heuristic; the scoring is not. Teams are built greedily with
 * the snapshot calculator (cheap, cross-room aware), then every candidate
 * rotation is scored by the chronological simulator, which is what decides:
 * exhaustion, storage between logins and dorm recovery all count there.
 * See docs/development/base-optimizer.md.
 */

/** What the import says about one owned operator. */
export interface OwnedOperator { eliteLevel: 'Base' | 'Elite 1' | 'Elite 2'; level: number }

/** Value of one unit of each output, in LMD. */
export interface OptimizerWeights { lmd: number; exp: number; goldMade: number }
/** One EXP counts as one LMD; one Precious Metal as the 500 LMD it sells for. */
export const DEFAULT_WEIGHTS: OptimizerWeights = { lmd: 1, exp: 1, goldMade: 500 };

export interface OptimizerInput {
  base: SimulationBase;
  roster: Record<string, OwnedOperator>;
  loginInterval: number;
  factoryProducts: FactoryProducts;
  weights?: OptimizerWeights;
  /** Accept rotations where a worker reaches 0 Morale, if they still produce more. Default false. */
  allowExhaustion?: boolean;
  /** Rank sustained sales against gold supply, rather than assuming unlimited gold. */
  sustainable?: boolean;
  externalGold?: number;
  /** Operators kept in the dorms in every shift, one dorm after another (recovery boosters). They never work and take a bed each. */
  lockedDorm?: string[];
  /** Count the drones the Power Plants make, spent at every login where each is worth most (see simulateBase). Default off. */
  drones?: boolean;
  /** Try formations: a core refilled by Fiammetta in every shift. Off by default (opt-in): a 3+ member core
   * can leave the OFF-duty crews' own support staff without a fair rest rotation when their combined
   * population exceeds total dorm capacity, which the scorer correctly rejects via its exhaustion penalty,
   * but at real extra search cost per attempt. See docs/development/account-base-optimizer.md. */
  formations?: boolean;
  /** Try duty rotations (the best crew works several steps in a row). Default on. */
  duty?: boolean;
  /** Also build crews around each synergy anchor and keep the best. Several times slower; finds combos greedy cannot see. */
  deep?: boolean;
  /** Let Fiammetta keep the best workers on every shift by refilling them in turn. Off by default: about 12 s more per search, and it needs a dorm bed that a full alternating plan does not have. */
  refill?: boolean;
}

export interface OperatorReason {
  name: string;
  /** What the crew's base loses per day (weighted LMD) without this operator, others unchanged. */
  marginal: number;
  skills: { name: string; description: string }[];
}
export interface RoomExplanation {
  /** The crew: 0 for A, 1 for B. */
  crew: number;
  room: string;
  kind: FacilityKind;
  operators: OperatorReason[];
  /** This room's output per day while this crew works, at full rates. */
  perDay: DailyOutput;
}

/** One staffing change: which crew goes into which rooms, and who rests in the dorms until the next. */
export interface ScheduleStep { hour: number; crewIn: { crew: number; rooms: string[] }[]; resting: { crew: number; rooms: string[] }[] }

/**
 * `alternate`: two teams take turns, each resting whole in the dorms while the other works.
 * `duty`: the best crew works `duty` steps in a row and rests one in the dorms while the second crew
 * covers that step. The best crew works duty/(duty+1) of the time, so it needs fast recovery (dorm boosters,
 * Fiammetta) and low drain, which the simulator checks.
 * `formations`: a core of low-drain workers stays in its rooms in every shift, Fiammetta refilling them in turn; a different
 * crew fills the other places in each shift, so the best workers work all day and the rest rotate around them.
 * `staggered`: the rooms are in two halves that change crew on alternate staffing changes; a
 * crew works two steps, rests one in the dorms and waits one unassigned, so only half the base
 * rests at a time and the dorms do not cap how many places are staffed. Four distinct setups, so it is
 * only tried when MAX_ROTATION_SETUPS allows four.
 * `thirds`: three staffing changes; each room's main crew works two of them and rests the third while the
 * other crew covers it, and rooms rest on different changes (the reference sheet's gold crews work two of its
 * three formations this way).
 */
export type RotationShape = 'alternate' | 'staggered' | 'duty' | 'formations' | 'thirds';
interface Plan { shape: RotationShape; k: number; crews: [BaseAssignments, BaseAssignments]; group: string[]; fiammetta: boolean; /** formations: the core workers (in every shift) and one crew per shift, each crew holding the core */ formation?: { core: string[]; crews: BaseAssignments[] }; /** duty: steps the first crew works in a row before it rests one */ duty?: number; /** thirds: the staffing change (0-2) each room's main crew rests, and the rooms whose main crew is the second */ thirds?: { rest: Record<string, number>; mainB: string[] } }

export interface OptimizerResult {
  shape: RotationShape;
  /** Working staff only, room by room: crew A (0) and crew B (1). */
  crews: BaseAssignments[];
  schedule: ScheduleStep[];
  /** The simulated cycle, one entry per staffing change. */
  shifts: SimulationShift[];
  /** Hours between staffing changes: a multiple of the login interval. */
  stepHours: number;
  /** Hours a crew works before it rests. */
  workHours: number;
  simulation: SimulationResult;
  /** Weighted output per day of the steady-state cycle. */
  score: number;
  explanations: RoomExplanation[];
  notes: string[];
  /** Morale to set once before the plan starts, for operators whose skill reads it and who never rest (Dusk below 12). */
  initialMorale?: Record<string, number>;
  /** How Fiammetta picks from her refill list, when not the fixed order (see simulateBase). */
  refillPolicy?: 'lowest';
  /** calculateBase calls, snapshot and simulated together. */
  evaluations: number;
}

export { MAX_ROTATION_SETUPS } from './rotationSetups';

/** Rooms whose staff work (drain Morale) and can change output, directly or across rooms. */
export const WORK_KINDS: FacilityKind[] = ['controlCenter', 'tradingPost', 'factory', 'powerPlant', 'receptionRoom', 'office'];
/** Rooms whose value the snapshot under-reads: drones, Morale relief, clues and recruits. */
const SUPPORT_KINDS: FacilityKind[] = ['controlCenter', 'powerPlant', 'office', 'receptionRoom'];
const EPS = 1e-6;
/** Candidates re-scored every greedy step; the rest wait for the periodic full pass. */
const LAZY_TOP = 40;
const FULL_PASS_EVERY = 6;
/** Unused candidates added to a room's own staff for its exhaustive re-pick. */
const REFINE_EXTRA = 8;

/**
 * Operators whose value depends on others being present, so that adding one alone looks weak to a greedy
 * step: the readers of the shared resource pools (baseResources.ts consumerBonuses) and Shamare, whose
 * override skill is only worth it with a full room. A deep search forces each one in before greedy starts,
 * which makes their generators and partners show a gain.
 */
export const SYNERGY_ANCHORS = ['Mr. Nothing', 'Shu', 'Wind Chimes', 'Chongyue', "Ch'en the Dawnstreak", 'Ebenholz', 'Wakaba Mutsumi', 'Togawa Sakiko', 'Blitz', 'Iana', 'Wang', 'Taraxacum', 'Shamare'];

/** Every k-subset of `arr`, in a stable order. */
function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === k) { out.push([...chosen]); return; }
    for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  return out;
}

/** Every subset of at most `max` items, in a stable order. */
function subsets<T>(items: T[], max: number): T[][] {
  const out: T[][] = [[]];
  for (const item of items) for (const s of [...out]) if (s.length < max) out.push([...s, item]);
  return out;
}

const weighted = (w: OptimizerWeights, o: { lmd: number; exp: number; goldMade: number }) => o.lmd * w.lmd + o.exp * w.exp + o.goldMade * w.goldMade;
const operatorsIn = (a: BaseAssignments) => Object.values(a).flatMap(slots => (slots ?? []).flatMap(s => s ? [s.operatorName] : []));
function without(a: BaseAssignments, name: string): BaseAssignments {
  return Object.fromEntries(Object.entries(a).map(([room, slots]) => [room, (slots ?? []).map(s => s?.operatorName === name ? null : s)]));
}

export function optimizeBase(input: OptimizerInput): OptimizerResult {
  const { base, roster, loginInterval, factoryProducts } = input;
  if (!Number.isFinite(loginInterval) || loginInterval < 1 || loginInterval > 24) throw new Error('Choose a login interval from 1 to 24 hours.');
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const notes: string[] = [];
  let evaluations = 0;
  const byName = new Map(base.operators.map(o => [o.name, o]));
  const locked = (input.lockedDorm ?? []).filter(name => byName.has(name) && name in roster);
  const owned = Object.keys(roster).filter(name => byName.has(name) && !locked.includes(name)).sort();
  const slotOf = (name: string): SlotAssignment => ({ operatorName: name, eliteLevel: roster[name].eliteLevel, level: roster[name].level });

  const sustainableDrones = !!input.sustainable;
  const kindOfRoom: Record<string, string> = Object.fromEntries(base.facilities.map(f => [f.id, f.kind]));
  const rooms = base.facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind));
  const dorms = base.facilities.filter(f => f.kind === 'dormitory' && f.capacity > 0);
  const restCapacity = dorms.reduce((n, f) => n + f.capacity, 0) - locked.length;
  const lockedExtra: Record<string, SlotAssignment[]> = {};
  locked.forEach((name, i) => { if (dorms.length) (lockedExtra[dorms[i % dorms.length].id] ??= []).push(slotOf(name)); });

  // The other crew rests in the dorms while this one works, and dorm head counts feed skills (Mr. Nothing's
  // Worldly Plight, Rosmontis and Ebenholz's Perception, Idol's Aura). Staff the dorms with owned operators who
  // have no work skill anywhere, so a team scored alone is scored with the residents it will really have.
  let residents: string[] | null = null;
  function withResidents(assignments: BaseAssignments): BaseAssignments {
    if (!dorms.length) return assignments;
    residents ??= owned.filter(name => ![...pool.values()].some(names => names.includes(name))).slice(0, restCapacity);
    const placedNow = new Set(operatorsIn(assignments));
    const queue = residents.filter(name => !placedNow.has(name));
    const result: BaseAssignments = { ...assignments };
    for (const d of dorms) {
      if ((result[d.id] ?? []).some(Boolean)) continue;
      result[d.id] = Array.from({ length: d.capacity }, () => queue.length ? slotOf(queue.shift()!) : null);
    }
    return result;
  }
  // A run asks for the same staffing many times (team building tries each candidate against crews it has seen);
  // within one run only the staffing changes what a snapshot is worth.
  // Only the value is kept (a full result is large); the few callers that read the result get it worked out again.
  const snapshots = new Map<string, number>();
  function snapshotValue(assignments: BaseAssignments): { value: number; readonly result: ReturnType<typeof snapshotValueOf>['result'] } {
    const key = Object.keys(assignments).sort().map(room => `${room}:${(assignments[room] ?? []).map(s => s ? `${s.operatorName}/${s.eliteLevel}/${s.level ?? ''}/${s.manualValue ?? ''}` : '').join(',')}`).join(';');
    const known = snapshots.get(key);
    if (known !== undefined) return { value: known, get result() { return snapshotValueOf(assignments).result; } };
    const fresh = snapshotValueOf(assignments);
    if (snapshots.size >= 200_000) snapshots.clear();
    snapshots.set(key, fresh.value);
    return fresh;
  }
  function snapshotValueOf(assignments: BaseAssignments) {
    evaluations++;
    const r = calculateBase({ ...base, assignments: withResidents(assignments), factoryProducts, loginInterval, swapPolicy: 'onLogin' });
    // Green: what one login interval collects, so storage limits count.
    let value = weighted(weights, { lmd: r.dailyGoldWorthGreen, exp: r.dailyExpGreen, goldMade: r.dailyGoldMadeGreen });
    if (input.drones) {
      // The drones the staffed Power Plants make, spent each login where one is worth most (same rules as the simulator).
      const calc = r as unknown as Parameters<typeof dronesPerHour>[0];
      const staffed = (room: string) => (assignments[room] ?? []).some(Boolean);
      const perLogin = dronesPerHour(calc, base.facilities.filter(f => f.kind === 'powerPlant' && staffed(f.id)).map(f => f.id)) * loginInterval;
      const staffedRooms = base.facilities.filter(f => staffed(f.id)).map(f => f.id);
      const out = Object.values(r.roomDailyOutput) as { goldMade: number; goldSold: number }[];
      // Per login window: gold made less gold sold, plus outside gold.
      const surplus = sustainableDrones ? (out.reduce((n, o) => n + o.goldMade - o.goldSold, 0) + (input.externalGold ?? 0)) * loginInterval / 24 : null;
      let perLoginValue = 0;
      for (const { target, use } of allocateDrones(droneTargets(calc, staffedRooms, kindOfRoom, factoryProducts), perLogin, weights, surplus)) {
        perLoginValue += use * ((target.goldSold * 500 + target.extraLmd) * weights.lmd + target.exp * weights.exp + target.goldMade * weights.goldMade);
      }
      value += perLoginValue * (24 / loginInterval);
    }
    return { result: r, value };
  }

  // Who could do anything in each kind of room, at the progress the import reports.
  // Skills unlock by promotion and level, so an Elite 1 never brings an Elite 2 skill.
  const pool = new Map<FacilityKind, string[]>();
  for (const kind of WORK_KINDS) {
    const label = rooms.find(f => f.kind === kind)?.label;
    if (!label) continue;
    pool.set(kind, owned.filter(name => activeBaseSkills(byName.get(name)!, label, roster[name].eliteLevel, base.skillSlots, roster[name].level).length > 0));
  }
  // Every owned operator can do ordinary work, even without a room skill.
  // Keep the fallback shortlist small; prefer workers with fewer competing jobs.
  const versatility = new Map(owned.map(name => [name, [...pool.values()].filter(names => names.includes(name)).length]));
  const ordinary = new Map(WORK_KINDS.map(kind => [kind, owned.filter(name => !(pool.get(kind) ?? []).includes(name)).sort((a, b) => versatility.get(a)! - versatility.get(b)! || a.localeCompare(b))]));
  const candidatesFor = (kind: FacilityKind, unavailable: ReadonlySet<string>) => [
    ...(pool.get(kind) ?? []).filter(name => !unavailable.has(name)),
    ...(ordinary.get(kind) ?? []).filter(name => !unavailable.has(name)).slice(0, 3),
  ];

  /** Greedy: add the (room, operator) with the largest snapshot gain until nothing gains or the team fills the dorms it will rest in. */
  function buildTeam(used: ReadonlySet<string>, limit: number, anchor?: string, fixed?: BaseAssignments): BaseAssignments {
    const team: BaseAssignments = Object.fromEntries(rooms.map(f => [f.id, fixed ? [...(fixed[f.id] ?? Array(f.capacity).fill(null))] : Array(f.capacity).fill(null)]));
    const inTeam = new Set<string>(fixed ? operatorsIn(fixed) : []);
    let current = snapshotValue(team).value;
    if (anchor) {
      // Forced start: the anchor goes where it does the most alone, even if that is little.
      let at: { room: FacilityDef; value: number } | null = null;
      const seenRooms = new Set<string>();
      for (const room of rooms) {
        if (!(pool.get(room.kind) ?? []).includes(anchor)) continue;
        const key = `${room.kind}|${room.level}|${factoryProducts[room.id] ?? ''}`;
        if (seenRooms.has(key)) continue;
        seenRooms.add(key);
        const value = snapshotValue({ ...team, [room.id]: team[room.id].map((x, i) => i === 0 ? slotOf(anchor) : x) }).value;
        if (!at || value > at.value) at = { room, value };
      }
      if (!at) return team;
      team[at.room.id] = team[at.room.id].map((x, i) => i === 0 ? slotOf(anchor) : x);
      inTeam.add(anchor);
      current = at.value;
    }
    const estimate = new Map<string, number>();
    for (let step = 0; inTeam.size < limit; step++) {
      // Only identical room states are interchangeable. An empty factory can be
      // worth more than another worker in a staffed one; gold and EXP differ too.
      const seen = new Set<string>();
      const groups = rooms.filter(room => {
        if (!team[room.id].some(s => s === null)) return false;
        const key = JSON.stringify([room.kind, room.level, factoryProducts[room.id] ?? null, team[room.id].map(s => s?.operatorName ?? null)]);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      const unavailable = new Set([...used, ...inTeam]);
      const candidates = groups.flatMap(room => candidatesFor(room.kind, unavailable).map(name => ({ room, name, key: `${room.id}|${name}` })));
      if (!candidates.length) break;
      const full = step % FULL_PASS_EVERY === 0;
      const ranked = full ? candidates : [...candidates].sort((a, b) => (estimate.get(b.key) ?? Infinity) - (estimate.get(a.key) ?? Infinity)).slice(0, LAZY_TOP);
      let best: { room: FacilityDef; name: string; gain: number } | null = null;
      for (const c of ranked) {
        const slots = team[c.room.id];
        const index = slots.indexOf(null);
        const trial = { ...team, [c.room.id]: slots.map((s, i) => i === index ? slotOf(c.name) : s) };
        const gain = snapshotValue(trial).value - current;
        estimate.set(c.key, gain);
        if (!best || gain > best.gain + EPS || (Math.abs(gain - best.gain) <= EPS && c.name < best.name)) best = { room: c.room, name: c.name, gain };
      }
      if (!best || best.gain <= EPS) {
        if (full) break;
        // Lazy estimates may hide a gain that synergy created; confirm with a full pass.
        step = FULL_PASS_EVERY - 1;
        continue;
      }
      const slots = team[best.room.id];
      const index = slots.indexOf(null);
      team[best.room.id] = slots.map((s, i) => i === index ? slotOf(best!.name) : s);
      inTeam.add(best.name);
      current += best.gain;
    }
    // Refinement: greedy adds one operator at a time, so a pair worth more together than
    // either alone can be missed. Re-pick each room exhaustively from its own staff plus
    // the best few unused candidates, everything else held fixed.
    for (const room of rooms) {
      const staff = team[room.id].flatMap(s => s ? [s.operatorName] : []);
      const free = candidatesFor(room.kind, new Set([...used, ...inTeam]));
      const solo = free.map(name => {
        const slots = team[room.id];
        const index = slots.indexOf(null);
        if (index < 0) return { name, gain: 0 };
        return { name, gain: snapshotValue({ ...team, [room.id]: slots.map((s, i) => i === index ? slotOf(name) : s) }).value - current };
      }).sort((x, y) => y.gain - x.gain || (x.name < y.name ? -1 : 1));
      const options = [...staff, ...solo.slice(0, REFINE_EXTRA).map(x => x.name)];
      const room0: BaseAssignments = { ...team, [room.id]: Array(room.capacity).fill(null) };
      const others = inTeam.size - staff.length;
      let bestSet = staff, bestValue = current;
      for (const subset of subsets(options, room.capacity)) {
        if (others + subset.length > limit) continue;
        const trial = { ...room0, [room.id]: [...subset.map(slotOf), ...Array(room.capacity - subset.length).fill(null)] };
        const value = snapshotValue(trial).value;
        if (value > bestValue + EPS) { bestValue = value; bestSet = subset; }
      }
      if (bestSet !== staff) {
        for (const n of staff) inTeam.delete(n);
        for (const n of bestSet) inTeam.add(n);
        team[room.id] = [...bestSet.map(slotOf), ...Array(room.capacity - bestSet.length).fill(null)];
        current = bestValue;
      }
    }
    return team;
  }

  /** The other team rests, in dorm order, as far as dorm slots go. */
  function withDorms(working: BaseAssignments, resting: string[], extra: Record<string, SlotAssignment[]> = lockedExtra): BaseAssignments {
    const result: BaseAssignments = { ...working };
    const queue = [...resting];
    for (const d of dorms) {
      const fixed = extra[d.id] ?? [];
      const slots: (SlotAssignment | null)[] = [];
      while (slots.length < d.capacity - fixed.length && queue.length) slots.push(slotOf(queue.shift()!));
      result[d.id] = [...slots, ...fixed];
      while (result[d.id].length < d.capacity) result[d.id].push(null);
    }
    return result;
  }

  /** Fiammetta in the first dorm, right after its first occupant. */
  function seatFiammetta(s: BaseAssignments): BaseAssignments {
    const room = dorms[0].id;
    const slots = (s[room] ?? []).filter((x): x is SlotAssignment => !!x);
    if (slots.length >= dorms[0].capacity) slots.pop();
    const seated = [slots[0], slotOf('Fiammetta'), ...slots.slice(1)].filter(Boolean) as SlotAssignment[];
    return { ...s, [room]: [...seated, ...Array(Math.max(0, dorms[0].capacity - seated.length)).fill(null)] };
  }

  // A rotation that never repeats cannot be compared; one that exhausts a worker is
  // only acceptable when the reader allows it. One that places an operator twice in a shift is not a plan at
  // all (the simulator only warns, and would score both copies), so it loses to everything.
  const score = (sim: SimulationResult) => (input.sustainable
    ? sustainableOutput(sim.perDay, input.externalGold).lmd * weights.lmd + sim.perDay.exp * weights.exp
    : weighted(weights, { lmd: sim.perDay.lmd, exp: sim.perDay.exp, goldMade: sim.perDay.goldMade }))
    - (sim.periodic ? 0 : 1e9) - (input.allowExhaustion ? 0 : 1e6 * sim.events.filter(e => e.kind === 'exhausted').length)
    - (sim.warnings.some(w => / twice\.$/.test(w)) ? 1e12 : 0);
  function simulate(shifts: SimulationShift[], initialMorale?: Record<string, number>) {
    const sim = simulateBase({ base, shifts, loginInterval, initialMorale, drones: input.drones, droneWeights: { lmd: weights.lmd, exp: weights.exp, goldMade: weights.goldMade }, ...(input.sustainable ? { droneFunding: { externalGold: input.externalGold ?? 0 } } : {}) });
    evaluations += sim.evaluations;
    // A rotation that needs more presets than the game stores cannot be set up, so it loses to any that can.
    return { sim, value: score(sim) - (exceedsSetups(shifts) ? 1e9 : 0) };
  }

  const roomIds = rooms.map(f => f.id);
  const restrict = (crew: BaseAssignments, ids: readonly string[]) => operatorsIn(Object.fromEntries(ids.map(id => [id, crew[id] ?? []])));
  const crewFor = (crews: readonly BaseAssignments[], pick: (room: string) => number): BaseAssignments => Object.fromEntries(roomIds.map(id => [id, crews[pick(id)][id] ?? Array(rooms.find(f => f.id === id)!.capacity).fill(null)]));
  /** The shift list a plan stands for. Fiammetta, when used, is re-seated at every change. */
  function shiftsOf(plan: Plan): SimulationShift[] {
    const [A, B] = plan.crews;
    const steps: { working: BaseAssignments; resting: string[] }[] = plan.shape === 'alternate'
      ? [{ working: A, resting: operatorsIn(B) }, { working: B, resting: operatorsIn(A) }]
      : plan.shape === 'formations'
      // Every crew but the one working this step is off duty at once (not just the immediately previous one),
      // and all of them need an actual rest assignment -- otherwise a crew more than one step back is left in
      // limbo (neither working nor resting), which starves its non-core members of recovery across the cycle.
      ? plan.formation!.crews.map((crew, i, all) => {
          const pool = [...new Set(all.filter((_, j) => j !== i).flatMap(operatorsIn))].filter(n => !plan.formation!.core.includes(n));
          const cap = Math.max(0, restCapacity - 1);
          // When more off-duty names need a bed than the dorms hold, a fixed priority order (the Set's own)
          // would strand whoever sorts last EVERY shift, cycle after cycle, with no rest at all -- unlike
          // Fiammetta's refill turn, which is explicitly fair. Rotate the priority window by one shift each
          // step so every name reaches the front within pool.length shifts, the same bounded-wait guarantee.
          const resting = pool.length <= cap ? pool : [...pool.slice(i % pool.length), ...pool.slice(0, i % pool.length)].slice(0, cap);
          return { working: crew, resting };
        })
      : plan.shape === 'duty'
      // B rests in the first step after its cover shift; during the other work steps it waits unassigned.
      ? Array.from({ length: plan.duty! + 1 }, (_, i) => i < plan.duty! ? { working: A, resting: i === 0 ? operatorsIn(B) : [] } : { working: B, resting: operatorsIn(A) })
      : plan.shape === 'thirds'
      ? (() => {
        const main = new Set(plan.thirds!.mainB);
        const working = [0, 1, 2].map(s => crewFor(plan.crews, id => (plan.thirds!.rest[id] === s) !== main.has(id) ? 1 : 0));
        const everyone = [...new Set(plan.crews.flatMap(operatorsIn))];
        return working.map((w, s) => {
          const on = new Set(operatorsIn(w));
          const justWorked = new Set(operatorsIn(working[(s + 2) % 3]));
          // Everyone off duty rests, whoever just came off shift first; beyond the beds they wait unassigned.
          return { working: w, resting: everyone.filter(n => !on.has(n)).sort((x, y) => Number(justWorked.has(y)) - Number(justWorked.has(x))).slice(0, restCapacity) };
        });
      })()
      : (() => {
        const g1 = new Set(plan.group);
        const g2 = roomIds.filter(id => !g1.has(id));
        // Group 1 changes crew at even steps, group 2 at odd ones; each crew works two steps,
        // rests one in the dorms and waits one unassigned, which keeps its Morale.
        return [
          { working: crewFor(plan.crews, () => 0), resting: restrict(B, plan.group) },
          { working: crewFor(plan.crews, id => g1.has(id) ? 0 : 1), resting: restrict(A, g2) },
          { working: crewFor(plan.crews, () => 1), resting: restrict(A, plan.group) },
          { working: crewFor(plan.crews, id => g1.has(id) ? 1 : 0), resting: restrict(B, g2) },
        ];
      })();
    return steps.map(step => {
      let assignments = withDorms(step.working, step.resting);
      if (plan.fiammetta) assignments = seatFiammetta(assignments);
      if (plan.shape === 'formations') {
        // Fiammetta takes the bed that was kept free for her, at the head of that dorm, and refills the core in turn.
        const head = dorms.find(d => (assignments[d.id] ?? []).includes(null))?.id ?? dorms[0].id;
        const occupants = (assignments[head] ?? []).filter((x): x is SlotAssignment => !!x);
        assignments = { ...assignments, [head]: [slotOf('Fiammetta'), ...occupants, ...Array(5).fill(null)].slice(0, (assignments[head] ?? []).length) };
        return { assignments, factoryProducts, logins: plan.k, refill: plan.formation!.core };
      }
      return { assignments, factoryProducts, logins: plan.k, ...(plan.fiammetta ? { reseat: ['Fiammetta'] } : {}) };
    });
  }
  /** Whether everyone who must rest at a step has a dorm place. */
  function fits(plan: Plan): boolean {
    const [A, B] = plan.crews;
    if (plan.shape === 'alternate') return true;
    if (plan.shape === 'duty') return operatorsIn(A).length <= restCapacity;
    if (plan.shape === 'formations') return true;
    if (plan.shape === 'thirds') {
      const main = new Set(plan.thirds!.mainB);
      const working = [0, 1, 2].map(s => new Set(operatorsIn(crewFor(plan.crews, id => (plan.thirds!.rest[id] === s) !== main.has(id) ? 1 : 0))));
      return [0, 1, 2].every(s => [...working[(s + 2) % 3]].filter(n => !working[s].has(n)).length <= restCapacity);
    }
    const g2 = roomIds.filter(id => !plan.group.includes(id));
    return [A, B].every(c => restrict(c, plan.group).length <= restCapacity && restrict(c, g2).length <= restCapacity);
  }
  /** Two halves of the rooms with as even a head count as greedy can make. */
  function split(crews: readonly BaseAssignments[]): string[] {
    const head = (id: string) => Math.max(...crews.map(c => (c[id] ?? []).filter(Boolean).length));
    const g1: string[] = [];
    let n1 = 0, n2 = 0;
    for (const id of [...roomIds].sort((x, y) => head(y) - head(x) || (x < y ? -1 : 1))) {
      if (n1 <= n2) { g1.push(id); n1 += head(id); } else n2 += head(id);
    }
    return g1;
  }
  /** The rooms in three groups with as even a head count as greedy can make: the change each rests on. */
  function splitThree(crews: readonly BaseAssignments[]): Record<string, number> {
    const head = (id: string) => Math.max(...crews.map(c => (c[id] ?? []).filter(Boolean).length));
    const load = [0, 0, 0];
    const rest: Record<string, number> = {};
    for (const id of [...roomIds].sort((x, y) => head(y) - head(x) || (x < y ? -1 : 1))) {
      const g = load.indexOf(Math.min(...load));
      rest[id] = g; load[g] += head(id);
    }
    return rest;
  }

  // Candidate plans. Alternating teams: each team must fit the dorms whole. Staggered crews
  // (logins of 12 h or less): only half the rooms change at a time, so only half the base
  // rests at once and every place can be staffed.
  const plans: Plan[] = [];
  /** The greedy team, and with `deep` the best of it and one team grown around each synergy anchor. */
  function bestTeam(used: ReadonlySet<string>, limit: number): BaseAssignments {
    let best = buildTeam(used, limit);
    if (!input.deep) return best;
    let bestValue = snapshotValue(best).value;
    for (const anchor of SYNERGY_ANCHORS) {
      if (used.has(anchor) || !owned.includes(anchor) || operatorsIn(best).includes(anchor)) continue;
      const team = buildTeam(used, limit, anchor);
      const value = snapshotValue(team).value;
      if (value > bestValue + EPS) { best = team; bestValue = value; notes.push(`Deep search: a team built around ${anchor} beats the plain greedy team.`); }
    }
    return best;
  }
  // Leave workers for crew B: greedily spending a small roster on A can leave
  // every factory unmanned for the entire return shift.
  // No fixed cap on a crew. The dorms hold `restCapacity` workers; whoever they cannot take waits unassigned,
  // and the simulator rejects a plan whose workers run out of Morale because they never got to rest. So try
  // crews from dorm size up to every place and keep what the simulator prefers.
  const places = rooms.reduce((n, f) => n + f.capacity, 0);
  const sizes = [...new Set([restCapacity, Math.round((restCapacity + places) / 2), places].filter(n => n >= restCapacity))];
  let bigCrew: BaseAssignments | null = null;
  for (const size of sizes) {
    const teamA = bestTeam(new Set(), Math.min(size, Math.ceil(owned.length / 2)));
    if (size === Math.max(...sizes)) bigCrew = teamA;
    const teamB = bestTeam(new Set(operatorsIn(teamA)), size);
    for (let k = 1; k * loginInterval <= 24 || k === 1; k++) plans.push({ shape: 'alternate', k, crews: [teamA, teamB], group: [], fiammetta: false });
    // Duty rotations: the best crew works two or three steps running, so it must fit the dorms to rest whole.
    // A duty of d is d + 1 staffing changes but only three setups (the lead crew's repeat shifts are one preset).
    if (size === restCapacity && input.duty !== false) {
      for (const duty of [2, 3]) {
        const plan: Plan = { shape: 'duty', k: 1, crews: [teamA, teamB], group: [], fiammetta: false, duty };
        if (fits(plan)) plans.push(plan);
      }
    }
  }
  // Crews of which only part rests at a time (logins of 12 h or less): a crew works two steps running, so every
  // place can be staffed and the dorms hold only whoever just came off shift.
  if (2 * loginInterval <= 24) {
    const crewA = bestTeam(new Set(), Math.min(places, Math.ceil(owned.length / 2)));
    const crewB = bestTeam(new Set(operatorsIn(crewA)), places);
    // Staggered: four distinct setups, more than the game holds unless the bound allows it.
    if (MAX_ROTATION_SETUPS >= 4) {
      const group = split([crewA, crewB]);
      for (let k = 1; 2 * k * loginInterval <= 24; k++) {
        const plan: Plan = { shape: 'staggered', k, crews: [crewA, crewB], group, fiammetta: false };
        if (fits(plan)) plans.push(plan);
      }
    }
    // Thirds: each room's main crew rests a different one of three staffing changes, so a third of the base
    // rests at a time. Three setups, so it fits the game's presets where the staggered shape does not.
    const plan: Plan = { shape: 'thirds', k: 1, crews: [crewA, crewB], group: [], fiammetta: false, thirds: { rest: splitThree([crewA, crewB]), mainB: [] } };
    if (fits(plan)) plans.push(plan);
  }
  /** Fill one crew's empty support-room slots (CC, Office, Reception, Power Plant) with whichever candidate
   * gains the most immediate snapshot value, same greedy rule as tryFill below but for a single crew used
   * before a plan exists -- crew0's own greedy build can leave Control Center or Office short of capacity
   * (its step-by-step construction can settle for "good enough" elsewhere before trying every support slot),
   * which understates every other room's cross-facility Morale relief and so overstates everyone's real drain. */
  function fillSupportRooms(crew: BaseAssignments, taken: ReadonlySet<string>): BaseAssignments {
    const result: BaseAssignments = { ...crew };
    const used = new Set(taken);
    for (const kind of SUPPORT_KINDS) for (const room of rooms.filter(f => f.kind === kind)) {
      for (let index = (result[room.id] ?? []).indexOf(null); index >= 0; index = (result[room.id] ?? []).indexOf(null)) {
        const base = snapshotValue(result).value;
        let pick: { name: string; gain: number } | null = null;
        for (const name of candidatesFor(kind, used)) {
          const gain = snapshotValue({ ...result, [room.id]: (result[room.id] ?? []).map((s, i) => i === index ? slotOf(name) : s) }).value - base;
          if (!pick || gain > pick.gain + EPS) pick = { name, gain };
        }
        if (!pick || pick.gain < -EPS) break;
        result[room.id] = (result[room.id] ?? []).map((s, i) => i === index ? slotOf(pick!.name) : s);
        used.add(pick.name);
      }
    }
    return result;
  }
  // Formations: the best workers whose Morale Fiammetta can keep up with work every shift; a crew per shift fills the rest.
  if (input.formations && roster.Fiammetta && byName.has('Fiammetta') && dorms.length && bigCrew) {
    const crew0: BaseAssignments = fillSupportRooms(bigCrew, new Set(operatorsIn(bigCrew)));
    const snap = snapshotValue(crew0);
    const roomOfName = new Map<string, string>();
    for (const [room, slots] of Object.entries(crew0)) for (const slot of slots ?? []) if (slot) roomOfName.set(slot.operatorName, room);
    const drainIn = (result: ReturnType<typeof snapshotValue>['result'], room: string, name: string) =>
      (result.rooms[room] as { perOperatorMorale?: Record<string, number> } | undefined)?.perOperatorMorale?.[name] ?? 0;
    // crew0's own occupants score as-is; a greedy snapshot search structurally can't see a low-drain specialist
    // (Shamare/Bibeak/Tequila's own -0.25/h skills) outvalue a higher-output one UNTIL the window is long, so every
    // owned candidate for each of crew0's production rooms is tried too, swapped in for its weakest current occupant.
    type Candidate = { name: string; marginal: number; drain: number };
    const seen = new Map<string, Candidate>();
    for (const name of roomOfName.keys()) {
      if (name === 'Fiammetta') continue;
      const marginal = snap.value - snapshotValue(without(crew0, name)).value;
      if (marginal > EPS) seen.set(name, { name, marginal, drain: drainIn(snap.result, roomOfName.get(name)!, name) });
    }
    for (const f of rooms.filter(f => roomOfName.has(operatorsIn(crew0).find(n => roomOfName.get(n) === f.id) ?? '') || Object.values(crew0[f.id] ?? []).some(Boolean))) {
      const occupants = (crew0[f.id] ?? []).flatMap(s => s ? [s.operatorName] : []);
      if (!occupants.length) continue;
      for (const candidate of candidatesFor(f.kind, new Set(operatorsIn(crew0).filter(n => n !== occupants[occupants.length - 1])))) {
        if (seen.has(candidate)) continue;
        const index = (crew0[f.id] ?? []).length - 1;
        const trial = { ...crew0, [f.id]: (crew0[f.id] ?? []).map((s, i) => i === index ? slotOf(candidate) : s) };
        const value = snapshotValue(trial).value;
        const marginal = value - snapshotValue(without(trial, candidate)).value;
        if (marginal > EPS) seen.set(candidate, { name: candidate, marginal, drain: drainIn(snapshotValue(trial).result, f.id, candidate) });
      }
      // A room's real skill-driven drain can depend on WHO ELSE is placed with a candidate (an override skill like
      // Shamare's can raise everyone else's value while her own drain reads differently next to different roommates),
      // so evaluating one swap at a time against crew0's existing occupants can badly misjudge a specialist who only
      // shines, and only drains little, alongside specific partners. Also try the room filled by every combination of
      // this room's own top few individually-ranked candidates (bounded: C(8, capacity), cheap), scored together, and
      // let that joint placement's real per-operator drains (not the one-at-a-time guess) win if a candidate appears
      // in both readings -- a candidate whose true value only appears jointly is otherwise invisible to this search.
      const shortlist = candidatesFor(f.kind, new Set(operatorsIn(crew0).filter(n => !occupants.includes(n)))).slice(0, 8);
      const capacity = occupants.length;
      for (const combo of combinations(shortlist, capacity)) {
        const trial = { ...crew0, [f.id]: combo.map(slotOf) };
        const value = snapshotValue(trial).value;
        for (const name of combo) {
          const marginal = value - snapshotValue(without(trial, name)).value;
          const drain = drainIn(snapshotValue(trial).result, f.id, name);
          const existing = seen.get(name);
          if (marginal > EPS && (!existing || marginal / (drain + 0.1) > existing.marginal / (existing.drain + 0.1))) seen.set(name, { name, marginal, drain });
        }
      }
    }
    const ranked = [...seen.values()].sort((x, y) => y.marginal / (y.drain + 0.1) - x.marginal / (x.drain + 0.1)).slice(0, 12);
    // The right core size isn't knowable analytically from drain alone -- Fiammetta visits core members in a
    // round-robin determined by who is lowest, so a 5-member core can be perfectly fine (each gets refilled every
    // 5th login) while a 3-member one already fails if two members drain fast enough to both hit 0 between visits.
    // Try every size the ranking offers, build real crews for each, and let the simulator (not a drain-sum guess)
    // decide which, if any, beats the best plan found so far.
    // Prefixes of the ranking (top-1, top-2, top-3, ...) plus every pair and triple among the top 6 candidates
    // -- the ranking is a per-candidate heuristic (marginal value per unit drain), so it is not guaranteed that
    // the single best PAIR is the top two individually-ranked names; a combination outside the prefix can score
    // higher together than the prefix of the same size does, and this is cheap to check directly (bounded: at
    // most C(6,2)+C(6,3) = 15+20 = 35 extra candidates, on top of the up-to-12 prefixes already tried).
    const candidateCores: string[][] = [];
    for (let size = 2; size <= ranked.length; size++) candidateCores.push(ranked.slice(0, size).map(r => r.name));
    const topSix = ranked.slice(0, 6).map(r => r.name);
    for (const combo of [...combinations(topSix, 2), ...combinations(topSix, 3)]) {
      if (!candidateCores.some(c => c.length === combo.length && c.every(n => combo.includes(n)))) candidateCores.push(combo);
    }
    for (const core of candidateCores) {
      const fixed: BaseAssignments = Object.fromEntries(rooms.map(f => [f.id, (crew0[f.id] ?? []).map(slot => slot && core.includes(slot.operatorName) ? slot : null)]));
      // One shift per crew, so no more crews than the game has preset slots.
      for (const n of [2, 3].filter(x => x <= MAX_ROTATION_SETUPS)) {
        // With this rotation (every non-working crew rests at once), n-1 crews are off duty simultaneously and
        // share the SAME restCapacity-1 beds (one kept for Fiammetta) -- each crew's own non-core size must be
        // capped by its SHARE of that total, not by the full amount, or n-1 crews' combined population can
        // exceed actual dorm capacity even though each one alone would fit (the bug this replaces: at n=3 two
        // off-duty crews could each be sized up to the FULL bed count, summing to roughly double it).
        const perCrewLimit = core.length + Math.max(1, Math.floor((restCapacity - 1) / (n - 1)));
        const crews: BaseAssignments[] = [];
        // Fiammetta is seated in a dorm by the formations shift builder; a crew must not also use her as a worker.
        const taken = new Set([...core, 'Fiammetta']);
        for (let i = 0; i < n; i++) {
          let crew = buildTeam(taken, perCrewLimit, undefined, fixed);
          // Try to also guarantee full Control Center and Office staffing -- the cross-facility relief they
          // provide was, without this, read from whatever crew0 (a DIFFERENT crew, used only for ranking) happened
          // to have, not what these real crews actually get, which can understate the core's true (lower) drain
          // enough to make it fail. The size guard (not just n===2) is what makes this safe at any n: a tighter
          // per-crew budget (more off-duty crews sharing the same dorms) simply means the fill is kept only when
          // it still fits that share, so it can never reintroduce the dorm-capacity-sharing issue fixed earlier.
          const filled = fillSupportRooms(crew, new Set(taken));
          if (operatorsIn(filled).length <= perCrewLimit) crew = filled;
          operatorsIn(crew).forEach(name => taken.add(name));
          crews.push(crew);
        }
        plans.push({ shape: 'formations', k: 1, crews: [crews[0], crews[1]], group: [], fiammetta: false, formation: { core, crews } });
      }
    }
  }
  let best: { plan: Plan; shifts: SimulationShift[]; sim: SimulationResult; value: number; initialMorale?: Record<string, number> } | null = null;
  const consider = (plan: Plan) => {
    const shifts = shiftsOf(plan);
    const { sim, value } = simulate(shifts);
    return { plan, shifts, sim, value };
  };
  for (const plan of plans) {
    // Not worth a simulation: more distinct setups than the game stores (the alternation always fits).
    if (exceedsSetups(shiftsOf(plan))) continue;
    const c = consider(plan);
    const changes = (p: Plan) => (p.shape === 'staggered' ? 2 : p.shape === 'thirds' ? 3 : p.shape === 'duty' ? p.duty! + 1 : p.shape === 'formations' ? p.formation!.crews.length : 1) / p.k;
    if (!best || c.value > best.value * (1 + 1e-3) + EPS || (c.value >= best.value * (1 - 1e-3) - EPS && changes(plan) < changes(best.plan))) best = c;
  }
  const namesOf = () => best!.plan.crews.map(operatorsIn);
  if (best!.plan.shape === 'thirds') notes.push('Each room\'s main crew works two staffing changes out of three and rests the third while the other crew covers it; rooms rest on different changes (the schedule shows which), so only a third of the base rests at a time.');
  if (best!.plan.shape === 'alternate' && namesOf()[1].length < namesOf()[0].length) notes.push(`The roster fills ${namesOf()[1].length} of ${namesOf()[0].length} places in the second team; its empty places stay empty while the first team rests.`);

  // Support rooms: greedy sees no output from a Power Plant (drones are not scored) and
  // little from Control Center Morale relief, so it can leave them empty. While the dorms
  // have room, fill their empty places with unused operators, best
  // snapshot first; keep the fill only if the simulator does not lose.
  function tryFill() {
    if (best!.plan.shape === 'formations') return;
    const plan: Plan = { ...best!.plan, crews: [{ ...best!.plan.crews[0] }, { ...best!.plan.crews[1] }] };
    const taken = new Set(plan.crews.flatMap(operatorsIn));
    const added: string[] = [];
    for (const kind of SUPPORT_KINDS) for (const room of rooms.filter(f => f.kind === kind)) for (const crew of plan.crews) {
      for (let index = crew[room.id].indexOf(null); index >= 0; index = crew[room.id].indexOf(null)) {
        const base = snapshotValue(crew).value;
        let pick: { name: string; gain: number } | null = null;
        for (const name of candidatesFor(kind, taken)) {
          const gain = snapshotValue({ ...crew, [room.id]: crew[room.id].map((s, i) => i === index ? slotOf(name) : s) }).value - base;
          if (!pick || gain > pick.gain + EPS) pick = { name, gain };
        }
        if (!pick || pick.gain < -EPS) break;
        const before = crew[room.id];
        crew[room.id] = before.map((s, i) => i === index ? slotOf(pick!.name) : s);
        if (!fits(plan)) { crew[room.id] = before; break; }
        taken.add(pick.name); added.push(pick.name);
      }
    }
    if (added.length) {
      const c = consider(plan);
      if (c.value >= best!.value - EPS) { best = c; notes.push(`Support rooms take ${added.join(', ')}: places the dorms still had room to rest, at no cost to output.`); }
    }
    // The pass above can only use an operator with nothing else to do: `candidatesFor` excludes anyone already
    // placed, so a support room a skilled operator could staff stays empty whenever every such operator already
    // has a production role (common on a small roster) -- not because the trade-off was judged and declined,
    // but because it was never tried. For any support room still empty in a crew, try DISPLACING a candidate
    // already working elsewhere in THAT crew, backfilling their old room, and keep the move only if the real
    // simulator prefers the result. Processed one room at a time, mutating `plan.crews` in place after each
    // accepted move (not a separate, unsynced copy), so a later room's search sees where the last move actually
    // left people -- and an explicit uniqueness check guards every accepted trial, so a bug here can produce an
    // untried trade at worst, never a shipped double-booking.
    for (const kind of SUPPORT_KINDS) for (const room of rooms.filter(f => f.kind === kind)) {
      for (const crewIndex of [0, 1] as const) {
        const crew = plan.crews[crewIndex];
        const index = (crew[room.id] ?? []).indexOf(null);
        if (index < 0) continue; // full already, or no capacity
        const inThisCrew = new Set(operatorsIn(crew));
        // The replacement must be someone not placed ANYWHERE yet -- excluding only this crew's own members
        // would let it pick an OTHER crew's operator (who rests, not works, during this crew's shifts), placing
        // them here while they are ALSO the other crew's own occupant of that same slot: the exact double-booking
        // an earlier version of this pass shipped, caught by the "no duplicate placements" test.
        const placedAnywhere = new Set([...operatorsIn(plan.crews[0]), ...operatorsIn(plan.crews[1])]);
        const candidates = (pool.get(kind) ?? []).filter(name => inThisCrew.has(name));
        let bestTrial: { trial: BaseAssignments; mover: string; from: string } | null = null;
        let bestTrialValue = snapshotValue(crew).value;
        for (const mover of candidates) {
          const from = rooms.find(f => (crew[f.id] ?? []).some(s => s?.operatorName === mover))?.id;
          if (!from || from === room.id) continue;
          const replacement = candidatesFor(kindOfRoom[from] as FacilityKind, placedAnywhere)[0];
          const trial: BaseAssignments = {
            ...crew,
            [from]: (crew[from] ?? []).map(s => (s?.operatorName === mover ? (replacement ? slotOf(replacement) : null) : s)),
            [room.id]: (crew[room.id] ?? []).map((s, i) => (i === index ? slotOf(mover) : s)),
          };
          // Safety: never accept a duplicate placement, checked against BOTH crews (not just the one being
          // modified) -- the actual bug this guards against was a cross-crew duplicate, not a within-crew one.
          const otherCrewNames = operatorsIn(plan.crews[1 - crewIndex]);
          const names = [...operatorsIn(trial), ...otherCrewNames];
          if (names.length !== new Set(names).size) continue;
          const value = snapshotValue(trial).value;
          if (value > bestTrialValue) { bestTrialValue = value; bestTrial = { trial, mover, from }; }
        }
        if (!bestTrial) continue;
        const tradedPlan: Plan = { ...plan, crews: [crewIndex === 0 ? bestTrial.trial : plan.crews[0], crewIndex === 1 ? bestTrial.trial : plan.crews[1]] };
        if (!fits(tradedPlan)) continue;
        const c = consider(tradedPlan);
        if (c.value > best!.value + EPS) {
          best = c;
          plan.crews[crewIndex] = bestTrial.trial; // keep this pass's own view in sync for the next room/kind
          notes.push(`${bestTrial.mover} moves from ${bestTrial.from} to ${room.label}: worth more there than in production.`);
        }
      }
    }
  }
  tryFill();

  // Exhaustion repair: an operator who reaches 0 every cycle may cost more than they
  // bring. Try the plan without each exhausted worker; keep what the simulator prefers.
  for (let pass = 0; pass < 3; pass++) {
    if (best!.plan.shape === 'formations') break;
    const tired = [...new Set(best!.sim.events.filter(e => e.kind === 'exhausted').flatMap(e => e.operators ?? []))];
    if (!tired.length) break;
    let improved = false;
    for (const name of tired) {
      const c = consider({ ...best!.plan, crews: [without(best!.plan.crews[0], name), without(best!.plan.crews[1], name)] });
      if (c.value > best!.value + EPS) { best = c; improved = true; notes.push(`${name} is left out: they reached 0 Morale every cycle${input.allowExhaustion ? ' and the base produces more without them' : ''}.`); }
    }
    if (!improved) break;
  }
  // A worker left out frees a place the support rooms can use.
  tryFill();

  // Fiammetta: re-seated at full Morale after the first operator coming off shift, she hands
  // them her 24 Morale. Kept only if the simulation gains.
  if (roster.Fiammetta && byName.has('Fiammetta') && best!.plan.shape !== 'formations' && !best!.plan.crews.some(c => operatorsIn(c).includes('Fiammetta')) && dorms.length) {
    const c = consider({ ...best!.plan, fiammetta: true });
    if (c.value > best!.value + EPS) { best = c; notes.push(`Fiammetta sits in ${dorms[0].label} and is taken out and put back at each staffing change, right after the operator coming off shift, to hand them her full Morale.`); }
  }

  // Core workers refilled by Fiammetta. She recovers 2 Morale an hour in a dorm and, at full Morale, swaps
  // it with the operator seated before her, so one Fiammetta hands out about 48 Morale a day. A low-drain
  // worker who works every shift and is topped up in turn never rests: the sheets' Shamare + Proviso play.
  // Greedy: for each of the best workers in turn, put them in their room in every shift (the weakest member
  // there steps aside), seat Fiammetta, and keep the change only if the simulator scores higher.
  if (input.refill && roster.Fiammetta && byName.has('Fiammetta') && dorms.length && !best!.shifts.some(sh => operatorsIn(sh.assignments).includes('Fiammetta'))) {
    const dormIds = dorms.map(d => d.id);
    const marginals = new Map<string, number>();
    for (const crew of best!.plan.crews) {
      const whole = snapshotValue(crew).value;
      for (const name of operatorsIn(crew)) marginals.set(name, Math.max(marginals.get(name) ?? -Infinity, whole - snapshotValue(without(crew, name)).value));
    }
    const homeOf = (shifts: SimulationShift[], name: string) => roomIds.find(id => shifts.some(sh => sh.assignments[id]?.some(s => s?.operatorName === name))) ?? null;
    const makeCore = (shifts: SimulationShift[], name: string, core: string[]): SimulationShift[] | null => {
      const home = homeOf(shifts, name);
      if (!home) return null;
      // Pass 1: the worker works their room in every shift; the weakest member there steps aside to a free bed,
      // or leaves the plan if there is none (an unrested worker would only exhaust).
      const dropped = new Set<string>();
      const placed = shifts.map(sh => {
        const a: BaseAssignments = Object.fromEntries(Object.entries(sh.assignments).map(([room, v]) => [room, (v ?? []).map(x => x?.operatorName === 'Fiammetta' ? null : x)]));
        if (!a[home].some(s => s?.operatorName === name)) {
          for (const room of Object.keys(a)) a[room] = a[room].map(s => s?.operatorName === name ? null : s);
          let index = a[home].indexOf(null);
          if (index < 0) {
            const weakest = a[home].map((s, i) => ({ i, name: s!.operatorName })).filter(x => !core.includes(x.name)).sort((x, y) => (marginals.get(x.name) ?? 0) - (marginals.get(y.name) ?? 0))[0];
            if (!weakest) return null;
            index = weakest.i;
            const bed = dormIds.map(d => ({ d, i: a[d].indexOf(null) })).find(x => x.i >= 0);
            if (bed) a[bed.d][bed.i] = slotOf(weakest.name); else dropped.add(weakest.name);
          }
          a[home][index] = slotOf(name);
        }
        return { ...sh, assignments: a };
      });
      if (placed.some(sh => sh === null)) return null;
      // Pass 2: whoever had to leave leaves every shift. Pass 3: Fiammetta takes a free bed at the head of its
      // dorm (nobody sits before her, so she does not swap on arrival); a shift with none drops the trial.
      const made = (placed as SimulationShift[]).map(sh => {
        const a: BaseAssignments = Object.fromEntries(Object.entries(sh.assignments).map(([room, v]) => [room, (v ?? []).map(x => x && dropped.has(x.operatorName) ? null : x)]));
        const dorm = dormIds.find(d => a[d].includes(null));
        if (!dorm) return null;
        const occupants = a[dorm].filter(Boolean) as SlotAssignment[];
        a[dorm] = [slotOf('Fiammetta'), ...occupants, ...Array(Math.max(0, a[dorm].length - occupants.length - 1)).fill(null)];
        return { ...sh, assignments: a, refill: [...core, name] };
      });
      return made.some(m => m === null) ? null : (made as SimulationShift[]);
    };
    // A bed for Fiammetta: the weakest worker of each crew leaves the plan, which frees one bed in every shift.
    const productionKinds = new Set(['factory', 'tradingPost']);
    const dropFromPlan = (shifts: SimulationShift[], names: string[]) => shifts.map(sh => ({ ...sh, assignments: Object.fromEntries(Object.entries(sh.assignments).map(([room, v]) => [room, (v ?? []).map(x => x && names.includes(x.operatorName) ? null : x)])) }));
    // The weakest worker of each crew leaves, which frees a bed in every shift. The snapshot cannot see Morale
    // effects, so among each crew's six weakest production workers the simulator picks the one that costs least.
    const victims = best!.plan.crews.flatMap(crew => {
      const weakest = operatorsIn(Object.fromEntries(Object.entries(crew).filter(([id]) => productionKinds.has(rooms.find(f => f.id === id)?.kind ?? '')))).filter(n => n !== 'Fiammetta')
        .sort((x, y) => (marginals.get(x) ?? 0) - (marginals.get(y) ?? 0)).slice(0, 6);
      const scored = weakest.map(n => ({ n, value: simulate(dropFromPlan(best!.shifts, [n])).value })).sort((x, y) => y.value - x.value);
      return scored.slice(0, 1).map(x => x.n);
    });
    const removeVictims = (shifts: SimulationShift[]) => dropFromPlan(shifts, victims);
    const ranked = [...marginals.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n).filter(n => n !== 'Fiammetta' && !victims.includes(n)).slice(0, 10);
    // Fiammetta's bed and the two workers that make room for her are a fixed cost, so growing the core one worker
    // at a time never pays for it. Try cores of several sizes, best-ranked first, and keep the best by simulation.
    const coreOf = (size: number) => {
      let current = removeVictims(best!.shifts);
      const core: string[] = [];
      for (const name of ranked.slice(0, size)) {
        const trial = makeCore(current, name, core);
        if (trial) { core.push(name); current = trial; }
      }
      return core.length ? { core, shifts: current.map(sh => ({ ...sh, refill: [...core] })) } : null;
    };
    let chosen: string[] = [];
    for (const size of [2, 3, 4, 6, 8, 10]) {
      const trial = coreOf(size);
      if (!trial || (chosen.length === trial.core.length)) continue;
      const { sim, value } = simulate(trial.shifts);
      if (value > best!.value + EPS) { chosen = trial.core; best = { plan: best!.plan, shifts: trial.shifts, sim, value }; }
    }
    const core = chosen;
    if (core.length) notes.push(`Fiammetta refills ${core.join(', ')} in turn at the staffing changes: each works every shift and never rests. She sits in ${dorms[0].label} and, whenever she is full at a staffing change, swaps her Morale with the next of them in that order.`);
  }

  // With a full Sui Control Center (Ling, Chongyue, Saileach...) Dusk loses no Morale there: her own -0.5 and the
  // room's relief cancel its cost (0.15-0.4/h with fewer). A player who drains her below 12 once keeps her there:
  // "Unstirred by Gain" then adds Worldly Plight +15, alongside Ling's +15 above 12. The simulator starts everyone
  // at full Morale, so it cannot find this alone. For each shift: Dusk works its Control Center at 11 Morale and
  // waits unassigned in the others rather than resting (so she stays below 12, the sheets' play); the rest of that
  // Control Center is then filled with unused candidates, each resting in a free bed in the other shifts or in the
  // bed of a weak production worker who leaves the plan. Every step is kept only if the simulator scores higher.
  const controlCenter = rooms.find(f => f.kind === 'controlCenter');
  if (controlCenter && roster.Dusk && byName.has('Dusk') && best!.shifts.some(sh => operatorsIn(sh.assignments).includes('Dusk'))) {
    const parked = { Dusk: 11 };
    const cc = controlCenter.id;
    const productionKinds = new Set<FacilityKind>(['factory', 'tradingPost', 'powerPlant']);
    const strip = (a: BaseAssignments, names: string[]): BaseAssignments =>
      Object.fromEntries(Object.entries(a).map(([room, v]) => [room, (v ?? []).map(x => x && names.includes(x.operatorName) ? null : x)]));
    const freeBed = (a: BaseAssignments) => {
      for (const d of dorms) { const i = (a[d.id] ?? []).indexOf(null); if (i >= 0) return { room: d.id, i }; }
      return null;
    };
    let found: { shifts: SimulationShift[]; value: number; added: string[]; dropped: string[]; target: number } | null = null;
    for (let target = 0; target < best!.shifts.length; target++) {
      let shifts = best!.shifts.map(sh => ({ ...sh, assignments: strip(sh.assignments, ['Dusk']) }));
      const at = (shifts[target].assignments[cc] ?? []).indexOf(null);
      if (at < 0) continue;
      shifts[target] = { ...shifts[target], assignments: { ...shifts[target].assignments, [cc]: shifts[target].assignments[cc].map((x, j) => j === at ? slotOf('Dusk') : x) } };
      let value = simulate(shifts, parked).value;
      const added: string[] = [], dropped: string[] = [];
      // Every place is filled in turn even when one more alone gains nothing: Dusk's cost only reaches 0 with the
      // room full, so the step that pays may be the last one. The best stage reached is what counts.
      let stage = { shifts, value, added: [] as string[], dropped: [] as string[] };
      for (let free = shifts[target].assignments[cc].indexOf(null); free >= 0; free = shifts[target].assignments[cc].indexOf(null)) {
        const working = Object.fromEntries(rooms.map(f => [f.id, shifts[target].assignments[f.id] ?? []])) as BaseAssignments;
        const whole = snapshotValue(working).value;
        const keep = new Set(['Fiammetta', 'Dusk', ...(shifts[target].refill ?? [])]);
        const weakest = rooms.filter(f => productionKinds.has(f.kind)).flatMap(f => (working[f.id] ?? []).flatMap(s => s && !keep.has(s.operatorName) ? [s.operatorName] : []))
          .map(n => ({ n, loss: whole - snapshotValue(without(working, n)).value })).sort((x, y) => x.loss - y.loss).slice(0, 4).map(x => x.n);
        const candidates = candidatesFor('controlCenter', new Set([...shifts.flatMap(sh => operatorsIn(sh.assignments)), 'Fiammetta'])).slice(0, 4);
        let pick: { shifts: SimulationShift[]; value: number; name: string; drop: string | null } | null = null;
        for (const name of candidates) for (const drop of [null, ...weakest]) {
          const trial = shifts.map((sh, j) => {
            const a = drop ? strip(sh.assignments, [drop]) : { ...sh.assignments };
            if (j === target) return { ...sh, assignments: { ...a, [cc]: a[cc].map((x, k) => k === free ? slotOf(name) : x) } };
            const bed = freeBed(a);
            return bed ? { ...sh, assignments: { ...a, [bed.room]: a[bed.room].map((x, k) => k === bed.i ? slotOf(name) : x) } } : null;
          });
          if (trial.some(t => t === null)) continue;
          const v = simulate(trial as SimulationShift[], parked).value;
          if (!pick || v > pick.value) pick = { shifts: trial as SimulationShift[], value: v, name, drop };
        }
        if (!pick) break;
        shifts = pick.shifts; value = pick.value; added.push(pick.name);
        if (pick.drop) dropped.push(pick.drop);
        if (value > stage.value + EPS) stage = { shifts, value, added: [...added], dropped: [...dropped] };
      }
      if (!found || stage.value > found.value) found = { ...stage, target };
    }
    if (found && found.value > best!.value + EPS) {
      const { sim, value } = simulate(found.shifts, parked);
      best = { ...best!, shifts: found.shifts, sim, value, initialMorale: parked };
      notes.push(`Drain Dusk below 12 Morale once (any working room will do) and keep her there: below 12 "Unstirred by Gain" adds Worldly Plight +15${roster.Ling ? ' on top of Ling\'s +15 above 12' : ''}. In the ${controlCenter.label} with this crew she loses no Morale, and when off shift she waits unassigned rather than resting, so she stays below 12.`
        + (found.added.length ? ` That ${controlCenter.label} also takes ${found.added.join(', ')}, who rest in the other shifts${found.dropped.length ? ` in the beds of ${found.dropped.join(', ')}, who ${found.dropped.length > 1 ? 'leave' : 'leaves'} the plan` : ''}.` : ''));
    }
  }

  // Thirds: a two-crew plan retimed over three staffing changes. Each room's main crew works two of them and
  // rests the third while the other crew covers it, rooms resting on different changes. Which change each room
  // rests on, and which crew is its main one, is searched room by room with the simulator. The reference sheet's
  // gold crews work two of its three formations like this; a two-shift plan gives them one shift in two. Part of
  // the opt-in formations search (each pass is about 50 simulations). Kept only if the simulator scores higher.
  if (input.formations && best!.shifts.length === 2 && dorms.length) {
    const crews = [0, 1].map(i => Object.fromEntries(roomIds.map(id => [id, best!.shifts[i].assignments[id] ?? Array(rooms.find(f => f.id === id)!.capacity).fill(null)]))) as [BaseAssignments, BaseAssignments];
    const everyone = [...new Set(crews.flatMap(operatorsIn))].filter(n => n !== 'Fiammetta');
    const waiting = new Set(Object.keys(best!.initialMorale ?? {}));
    const seatFiammetta = best!.shifts.some(sh => dorms.some(d => (sh.assignments[d.id] ?? []).some(s => s?.operatorName === 'Fiammetta')));
    const refill = best!.shifts[0].refill;
    const build = (rest: Record<string, number>, mainB: ReadonlySet<string>): SimulationShift[] => {
      const working = [0, 1, 2].map(s => Object.fromEntries(roomIds.map(id => [id, crews[(rest[id] === s) !== mainB.has(id) ? 1 : 0][id]])) as BaseAssignments);
      return working.map((w, s) => {
        const on = new Set(operatorsIn(w));
        const justWorked = new Set(operatorsIn(working[(s + 2) % 3]));
        // Who just came off shift rests first; an operator parked at a set Morale (Dusk) waits rather than rest.
        const resting = everyone.filter(n => !on.has(n) && !waiting.has(n)).sort((x, y) => Number(justWorked.has(y)) - Number(justWorked.has(x)));
        let assignments = withDorms(w, resting.slice(0, Math.max(0, restCapacity - (seatFiammetta ? 1 : 0))));
        if (seatFiammetta) {
          const head = dorms.find(d => (assignments[d.id] ?? []).includes(null))?.id ?? dorms[0].id;
          const occupants = (assignments[head] ?? []).filter((x): x is SlotAssignment => !!x);
          assignments = { ...assignments, [head]: [slotOf('Fiammetta'), ...occupants, ...Array(5).fill(null)].slice(0, (assignments[head] ?? []).length) };
        }
        return { assignments, factoryProducts, logins: 1, ...(refill?.length ? { refill } : {}) };
      });
    };
    let rest: Record<string, number> = Object.fromEntries(roomIds.map((id, i) => [id, i % 3]));
    let mainB = new Set<string>();
    let value = simulate(build(rest, mainB), best!.initialMorale).value;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const id of roomIds) for (const s of [0, 1, 2]) for (const b of [false, true]) {
        if (rest[id] === s && mainB.has(id) === b) continue;
        const r2 = { ...rest, [id]: s };
        const m2 = new Set(mainB); if (b) m2.add(id); else m2.delete(id);
        const v = simulate(build(r2, m2), best!.initialMorale).value;
        if (v > value + EPS) { value = v; rest = r2; mainB = m2; moved = true; }
      }
      if (!moved) break;
    }
    if (value > best!.value + EPS) {
      const shifts = build(rest, mainB);
      const { sim } = simulate(shifts, best!.initialMorale);
      best = { ...best!, plan: { ...best!.plan, shape: 'thirds', k: 1, crews, thirds: { rest, mainB: [...mainB] } }, shifts, sim, value };
      notes.push('Each room\'s main crew works two staffing changes out of three and rests the third while the other crew covers that one; rooms rest on different changes (the schedule shows which), so the best workers work twice as often as they rest.');
    }
  }

  // Dorm head counts feed skills (Mr. Nothing's Worldly Plight, Idol's Aura, Rosmontis and Ebenholz's Perception),
  // but the plan's dorms hold only the crew coming off shift, so on a big roster beds stay empty. Seat owned
  // operators the plan never uses in every empty bed, the same bed in every shift, those with a Dormitory skill
  // first. Never in a dorm holding Fiammetta: she would swap her full Morale with an arrival who does not need it.
  // Kept only if the simulator scores higher.
  {
    const placed = new Set(best!.shifts.flatMap(sh => operatorsIn(sh.assignments)));
    const dormSkill = (name: string) => activeBaseSkills(byName.get(name)!, 'Dormitory', roster[name].eliteLevel, base.skillSlots, roster[name].level).length > 0;
    const idle = owned.filter(name => !placed.has(name) && name !== 'Fiammetta').sort((x, y) => Number(dormSkill(y)) - Number(dormSkill(x)));
    const fiammettaDorm = (id: string) => best!.shifts.some(sh => (sh.assignments[id] ?? []).some(s => s?.operatorName === 'Fiammetta'));
    const beds = dorms.filter(d => !fiammettaDorm(d.id)).flatMap(d => Array.from({ length: d.capacity }, (_, i) => ({ room: d.id, i })))
      .filter(({ room, i }) => best!.shifts.some(sh => !(sh.assignments[room] ?? [])[i]));
    if (idle.length && beds.length) {
      // A bed empty in one shift may hold a resting worker in another; an idle operator takes it only where it is free.
      const filled = best!.shifts.map(sh => {
        const a: BaseAssignments = { ...sh.assignments };
        beds.forEach(({ room, i }, k) => {
          if (k >= idle.length) return;
          const slots = [...(a[room] ?? Array(dorms.find(d => d.id === room)!.capacity).fill(null))];
          if (!slots[i]) { slots[i] = slotOf(idle[k]); a[room] = slots; }
        });
        return { ...sh, assignments: a };
      });
      const { sim, value } = simulate(filled, best!.initialMorale);
      if (value > best!.value + EPS) {
        const used = idle.slice(0, beds.length);
        best = { ...best!, shifts: filled, sim, value };
        notes.push(`${used.length} operators the plan does not otherwise use (${used.join(', ')}) sit in the dorms' empty beds: dorm head counts raise skills such as Mr. Nothing's Worldly Plight.`);
      }
    }
  }

  // Office and Reception Room's entire modeled effect is HR Contacting Speed, Clue Speed and the placed
  // operator's own Morale cost (see officeSpecialSkills.ts / receptionRoomSpecialSkills.ts) -- none of
  // which become LMD, EXP or gold in perDay, the only things this search's score can see. So no owned
  // operator, however skilled, ever shows a scored gain from working there (the same structural blind
  // spot documented for Training Room). An empty one is a property of what this plan optimizes for,
  // true on every roster, not a gap specific to this account -- worth saying so the reader does not
  // read "empty Office" as "my roster is missing something".
  for (const kind of ['office', 'receptionRoom'] as const) {
    const room = rooms.find(f => f.kind === kind);
    if (room && room.capacity > 0 && !best!.shifts.some(s => (s.assignments[room.id] ?? []).some(Boolean))) {
      notes.push(`${room.label} stays empty: its Speed bonus is not part of this plan's scored output (LMD, EXP, gold), so no owned operator shows a gain there -- true for every roster, not only this one.`);
    }
  }

  // Why each operator: the snapshot loss without them, and their active skills there.
  const explanations: RoomExplanation[] = [];
  best!.plan.crews.forEach((crew, index) => {
    const whole = snapshotValue(crew);
    for (const f of rooms) {
      const names = (crew[f.id] ?? []).flatMap(s => s ? [s.operatorName] : []);
      if (!names.length) continue;
      const out = whole.result.roomDailyOutput[f.id];
      explanations.push({
        crew: index, room: f.id, kind: f.kind,
        perDay: out ? { exp: out.exp, goldMade: out.goldMade, goldSold: out.goldSold, lmd: out.goldSold * 500 + out.extraLmd + out.pepeLmd } : { exp: 0, goldMade: 0, goldSold: 0, lmd: 0 },
        operators: names.map(name => ({
          name,
          marginal: whole.value - snapshotValue(without(crew, name)).value,
          skills: activeBaseSkills(byName.get(name)!, f.label, roster[name].eliteLevel, base.skillSlots, roster[name].level).map(s => ({ name: cleanSkillName(s.name), description: s.description ?? '' })),
        })),
      });
    }
  });

  const plan = best!.plan;
  const step = plan.k * loginInterval;
  const g2 = roomIds.filter(id => !plan.group.includes(id));
  const schedule: ScheduleStep[] = plan.shape === 'thirds'
    ? [0, 1, 2].map(s => {
      const second = roomIds.filter(id => (plan.thirds!.rest[id] === s) !== plan.thirds!.mainB.includes(id));
      const first = roomIds.filter(id => !second.includes(id));
      return { hour: s * step, crewIn: [{ crew: 0, rooms: first }, { crew: 1, rooms: second }].filter(x => x.rooms.length), resting: [{ crew: 0, rooms: second }, { crew: 1, rooms: first }].filter(x => x.rooms.length) };
    })
    : plan.shape === 'formations'
    ? plan.formation!.crews.map((_, i, all) => ({ hour: i * step, crewIn: [{ crew: i, rooms: roomIds }], resting: [{ crew: (i + all.length - 1) % all.length, rooms: roomIds }] }))
    : plan.shape === 'duty'
    ? Array.from({ length: plan.duty! + 1 }, (_, i) => i < plan.duty!
      ? { hour: i * step, crewIn: [{ crew: 0, rooms: roomIds }], resting: i === 0 ? [{ crew: 1, rooms: roomIds }] : [] }
      : { hour: i * step, crewIn: [{ crew: 1, rooms: roomIds }], resting: [{ crew: 0, rooms: roomIds }] })
    : plan.shape === 'alternate'
    ? [{ hour: 0, crewIn: [{ crew: 0, rooms: roomIds }], resting: [{ crew: 1, rooms: roomIds }] }, { hour: step, crewIn: [{ crew: 1, rooms: roomIds }], resting: [{ crew: 0, rooms: roomIds }] }]
    : [
      { hour: 0, crewIn: [{ crew: 0, rooms: plan.group }], resting: [{ crew: 1, rooms: plan.group }] },
      { hour: step, crewIn: [{ crew: 1, rooms: g2 }], resting: [{ crew: 0, rooms: g2 }] },
      { hour: 2 * step, crewIn: [{ crew: 1, rooms: plan.group }], resting: [{ crew: 0, rooms: plan.group }] },
      { hour: 3 * step, crewIn: [{ crew: 0, rooms: g2 }], resting: [{ crew: 1, rooms: g2 }] },
    ];
  return { shape: plan.shape, crews: plan.crews, schedule, shifts: best!.shifts, stepHours: step, workHours: plan.shape === 'alternate' || plan.shape === 'formations' ? step : plan.shape === 'duty' ? plan.duty! * step : 2 * step, simulation: best!.sim, score: best!.value, explanations, notes, evaluations, ...(best!.initialMorale ? { initialMorale: best!.initialMorale } : {}) };
}

/** Gold cannot be sold indefinitely faster than it is supplied. Scale modeled sales
 * income by the funded share; do not count the same bar as gold and again as LMD.
 * This is a steady-state estimate, not a simulation of the account's gold stock. */
export function sustainableOutput(output: DailyOutput, externalGold = 0): DailyOutput {
  const supplied = Math.max(0, output.goldMade + Math.max(0, externalGold));
  const funded = output.goldSold > 0 ? Math.min(1, supplied / output.goldSold) : 1;
  const goldFree = output.goldFreeLmd ?? 0;
  return { ...output, lmd: goldFree + (output.lmd - goldFree) * funded, goldSold: output.goldSold * funded };
}
