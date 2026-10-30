import { calculateBase, type BaseCalculationInput, type RoomDailyOutput } from './calculateBase';
import { activeBaseSkills } from './activeBaseSkills';
import { hasNamedSkill } from './specialSkillKeys';
import type { BaseAssignments, FactoryProducts, SlotAssignment } from './baseTypes';

/**
 * A chronological base simulation: the clock that the snapshot calculator lacks.
 *
 * `calculateBase` answers "at this instant, with these operators at this Morale, how fast
 * does every room produce and every operator drain or recover?". This module owns time:
 * it steps from event to event (a login, an operator reaching a Morale threshold, a room's
 * storage filling), asks the calculator for the rates that hold until the next event, and
 * integrates them. No skill is modeled here; every number comes from the calculator, so
 * its scenario regressions keep covering the arithmetic.
 *
 * Between events the rates are exact constants, because the calculator reads current Morale
 * only through the thresholds below: 0 exhausted, 12 Ling/Dusk, 18/20 dorm_rec_all&tired,
 * 24 full. building_data has other Morale conditions, which do not move these rates: Totter's
 * per-4-points difference is averaged over the login window from full, like ramp skills;
 * workshop dorm counts (4/12/20 or less) change crafts, which are not simulated; the
 * 16-Morale clue guarantees are reception events. See docs/development/base-optimizer.md.
 */

/** Every Morale value at which calculateBase's rates can change. */
export const MORALE_THRESHOLDS = [0, 12, 18, 20, 24] as const;
const FULL = 24;
const EPS = 1e-9;
/** Operators whose skill climbs with continuous time worked (the handlers that read rampStartHours). */
const RAMP_OPERATORS = new Set(['Fang', 'Kroos', 'Scene', 'Ceobe', 'Aroma', 'Mechanist', 'Spuria', 'Ines']);

export interface SimulationShift {
  /** The complete staffing placed at this shift's first login. */
  assignments: BaseAssignments;
  factoryProducts: FactoryProducts;
  /** How many login intervals the shift stays in. Logins inside it only collect. Default 1. */
  logins?: number;
  /** Explicit shift duration; collects at each login and at the shift boundary. */
  hours?: number;
  settings?: Pick<SimulationBase, 'dormitoryAmbience' | 'clueExchangeActive' | 'moraleAbove12' | 'trainingTarget' | 'workshopSettings'>;
  /** Operators the player takes out and puts back at this login although the staffing
   * keeps them in the same room. Only matters for on-assignment effects (Fiammetta). */
  reseat?: string[];
  /** Workers who stay at their post but are taken to the dorm slot before Fiammetta and put back at this
   * login. If Fiammetta is in a dorm at full Morale she swaps with the neediest of them (lowest Morale). */
  refill?: string[];
}

export type SimulationBase = Omit<BaseCalculationInput, 'assignments' | 'factoryProducts' | 'importedMorale' | 'loginInterval' | 'swapPolicy'>;

export interface SimulationInput {
  base: SimulationBase;
  /** Shift i starts at the i-th staffing change; the list repeats. */
  shifts: SimulationShift[];
  /** Hours between logins: 6, 12, 18 or 24 on the planner page; any positive value works. */
  loginInterval: number;
  /** Morale before the first login, displayed units. Missing operators start full. */
  initialMorale?: Record<string, number>;
  /** Give up looking for a repeating cycle after this many days. Default 30. */
  maxDays?: number;
  /** Run exactly this many cycles and report the last, for inspecting the first days. */
  fixedCycles?: number;
  /** Spend the drones the Power Plants make at every login, on the staffed Trading Post or Factory where a drone is worth most.
   * One drone removes 3 minutes of a room's BASE production time (PRTS); base skills do not apply to it. Default off. */
  drones?: boolean;
  /** What one unit of each output is worth when choosing where drones go. Default: 1 LMD, 1 EXP, 500 per Precious Metal made. */
  droneWeights?: { lmd: number; exp: number; goldMade: number };
  /** Fund the gold: drones first make up a gold deficit, and Trading Posts take them only as far as gold can be sold.
   * `externalGold` is outside gold per day. Without this, drones go where raw weighted output is highest. */
  droneFunding?: { externalGold: number };
}

export interface DailyOutput { exp: number; goldMade: number; goldSold: number; lmd: number; goldFreeLmd?: number }

export interface SimulationEvent {
  /** Hours since the start of the reported cycle. */
  time: number;
  kind: 'login' | 'exhausted' | 'storageFull' | 'fiammettaSwap' | 'fiammettaSkipped' | 'drones';
  room?: string;
  operators?: string[];
  detail: string;
}

export interface RoomSummary {
  /** Per day over the reported cycle. */
  output: DailyOutput;
  /** Hours per day the room sat with full storage waiting for a login. */
  idleFullHours: number;
  /** Hours per day the room had at least one exhausted worker. */
  exhaustedHours: number;
}

export interface SimulationResult {
  /** The state repeats exactly every `periodCycles` cycles (Morale and Fiammetta's refill turn). */
  periodic: boolean;
  cycleHours: number;
  /** Cycles in one repeat: 1, unless a refill rotation lines up with the cycle only every few cycles.
   * perDay and rooms average over all of them; the trace and moraleAtLogins show the last one. */
  periodCycles: number;
  /** Cycles simulated before the reported one, the warm-up the first logins needed. */
  warmupCycles: number;
  perDay: DailyOutput;
  rooms: Record<string, RoomSummary>;
  /** Morale at the start of the reported cycle, then at every event in it. */
  moraleTrace: Record<string, { time: number; morale: number }[]>;
  moraleAtLogins: Record<string, number>[];
  events: SimulationEvent[];
  warnings: string[];
  /** Mechanics this run relied on that the game tables do not settle. */
  caveats: string[];
  /** calculateBase calls made, for search budgeting. */
  evaluations: number;
}

interface Rates {
  /** Morale per hour, positive recovers. */
  morale: Record<string, number>;
  roomPerHour: Record<string, RoomDailyOutput>;
  fullTime: Record<string, number | null>;
  /** Operators placed outside dorms and the workshop, by room. */
  workers: Record<string, string[]>;
  /** Drones made per hour, and where one can be spent (only with SimulationInput.drones). */
  dronesPerHour?: number;
  droneTargets?: DroneTarget[];
}
/** Hours of base production one drone removes, and the most drones one login can usefully put into one room
 * (one Pure Gold, one Battle Record or one order in progress). */
const DRONE_HOURS = 3 / 60;
const DRONE_ROOM_CAP = { factoryGold: 24, factoryExp: 60, tradingPost: 80 };

export interface DroneTarget { room: string; exp: number; goldMade: number; goldSold: number; extraLmd: number; cap: number }
type DroneCalc = { rooms: Record<string, { droneRate?: number | null; facilityBreakdown?: { effectiveProductivity?: number } | null } | undefined>; roomDailyOutput: Record<string, RoomDailyOutput> };

/** Drones made per hour: 10, times 1 plus the drone rates of the staffed Power Plants. */
export function dronesPerHour(result: DroneCalc, staffedPowerPlants: string[]): number {
  return 10 * (1 + [...new Set(staffedPowerPlants)].reduce((n, room) => n + (result.rooms[room]?.droneRate ?? 0), 0));
}

/** Where a drone can go and what one gives: 3 minutes of the room's BASE throughput (its rate with the skills taken out). */
export function droneTargets(result: DroneCalc, workedRooms: string[], kindOf: Record<string, string>, factoryProducts: Readonly<Record<string, string | null | undefined>>): DroneTarget[] {
  return workedRooms.flatMap(room => {
    const out = result.roomDailyOutput[room];
    const eff = result.rooms[room]?.facilityBreakdown?.effectiveProductivity;
    if (!out || !eff || (kindOf[room] !== 'factory' && kindOf[room] !== 'tradingPost')) return [];
    const base = (perDay: number) => DRONE_HOURS * (perDay / 24) / eff;
    const cap = kindOf[room] === 'tradingPost' ? DRONE_ROOM_CAP.tradingPost : factoryProducts[room] === 'Precious Metals' ? DRONE_ROOM_CAP.factoryGold : DRONE_ROOM_CAP.factoryExp;
    return [{ room, exp: base(out.exp), goldMade: base(out.goldMade), goldSold: base(out.goldSold), extraLmd: base(out.extraLmd), cap }];
  });
}

/** What a drone is worth in the caller's weighted units. */
export const droneWorth = (t: { exp: number; goldMade: number; goldSold: number; extraLmd: number }, w: { lmd: number; exp: number; goldMade: number }) =>
  (t.goldSold * 500 + t.extraLmd) * w.lmd + t.exp * w.exp + t.goldMade * w.goldMade;

/**
 * Spend `drones` across the targets. With `goldSurplus` null every drone goes where it is worth most in raw weighted
 * output. With a number (gold made plus outside gold, less gold the Trading Posts will sell, over the window) the gold
 * is funded: a deficit is covered first by Factories making Precious Metals, and Trading Posts take drones only as far
 * as the surplus can be sold.
 */
export function allocateDrones(targets: DroneTarget[], drones: number, w: { lmd: number; exp: number; goldMade: number }, goldSurplus: number | null): { target: DroneTarget; use: number }[] {
  const spent: { target: DroneTarget; use: number }[] = [];
  let left = drones, surplus = goldSurplus;
  const put = (target: DroneTarget, use: number) => { if (use > 1e-9) { spent.push({ target, use }); left -= use; surplus = surplus === null ? null : surplus + use * (target.goldMade - target.goldSold); } };
  if (surplus === null) {
    for (const t of [...targets].sort((x, y) => droneWorth(y, w) - droneWorth(x, w))) if (droneWorth(t, w) > 0) put(t, Math.min(left, t.cap));
    return spent;
  }
  if (surplus < 0) for (const t of targets.filter(x => x.goldMade > 0).sort((x, y) => y.goldMade - x.goldMade)) {
    if (surplus >= 0) break;
    put(t, Math.min(left, t.cap, -surplus / t.goldMade));
  }
  // What a drone adds now: Trading Posts only while gold is there to sell, Factories their EXP.
  const fundedWorth = (t: DroneTarget) => (t.goldSold > 0 || t.extraLmd > 0 ? (surplus! > 0 ? (t.goldSold * 500 + t.extraLmd) * w.lmd : 0) : t.exp * w.exp);
  for (const t of [...targets].sort((x, y) => fundedWorth(y) - fundedWorth(x))) {
    if (left <= 0) break;
    if (fundedWorth(t) <= 0) continue;
    const room = spent.filter(x => x.target.room === t.room).reduce((n, x) => n + x.use, 0);
    const sellable = t.goldSold > 0 ? Math.max(0, surplus!) / t.goldSold : Infinity;
    put(t, Math.min(left, t.cap - room, sellable));
  }
  return spent;
}

const zeroOutput = (): DailyOutput => ({ exp: 0, goldMade: 0, goldSold: 0, lmd: 0, goldFreeLmd: 0 });
const lmdOf = (o: RoomDailyOutput) => o.goldSold * 500 + o.extraLmd + o.pepeLmd;

/** Which side of every threshold a Morale value is on; equal rates share a key. */
function moraleBin(m: number): number {
  let bin = 0;
  for (const t of MORALE_THRESHOLDS) bin = bin * 3 + (m < t ? 0 : m === t ? 1 : 2);
  return bin;
}

function snap(m: number): number {
  for (const t of MORALE_THRESHOLDS) if (Math.abs(m - t) < EPS) return t;
  return Math.min(FULL, Math.max(0, m));
}

function placements(assignments: BaseAssignments): { name: string; room: string; index: number; slot: SlotAssignment }[] {
  return Object.entries(assignments).flatMap(([room, slots]) => (slots ?? []).flatMap((slot, index) => slot ? [{ name: slot.operatorName, room, index, slot }] : []));
}

export function simulateBase(input: SimulationInput): SimulationResult {
  const { base, shifts, loginInterval } = input;
  if (!(loginInterval > 0)) throw new Error('loginInterval must be positive');
  if (!shifts.length) throw new Error('A simulation needs at least one shift');
  const kindOf = Object.fromEntries(base.facilities.map(f => [f.id, f.kind]));
  const windows = shifts.map(s => {
    const hours = s.hours ?? Math.max(1, Math.floor(s.logins ?? 1)) * loginInterval;
    if (!Number.isFinite(hours) || hours <= 0) throw new Error('Shift hours must be positive');
    return Array.from({ length: Math.ceil(hours / loginInterval) }, (_, i) => Math.min(loginInterval, hours - i * loginInterval));
  });
  const cycleHours = windows.flat().reduce((a, b) => a + b, 0);
  const maxCycles = input.fixedCycles ?? Math.max(2, Math.ceil((input.maxDays ?? 30) * 24 / cycleHours));
  const warnings = new Set<string>();
  const caveats = new Set<string>([
    'Skills that ramp up with time worked (for example "+1% per hour") are averaged over each login window starting from the hours that operator has already worked in the same room without a break, so staying in longer is rewarded. Totter\'s Morale-difference skills still use the calculator\'s average over one login interval, starting fresh.',
    'Workshop crafts, training, clues and recruitment are not part of the simulated output; drones are only counted when asked for.',
  ]);
  const operatorByName = new Map(base.operators.map(o => [o.name, o]));
  const formerNames = new Map(base.operators.map(o => [o.name, o.aliases ?? []]));

  shifts.forEach((shift, i) => {
    const seen = new Set<string>();
    for (const p of placements(shift.assignments)) {
      if (!kindOf[p.room]) warnings.add(`Shift ${i + 1} staffs ${p.room}, which this layout does not have.`);
      if (seen.has(p.name)) warnings.add(`Shift ${i + 1} places ${p.name} twice.`);
      if (!operatorByName.has(p.name)) warnings.add(`${p.name} is not a known operator.`);
      seen.add(p.name);
    }
  });

  let evaluations = 0;
  const cache = new Map<string, Rates>();
  // Hours each operator has worked without a break in their current room; persists across cycles like Morale.
  const worked: Record<string, number> = {};
  // Fixed round-robin turn for each distinct refill list, so every member gets a bounded worst-case wait --
  // a reactive "always refill whoever is lowest" can let a slower-draining member starve while attention
  // keeps cycling to whichever of the others currently reads lowest, even though a fixed rotation would
  // have kept everyone afloat with the same total number of refills.
  const refillTurn = new Map<string, number>();
  function ratesFor(shiftIndex: number, morale: Record<string, number>): Rates {
    const shift = shifts[shiftIndex];
    const placed = placements(shift.assignments);
    const rampStart = Object.fromEntries(placed.filter(p => RAMP_OPERATORS.has(p.name) && kindOf[p.room] !== 'dormitory').map(p => [p.name, Math.round((worked[p.name] ?? 0) * 2) / 2]));
    const key = `${shiftIndex}|${placed.map(p => moraleBin(morale[p.name])).join(',')}|${Object.entries(rampStart).map(([n, h]) => `${n}:${h}`).join(',')}`;
    const hit = cache.get(key);
    if (hit) return hit;
    // Dorm effects read each slot's own Morale; working rooms read importedMorale.
    const assignments: BaseAssignments = Object.fromEntries(Object.entries(shift.assignments).map(([room, slots]) =>
      [room, (slots ?? []).map(s => s ? { ...s, morale: morale[s.operatorName] } : null)]));
    const importedMorale = Object.fromEntries(placed.map(p => [p.name, morale[p.name]]));
    const result = calculateBase({ ...base, ...shift.settings, assignments, factoryProducts: shift.factoryProducts, importedMorale, rampStartHours: rampStart, loginInterval, swapPolicy: 'onLogin' });
    evaluations++;
    const rates: Rates = { morale: {}, roomPerHour: {}, fullTime: {}, workers: {} };
    for (const p of placed) {
      const kind = kindOf[p.room];
      if (kind === 'dormitory') {
        const r = result.dormitoryRecoveryByFacility[p.room]?.find(x => x.name === p.name);
        rates.morale[p.name] = r ? r.base + r.bonus : 0;
      } else if (kind === 'workshop' || !kind) {
        // Workshop Morale is spent per craft, which this simulation does not schedule.
        rates.morale[p.name] = 0;
      } else {
        const room = result.rooms[p.room];
        const drain = room?.perOperatorMorale?.[p.name] ?? room?.combinedMoraleRate ?? 0;
        rates.morale[p.name] = morale[p.name] <= 0 ? 0 : -drain;
        (rates.workers[p.room] ??= []).push(p.name);
      }
    }
    for (const [room, out] of Object.entries(result.roomDailyOutput)) {
      rates.roomPerHour[room] = { exp: out.exp / 24, goldMade: out.goldMade / 24, goldSold: out.goldSold / 24, extraLmd: out.extraLmd / 24, pepeLmd: out.pepeLmd / 24 };
      const full = result.rooms[room]?.fullTime;
      rates.fullTime[room] = full !== null && full !== undefined && Number.isFinite(full) && full > 0 ? full : null;
    }
    if (input.drones) {
      rates.dronesPerHour = dronesPerHour(result, placed.filter(p => kindOf[p.room] === 'powerPlant').map(p => p.room));
      rates.droneTargets = droneTargets(result, Object.keys(rates.workers), kindOf, shift.factoryProducts);
    }
    cache.set(key, rates);
    return rates;
  }

  const hasFiammettaSwap = (slot: SlotAssignment) => {
    const op = operatorByName.get(slot.operatorName);
    return !!op && hasNamedSkill(slot.operatorName, activeBaseSkills(op, 'Dormitory', slot.eliteLevel, base.skillSlots, slot.level), 'Fiammetta|Communal Suffering', formerNames.get(slot.operatorName));
  };

  // Morale persists across cycles; storage is emptied at every login.
  const morale: Record<string, number> = {};
  for (const s of shifts) for (const p of placements(s.assignments)) morale[p.name] ??= snap(input.initialMorale?.[p.name] ?? FULL);

  interface CycleLog {
    output: Record<string, RoomDailyOutput>; idleFull: Record<string, number>; exhausted: Record<string, number>;
    trace: Record<string, { time: number; morale: number }[]>; atLogins: Record<string, number>[]; events: SimulationEvent[];
  }
  function runCycle(previousRooms: Map<string, string>): { log: CycleLog; rooms: Map<string, string> } {
    const log: CycleLog = { output: {}, idleFull: {}, exhausted: {}, trace: {}, atLogins: [], events: [] };
    const record = (time: number) => { for (const [name, m] of Object.entries(morale)) (log.trace[name] ??= []).push({ time, morale: m }); };
    let time = 0, roomOf = previousRooms;
    shifts.forEach((shift, shiftIndex) => {
      // Staffing change at this shift's first login.
      const placed = placements(shift.assignments);
      const nextRoomOf = new Map(placed.map(p => [p.name, p.room]));
      for (const p of placed) {
        if (kindOf[p.room] !== 'dormitory' || !hasFiammettaSwap(p.slot)) continue;
        const arrived = roomOf.get(p.name) !== p.room || shift.reseat?.includes(p.name);
        if (!arrived) continue;
        caveats.add('Fiammetta\'s Communal Suffering is modeled as swapping with the operator in the dorm slot before hers, when she is placed (or re-seated) at full Morale. The game text says "the previous Operator assigned to that Dormitory"; the slot order standing for assignment order is an assumption.');
        const previous = (shift.assignments[p.room] ?? []).slice(0, p.index).filter((s): s is SlotAssignment => !!s).pop();
        if (morale[p.name] !== FULL || !previous) {
          log.events.push({ time, kind: 'fiammettaSkipped', room: p.room, operators: [p.name], detail: morale[p.name] !== FULL ? `${p.name} is not at full Morale (${morale[p.name].toFixed(2)}), so no swap.` : `No operator is seated before ${p.name}, so no swap.` });
          continue;
        }
        const other = previous.operatorName;
        log.events.push({ time, kind: 'fiammettaSwap', room: p.room, operators: [p.name, other], detail: `${p.name} swaps her full Morale with ${other} (${morale[other].toFixed(2)}).` });
        [morale[p.name], morale[other]] = [morale[other], morale[p.name]];
      }
      if (shift.refill?.length) {
        const fiammetta = placed.find(p => kindOf[p.room] === 'dormitory' && hasFiammettaSwap(p.slot));
        const working = new Set(placed.filter(p => kindOf[p.room] !== 'dormitory').map(p => p.name));
        const key = shift.refill.join('|');
        const turn = refillTurn.get(key) ?? 0;
        // A fixed rotation through the list: each opportunity is this member's turn, in order, regardless of
        // who currently reads lowest. The turn always advances, even when this member turns out not to need
        // it (already full) -- that is a real wasted visit, exactly as it would be for a player on a schedule.
        refillTurn.set(key, (turn + 1) % shift.refill.length);
        const scheduled = shift.refill[turn % shift.refill.length];
        const needy = working.has(scheduled) && morale[scheduled] !== undefined && morale[scheduled] < FULL ? scheduled : undefined;
        if (fiammetta && needy && morale[fiammetta.name] === FULL) {
          caveats.add('A worker refilled in place is modeled as taken to the dorm slot before Fiammetta and put straight back at the login, so the swap costs no working time. The game text swaps with "the previous Operator assigned to that Dormitory"; that the swap fires on placement is an assumption. Several workers on the same refill list are visited in a fixed rotation (not "whichever is lowest"), so each gets a bounded worst-case wait.');
          log.events.push({ time, kind: 'fiammettaSwap', room: fiammetta.room, operators: [fiammetta.name, needy], detail: `${fiammetta.name} swaps her full Morale with ${needy} (${morale[needy].toFixed(2)}), who goes straight back to work.` });
          [morale[fiammetta.name], morale[needy]] = [morale[needy], morale[fiammetta.name]];
        }
      }
      // Fiammetta already seated at full Morale, and someone is put into her dorm after her: the swap fires
      // at once, with whoever arrives (the player puts the most tired in first).
      for (const f of placed.filter(p => kindOf[p.room] === 'dormitory' && hasFiammettaSwap(p.slot))) {
        if (morale[f.name] !== FULL || roomOf.get(f.name) !== f.room || shift.reseat?.includes(f.name)) continue;
        const target = placed.filter(q => q.room === f.room && q.name !== f.name && roomOf.get(q.name) !== q.room && morale[q.name] < FULL).sort((x, y) => morale[x.name] - morale[y.name])[0];
        if (!target) continue;
        caveats.add('Fiammetta swaps Morale at once with whoever is put into her dorm while she is at full Morale, and with the operator already there when she is put in; the most tired arrival is assumed to go in first.');
        log.events.push({ time, kind: 'fiammettaSwap', room: f.room, operators: [f.name, target.name], detail: `${f.name} swaps her full Morale with ${target.name} (${morale[target.name].toFixed(2)}), who has just been put into her dorm.` });
        [morale[f.name], morale[target.name]] = [morale[target.name], morale[f.name]];
      }
      // A stint continues only in the same working room; a move, a rest or a spell unassigned starts it over.
      for (const name of Object.keys(worked)) if (!placed.some(p => p.name === name && kindOf[p.room] !== 'dormitory' && roomOf.get(name) === p.room)) worked[name] = 0;
      roomOf = nextRoomOf;
      for (let login = 0; login < windows[shiftIndex].length; login++) {
        const windowHours = windows[shiftIndex][login];
        // Every login collects, so storage starts empty.
        log.atLogins.push({ ...morale });
        log.events.push({ time, kind: 'login', detail: login === 0 ? `Shift ${shiftIndex + 1} goes in.` : 'Collect.' });
        record(time);
        const fill: Record<string, number> = {};
        // Reported when a worker spends time at 0: reaching 0 exactly at a login and then
        // resting loses nothing, and starting a window at 0 in a working room does.
        const exhaustedSeen = new Set<string>();
        let left = windowHours;
        let lastRates: Rates | null = null;
        while (left > EPS) {
          const rates = ratesFor(shiftIndex, morale);
          lastRates = rates;
          const segmentStart = time + windowHours - left;
          for (const [room, names] of Object.entries(rates.workers)) for (const n of names) {
            if (morale[n] === 0 && !exhaustedSeen.has(n)) {
              exhaustedSeen.add(n);
              log.events.push({ time: segmentStart, kind: 'exhausted', room, operators: [n], detail: `${n} is at 0 Morale and stops working.` });
            }
          }
          let dt = left;
          for (const [name, r] of Object.entries(rates.morale)) {
            const m = morale[name];
            if (r < 0) { const below = [...MORALE_THRESHOLDS].reverse().find(t => t < m); if (below !== undefined) dt = Math.min(dt, (m - below) / -r); }
            if (r > 0) { const above = MORALE_THRESHOLDS.find(t => t > m); if (above !== undefined) dt = Math.min(dt, (above - m) / r); }
          }
          for (const [room, full] of Object.entries(rates.fullTime)) {
            if (full !== null && (fill[room] ?? 0) < 1) dt = Math.min(dt, (1 - (fill[room] ?? 0)) * full);
          }
          dt = Math.max(dt, EPS);
          for (const [room, perHour] of Object.entries(rates.roomPerHour)) {
            const out = (log.output[room] ??= { exp: 0, goldMade: 0, goldSold: 0, extraLmd: 0, pepeLmd: 0 });
            if ((fill[room] ?? 0) >= 1) { log.idleFull[room] = (log.idleFull[room] ?? 0) + dt; continue; }
            out.exp += perHour.exp * dt; out.goldMade += perHour.goldMade * dt; out.goldSold += perHour.goldSold * dt;
            out.extraLmd += perHour.extraLmd * dt; out.pepeLmd += perHour.pepeLmd * dt;
            const full = rates.fullTime[room];
            if (full !== null) {
              fill[room] = (fill[room] ?? 0) + dt / full;
              if (fill[room] >= 1 - EPS) {
                fill[room] = 1;
                log.events.push({ time: time + windowHours - left + dt, kind: 'storageFull', room, detail: `${room} storage is full until the next login.` });
              }
            }
          }
          for (const [room, names] of Object.entries(rates.workers)) {
            if (names.some(n => morale[n] === 0)) log.exhausted[room] = (log.exhausted[room] ?? 0) + dt;
          }
          for (const [name, r] of Object.entries(rates.morale)) morale[name] = snap(morale[name] + r * dt);
          left -= dt;
          record(time + windowHours - Math.max(0, left));
        }
        if (input.drones && lastRates?.droneTargets && lastRates.dronesPerHour) {
          // The drones made this window go in at the next login, on the rooms that are producing.
          const w = input.droneWeights ?? { lmd: 1, exp: 1, goldMade: 500 };
          const made = lastRates.dronesPerHour * windowHours;
          const perHour = Object.values(lastRates.roomPerHour);
          // Gold made less gold the Trading Posts sell over this window, plus outside gold (per day / 24 per hour).
          const surplus = input.droneFunding ? (perHour.reduce((n, o) => n + o.goldMade - o.goldSold, 0) + input.droneFunding.externalGold / 24) * windowHours : null;
          let spent = 0;
          for (const { target, use } of allocateDrones(lastRates.droneTargets, made, w, surplus)) {
            const out = (log.output[target.room] ??= { exp: 0, goldMade: 0, goldSold: 0, extraLmd: 0, pepeLmd: 0 });
            out.exp += target.exp * use; out.goldMade += target.goldMade * use; out.goldSold += target.goldSold * use; out.extraLmd += target.extraLmd * use;
            spent += use;
          }
          const drones = made - spent;
          log.events.push({ time: time + windowHours, kind: 'drones', detail: `${made.toFixed(0)} drones made; ${(made - drones).toFixed(0)} spent.` });
          caveats.add('Drones are spent at every login on the staffed Trading Post or Factory where each is worth most, 3 minutes of base production apiece (base skills do not apply), up to one item or order in progress per room. Trading Post drones use the room\'s average order rate; storage limits and the drone stock cap (235) are not applied.');
        }
        time += windowHours;
        // Everyone still on their feet has now worked this window as well.
        for (const p of placed) if (kindOf[p.room] !== 'dormitory' && kindOf[p.room] !== 'workshop' && morale[p.name] > EPS) worked[p.name] = (worked[p.name] ?? 0) + windowHours;
      }
    });
    return { log, rooms: roomOf };
  }

  // Fiammetta visits a refill list in a fixed rotation that carries over from cycle to cycle, so with L names
  // and k visits a cycle the whole state repeats every L / gcd(L, k) cycles, not every cycle: three core workers
  // over two staffing changes line up again only after three cycles. Comparing Morale one cycle apart would call
  // that steady plan unsettled forever (and the optimizer would reject it), so compare that many cycles apart and
  // average the output over all of them.
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const visits = new Map<string, { length: number; perCycle: number }>();
  for (const s of shifts) if (s.refill?.length) {
    const v = visits.get(s.refill.join('|')) ?? { length: s.refill.length, perCycle: 0 };
    v.perCycle++;
    visits.set(s.refill.join('|'), v);
  }
  const period = [...visits.values()].reduce((p, v) => { const n = v.length / gcd(v.length, v.perCycle); return p / gcd(p, n) * n; }, 1);
  const turns = () => JSON.stringify([...refillTurn.entries()].sort());

  let rooms = new Map<string, string>();
  const starts: { morale: Record<string, number>; turns: string }[] = [];
  const window: CycleLog[] = [];
  let cycle = 0, periodic = false;
  for (; cycle < maxCycles; cycle++) {
    starts.push({ morale: { ...morale }, turns: turns() });
    const ran = runCycle(rooms);
    rooms = ran.rooms;
    window.push(ran.log);
    if (window.length > period) window.shift();
    const ref = starts.length >= period ? starts[starts.length - period] : null;
    periodic = !!ref && ref.turns === turns() && Object.keys(morale).every(n => Math.abs(morale[n] - ref.morale[n]) < 1e-7);
    // A repeat also needs the same staffing to carry into the next cycle, which holds
    // once one cycle has run (the last shift precedes the first from then on).
    if (periodic && cycle >= period && !input.fixedCycles) break;
  }
  if (cycle === maxCycles) cycle--;
  if (!periodic && !input.fixedCycles) warnings.add(`Morale did not settle into a repeating cycle within ${input.maxDays ?? 30} days; the last cycle is shown.`);
  const final = window[window.length - 1];
  const perDayFactor = 24 / (cycleHours * window.length);
  const roomSummaries: Record<string, RoomSummary> = {};
  const perDay = zeroOutput();
  for (const room of new Set(window.flatMap(l => [...Object.keys(l.output), ...Object.keys(l.exhausted)]))) {
    const o = { exp: 0, goldMade: 0, goldSold: 0, extraLmd: 0, pepeLmd: 0 };
    let idleFull = 0, exhausted = 0;
    for (const l of window) {
      const x = l.output[room];
      if (x) { o.exp += x.exp; o.goldMade += x.goldMade; o.goldSold += x.goldSold; o.extraLmd += x.extraLmd; o.pepeLmd += x.pepeLmd; }
      idleFull += l.idleFull[room] ?? 0;
      exhausted += l.exhausted[room] ?? 0;
    }
    const output = { exp: o.exp * perDayFactor, goldMade: o.goldMade * perDayFactor, goldSold: o.goldSold * perDayFactor, lmd: lmdOf(o) * perDayFactor, goldFreeLmd: o.pepeLmd * perDayFactor };
    roomSummaries[room] = { output, idleFullHours: idleFull * perDayFactor, exhaustedHours: exhausted * perDayFactor };
    perDay.exp += output.exp; perDay.goldMade += output.goldMade; perDay.goldSold += output.goldSold; perDay.lmd += output.lmd;
    perDay.goldFreeLmd! += output.goldFreeLmd;
  }
  // The trace and log stay one cycle long (what the page draws); exhaustion in any cycle of the repeat still counts.
  const earlierExhaustion = window.slice(0, -1).flatMap(l => l.events.filter(e => e.kind === 'exhausted'));
  return {
    periodic, cycleHours, periodCycles: window.length, warmupCycles: cycle, perDay, rooms: roomSummaries,
    moraleTrace: final.trace, moraleAtLogins: final.atLogins, events: [...earlierExhaustion, ...final.events],
    warnings: [...warnings], caveats: [...caveats], evaluations,
  };
}
