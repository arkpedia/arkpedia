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
}

export interface DailyOutput { exp: number; goldMade: number; goldSold: number; lmd: number; goldFreeLmd?: number }

export interface SimulationEvent {
  /** Hours since the start of the reported cycle. */
  time: number;
  kind: 'login' | 'exhausted' | 'storageFull' | 'fiammettaSwap' | 'fiammettaSkipped';
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
  /** The cycle reported below repeats exactly (Morale at its start equals Morale at its end). */
  periodic: boolean;
  cycleHours: number;
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
    'Skills that ramp up with time worked (for example "+1% per hour") and Totter\'s Morale-difference skills use the calculator\'s average over one login interval, starting fresh, not the hours or Morale since that operator was placed.',
    'Workshop crafts, training, clues, recruitment and drones are not part of the simulated output.',
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
  function ratesFor(shiftIndex: number, morale: Record<string, number>): Rates {
    const shift = shifts[shiftIndex];
    const placed = placements(shift.assignments);
    const key = `${shiftIndex}|${placed.map(p => moraleBin(morale[p.name])).join(',')}`;
    const hit = cache.get(key);
    if (hit) return hit;
    // Dorm effects read each slot's own Morale; working rooms read importedMorale.
    const assignments: BaseAssignments = Object.fromEntries(Object.entries(shift.assignments).map(([room, slots]) =>
      [room, (slots ?? []).map(s => s ? { ...s, morale: morale[s.operatorName] } : null)]));
    const importedMorale = Object.fromEntries(placed.map(p => [p.name, morale[p.name]]));
    const result = calculateBase({ ...base, ...shift.settings, assignments, factoryProducts: shift.factoryProducts, importedMorale, loginInterval, swapPolicy: 'onLogin' });
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
        while (left > EPS) {
          const rates = ratesFor(shiftIndex, morale);
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
        time += windowHours;
      }
    });
    return { log, rooms: roomOf };
  }

  let rooms = new Map<string, string>();
  let start = { ...morale };
  let cycle = 0, periodic = false, log: CycleLog | null = null;
  for (; cycle < maxCycles; cycle++) {
    const ran = runCycle(rooms);
    log = ran.log; rooms = ran.rooms;
    const names = Object.keys(morale);
    periodic = names.every(n => Math.abs(morale[n] - start[n]) < 1e-7);
    // A repeat also needs the same staffing to carry into the next cycle, which holds
    // once one cycle has run (the last shift precedes the first from then on).
    if (periodic && cycle > 0 && !input.fixedCycles) break;
    start = { ...morale };
  }
  if (cycle === maxCycles) cycle--;
  if (!periodic && !input.fixedCycles) warnings.add(`Morale did not settle into a repeating cycle within ${input.maxDays ?? 30} days; the last cycle is shown.`);
  const final = log!;
  const perDayFactor = 24 / cycleHours;
  const roomSummaries: Record<string, RoomSummary> = {};
  const perDay = zeroOutput();
  for (const room of new Set([...Object.keys(final.output), ...Object.keys(final.exhausted)])) {
    const o = final.output[room] ?? { exp: 0, goldMade: 0, goldSold: 0, extraLmd: 0, pepeLmd: 0 };
    const output = { exp: o.exp * perDayFactor, goldMade: o.goldMade * perDayFactor, goldSold: o.goldSold * perDayFactor, lmd: lmdOf(o) * perDayFactor, goldFreeLmd: o.pepeLmd * perDayFactor };
    roomSummaries[room] = { output, idleFullHours: (final.idleFull[room] ?? 0) * perDayFactor, exhaustedHours: (final.exhausted[room] ?? 0) * perDayFactor };
    perDay.exp += output.exp; perDay.goldMade += output.goldMade; perDay.goldSold += output.goldSold; perDay.lmd += output.lmd;
    perDay.goldFreeLmd! += output.goldFreeLmd;
  }
  return {
    periodic, cycleHours, warmupCycles: cycle, perDay, rooms: roomSummaries,
    moraleTrace: final.trace, moraleAtLogins: final.atLogins, events: final.events,
    warnings: [...warnings], caveats: [...caveats], evaluations,
  };
}
