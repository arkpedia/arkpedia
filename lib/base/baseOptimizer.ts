import { calculateBase } from './calculateBase';
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
 * `staggered`: the rooms are in two halves that change crew on alternate staffing changes; a
 * crew works two steps, rests one in the dorms and waits one unassigned, so only half the base
 * rests at a time and the dorms do not cap how many places are staffed.
 */
export type RotationShape = 'alternate' | 'staggered' | 'duty';
interface Plan { shape: RotationShape; k: number; crews: [BaseAssignments, BaseAssignments]; group: string[]; fiammetta: boolean; /** duty: steps the first crew works in a row before it rests one */ duty?: number }

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
  /** calculateBase calls, snapshot and simulated together. */
  evaluations: number;
}

/** Rooms whose staff work (drain Morale) and can change output, directly or across rooms. */
const WORK_KINDS: FacilityKind[] = ['controlCenter', 'tradingPost', 'factory', 'powerPlant', 'receptionRoom', 'office'];
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
  function snapshotValue(assignments: BaseAssignments) {
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
  function buildTeam(used: ReadonlySet<string>, limit: number, anchor?: string): BaseAssignments {
    const team: BaseAssignments = Object.fromEntries(rooms.map(f => [f.id, Array(f.capacity).fill(null)]));
    const inTeam = new Set<string>();
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
  // only acceptable when the reader allows it.
  const score = (sim: SimulationResult) => (input.sustainable
    ? sustainableOutput(sim.perDay, input.externalGold).lmd * weights.lmd + sim.perDay.exp * weights.exp
    : weighted(weights, { lmd: sim.perDay.lmd, exp: sim.perDay.exp, goldMade: sim.perDay.goldMade }))
    - (sim.periodic ? 0 : 1e9) - (input.allowExhaustion ? 0 : 1e6 * sim.events.filter(e => e.kind === 'exhausted').length);
  function simulate(shifts: SimulationShift[]) {
    const sim = simulateBase({ base, shifts, loginInterval, drones: input.drones, droneWeights: { lmd: weights.lmd, exp: weights.exp, goldMade: weights.goldMade }, ...(input.sustainable ? { droneFunding: { externalGold: input.externalGold ?? 0 } } : {}) });
    evaluations += sim.evaluations;
    return { sim, value: score(sim) };
  }

  const roomIds = rooms.map(f => f.id);
  const restrict = (crew: BaseAssignments, ids: readonly string[]) => operatorsIn(Object.fromEntries(ids.map(id => [id, crew[id] ?? []])));
  const crewFor = (crews: readonly BaseAssignments[], pick: (room: string) => number): BaseAssignments => Object.fromEntries(roomIds.map(id => [id, crews[pick(id)][id] ?? Array(rooms.find(f => f.id === id)!.capacity).fill(null)]));
  /** The shift list a plan stands for. Fiammetta, when used, is re-seated at every change. */
  function shiftsOf(plan: Plan): SimulationShift[] {
    const [A, B] = plan.crews;
    const steps: { working: BaseAssignments; resting: string[] }[] = plan.shape === 'alternate'
      ? [{ working: A, resting: operatorsIn(B) }, { working: B, resting: operatorsIn(A) }]
      : plan.shape === 'duty'
      // B rests in the first step after its cover shift; during the other work steps it waits unassigned.
      ? Array.from({ length: plan.duty! + 1 }, (_, i) => i < plan.duty! ? { working: A, resting: i === 0 ? operatorsIn(B) : [] } : { working: B, resting: operatorsIn(A) })
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
      return { assignments, factoryProducts, logins: plan.k, ...(plan.fiammetta ? { reseat: ['Fiammetta'] } : {}) };
    });
  }
  /** Whether everyone who must rest at a step has a dorm place. */
  function fits(plan: Plan): boolean {
    const [A, B] = plan.crews;
    if (plan.shape === 'alternate') return true;
    if (plan.shape === 'duty') return operatorsIn(A).length <= restCapacity;
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
  for (const size of sizes) {
    const teamA = bestTeam(new Set(), Math.min(size, Math.ceil(owned.length / 2)));
    const teamB = bestTeam(new Set(operatorsIn(teamA)), size);
    for (let k = 1; k * loginInterval <= 24 || k === 1; k++) plans.push({ shape: 'alternate', k, crews: [teamA, teamB], group: [], fiammetta: false });
    // Duty rotations: the best crew works two or three steps running, so it must fit the dorms to rest whole.
    if (size === restCapacity && input.duty !== false) {
      for (const duty of [2, 3]) {
        const plan: Plan = { shape: 'duty', k: 1, crews: [teamA, teamB], group: [], fiammetta: false, duty };
        if (fits(plan)) plans.push(plan);
      }
    }
  }
  if (2 * loginInterval <= 24) {
    const crewA = bestTeam(new Set(), Math.min(places, Math.ceil(owned.length / 2)));
    const crewB = bestTeam(new Set(operatorsIn(crewA)), places);
    const group = split([crewA, crewB]);
    for (let k = 1; 2 * k * loginInterval <= 24; k++) {
      const plan: Plan = { shape: 'staggered', k, crews: [crewA, crewB], group, fiammetta: false };
      if (fits(plan)) plans.push(plan);
    }
  }
  let best: { plan: Plan; shifts: SimulationShift[]; sim: SimulationResult; value: number } | null = null;
  const consider = (plan: Plan) => {
    const shifts = shiftsOf(plan);
    const { sim, value } = simulate(shifts);
    return { plan, shifts, sim, value };
  };
  for (const plan of plans) {
    const c = consider(plan);
    // Within 0.1%, fewer staffing changes win: alternating over staggered, longer over shorter.
    const changes = (p: Plan) => (p.shape === 'staggered' ? 2 : p.shape === 'duty' ? p.duty! + 1 : 1) / p.k;
    if (!best || c.value > best.value * (1 + 1e-3) + EPS || (c.value >= best.value * (1 - 1e-3) - EPS && changes(plan) < changes(best.plan))) best = c;
  }
  const namesOf = () => best!.plan.crews.map(operatorsIn);
  if (best!.plan.shape === 'alternate' && namesOf()[1].length < namesOf()[0].length) notes.push(`The roster fills ${namesOf()[1].length} of ${namesOf()[0].length} places in the second team; its empty places stay empty while the first team rests.`);

  // Support rooms: greedy sees no output from a Power Plant (drones are not scored) and
  // little from Control Center Morale relief, so it can leave them empty. While the dorms
  // have room, fill their empty places with unused operators, best
  // snapshot first; keep the fill only if the simulator does not lose.
  function tryFill() {
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
    if (!added.length) return;
    const c = consider(plan);
    if (c.value >= best!.value - EPS) { best = c; notes.push(`Support rooms take ${added.join(', ')}: places the dorms still had room to rest, at no cost to output.`); }
  }
  tryFill();

  // Exhaustion repair: an operator who reaches 0 every cycle may cost more than they
  // bring. Try the plan without each exhausted worker; keep what the simulator prefers.
  for (let pass = 0; pass < 3; pass++) {
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
  if (roster.Fiammetta && byName.has('Fiammetta') && !best!.plan.crews.some(c => operatorsIn(c).includes('Fiammetta')) && dorms.length) {
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
    const ranked = [...marginals.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n).filter(n => n !== 'Fiammetta' && !victims.includes(n)).slice(0, 8);
    let current = removeVictims(best!.shifts), currentValue = best!.value;
    const core: string[] = [];
    for (const name of ranked) {
      const trial = makeCore(current, name, core);
      if (!trial) continue;
      const { sim, value } = simulate(trial);
      if (value > currentValue + EPS) { core.push(name); current = trial.map(sh => ({ ...sh, refill: [...core] })); currentValue = value; best = { plan: best!.plan, shifts: current, sim, value }; }
    }
    if (core.length) notes.push(`Fiammetta refills ${core.join(', ')} in turn at the staffing changes: each works every shift and never rests. She sits in ${dorms[0].label} and swaps her full Morale with whichever of them is lowest.`);
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
  const schedule: ScheduleStep[] = plan.shape === 'duty'
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
  return { shape: plan.shape, crews: plan.crews, schedule, shifts: best!.shifts, stepHours: step, workHours: plan.shape === 'alternate' ? step : plan.shape === 'duty' ? plan.duty! * step : 2 * step, simulation: best!.sim, score: best!.value, explanations, notes, evaluations };
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
