import { BaseOperator, BaseSkill } from '../operators/operatorTypes';
import {
  runFactorySearch,
  runTradingPostSearch,
  FACTORY_CANDIDATES_ELITE_ZERO,
  TP_CANDIDATES_ELITE_ZERO,
  FACTORY_CANDIDATES,
  TP_CANDIDATES,
  ConsolidatedGroup,
  Candidate,
  DynamicContextOverrides,
  bestSkillPerSlot,
} from './optimizerLogic';
import { calcDeadTime, type ControlCenterEffects } from './baseProductivity';
import { skillEffectEntry } from './baseSkillEffects';
import { evaluateSkill, type SkillContribution } from './skillEvaluation';
import { toBaseRosters, type BaseRosters } from './baseGroupRosters';

// Was `const allOperators = getAllOperators();` -- same fix as
// optimizerLogic.ts, for the same reason (server-only fs access at
// module load, blocking any client-side import). This is a SEPARATE
// module from optimizerLogic.ts though, so it needs its own injected
// copy -- base.tsx calls both initializers.
let allOperators: BaseOperator[] = [];
let rosters: BaseRosters = toBaseRosters({});
export function initializeRotationExperimentData(operators: BaseOperator[], groupRosters: BaseRosters) {
  allOperators = operators;
  rosters = groupRosters;
}

export type RosterMode = 'eliteZero' | 'eliteTwo';

/** eliteZero: only Base-tier skills, this experiment's original premise
 * (every operator owned, nobody promoted). eliteTwo: the best available
 * tier per slot -- optimizerLogic.ts's bestSkillPerSlot, the grouping
 * Factory/Trading Post use, applied here to every facility type, matching
 * this codebase's normal "assume max investment" convention for the
 * comparison experiment. */
function skillsFor(operatorName: string, facility: string, mode: RosterMode): BaseSkill[] {
  const op = allOperators.find((o) => o.name === operatorName);
  if (!op || !op.baseSkills) return [];
  const relevant = op.baseSkills.filter((s) => s.facility === facility && s.name);
  if (mode === 'eliteZero') {
    return relevant.filter((s) => !s.eliteLevel || s.eliteLevel === 'Base' || s.eliteLevel === 'Level 30');
  }
  return bestSkillPerSlot(relevant);
}

/** Login cadence -- the person can only act every 12 hours, so any
 * computed window (how long a placement lasts before someone needs
 * rotating) gets snapped DOWN to the nearest multiple of this, since
 * there's no way to intervene between logins even if the real
 * morale-driven number would allow it. */
const LOGIN_INTERVAL_HOURS = 12;
function snapDownToLogin(hours: number): number {
  if (!isFinite(hours) || hours <= 0) return 0;
  return Math.floor(hours / LOGIN_INTERVAL_HOURS) * LOGIN_INTERVAL_HOURS;
}

export interface RoomAssignment {
  label: string;
  workingSet: string[]; // currently in the room, producing
  restingSet: string[]; // the swap-in replacement, currently in the Dormitory -- NEVER overlaps workingSet, or any other room's operators (see the shared `used` pool in runRotationExperiment)
  metricLabel: string; // e.g. "LMD/day", "Clue search speed", "HR contacting speed"
  metricValue: number; // for the WORKING set specifically
  restingMetricValue: number; // the resting/replacement set's own output -- typically lower, since it's whatever's left after the working set already claimed the best available operators
  workWindowHours: number; // real (unsnapped) time until the first working-set operator hits 0 Morale
  loginSnappedWorkWindowHours: number; // the above, snapped down to a real actionable login interval
  cycleLoginSnappedHours: number; // this room's OWN full work+rest cycle -- rotates independently of every other facility, not on some shared base-wide schedule
  // Long-run projections -- NOT just metricValue x days, since the room
  // doesn't produce at the working set's rate 100% of the time. Both
  // sets alternate being active in roughly equal proportion over time
  // (each works for its own share of the cycle, then rests while the
  // other takes over), so the true sustained rate is the AVERAGE of the
  // two sets' own output, not the (usually higher) working-set number
  // alone.
  longRunDailyRate: number;
  longRunWeeklyRate: number;
  longRunMonthlyRate: number;
  longRunYearlyRate: number;
}

// ==================== Greedy single-metric room filling ====================
// For rooms without a full combinatorial search built (unlike Factory/
// Trading Post), rank every AVAILABLE (not yet claimed elsewhere) Elite-0
// candidate by their own skill's value for that room and take the top N.
// Correct whenever bonuses are flat and additive per-operator (true for
// the large majority of Reception Room/Office/Power Plant skills),
// understates rooms with real cross-operator synergy the same way
// Factory/Trading Post have.
interface GreedyCandidate {
  operatorName: string;
  value: number;
  description: string | null;
}

function greedyFill(candidates: GreedyCandidate[], slots: number, used: Set<string>): GreedyCandidate[] {
  const available = candidates.filter((c) => !used.has(c.operatorName));
  const chosen = [...available].sort((a, b) => b.value - a.value).slice(0, slots);
  chosen.forEach((c) => used.add(c.operatorName));
  return chosen;
}

/** A skill's own contribution with nothing else placed: the table's flat numbers, every count zero and every
 *  condition false. The greedy fills here rank by this, as they ranked by the plain text before. */
function aloneContribution(operatorName: string, sk: BaseSkill): SkillContribution | null {
  const entry = skillEffectEntry(sk);
  if (!entry) return null;
  return evaluateSkill(entry, { operatorName, roomNames: [operatorName], product: null, count: () => 0, holds: () => false, active: () => false });
}

function receptionRoomCandidates(mode: RosterMode): GreedyCandidate[] {
  const result: GreedyCandidate[] = [];
  for (const op of allOperators) {
    for (const sk of skillsFor(op.name, 'Reception Room', mode)) {
      const value = aloneContribution(op.name, sk)?.clueSpeed ?? 0;
      if (value > 0) result.push({ operatorName: op.name, value, description: sk.description });
    }
  }
  return result;
}

function officeCandidates(mode: RosterMode): GreedyCandidate[] {
  const result: GreedyCandidate[] = [];
  for (const op of allOperators) {
    for (const sk of skillsFor(op.name, 'Office', mode)) {
      const speed = aloneContribution(op.name, sk)?.hrSpeed ?? 0;
      if (speed > 0) result.push({ operatorName: op.name, value: speed, description: sk.description });
    }
  }
  return result;
}

function powerPlantCandidates(mode: RosterMode): GreedyCandidate[] {
  const result: GreedyCandidate[] = [];
  for (const op of allOperators) {
    for (const sk of skillsFor(op.name, 'Power Plant', mode)) {
      const value = aloneContribution(op.name, sk)?.droneRate ?? 0;
      if (value > 0) result.push({ operatorName: op.name, value, description: sk.description });
    }
  }
  return result;
}

// Control Center's three main bonuses (Trading Post/Factory/Clue
// Collection) are "highest single value only, doesn't stack" -- so
// filling its 5 slots isn't about picking the top 5 by any one metric,
// it's about covering each bonus category once with its best AVAILABLE
// operator, then filling remaining slots with the flat, always-stacking
// Morale bonus.
function controlCenterFill(slots: number, used: Set<string>, mode: RosterMode, forceInclude: string[] = []): { operators: string[]; effects: ControlCenterEffects } {
  const chosen = new Set<string>();
  for (const name of forceInclude) {
    if (chosen.size < slots && !used.has(name)) {
      chosen.add(name);
      used.add(name);
    }
  }
  const all: { operatorName: string; c: SkillContribution }[] = [];
  for (const op of allOperators) {
    if (used.has(op.name) && !chosen.has(op.name)) continue;
    for (const sk of skillsFor(op.name, 'Control Center', mode)) {
      const c = aloneContribution(op.name, sk);
      if (c) all.push({ operatorName: op.name, c });
    }
  }
  // Each highest-only pool once, with its best available operator; then the flat, always-stacking Morale.
  for (const pool of ['orderEfficiency', 'factory', 'clue'] as const) {
    let best: { operatorName: string; value: number } | null = null;
    for (const c of all) {
      if (chosen.has(c.operatorName)) continue;
      const v = Math.abs(c.c.cc[pool]);
      if (v && (!best || v > best.value)) best = { operatorName: c.operatorName, value: v };
    }
    if (best && chosen.size < slots) chosen.add(best.operatorName);
  }
  const moraleRanked = all
    .filter((c) => !chosen.has(c.operatorName) && c.c.cc.morale)
    .map((c) => ({ operatorName: c.operatorName, value: c.c.cc.morale }))
    .sort((a, b) => b.value - a.value);
  for (const m of moraleRanked) {
    if (chosen.size >= slots) break;
    chosen.add(m.operatorName);
  }
  const operators = Array.from(chosen);
  operators.forEach((name) => used.add(name));
  const effects: ControlCenterEffects = { tradingPostBonus: 0, factoryBonus: 0, clueCollectionBonus: 0, ccMoraleBonus: 0 };
  for (const { operatorName, c } of all) {
    if (!operators.includes(operatorName)) continue;
    if (Math.abs(c.cc.orderEfficiency) > Math.abs(effects.tradingPostBonus)) effects.tradingPostBonus = c.cc.orderEfficiency;
    if (Math.abs(c.cc.factory) > Math.abs(effects.factoryBonus)) effects.factoryBonus = c.cc.factory;
    if (Math.abs(c.cc.clue) > Math.abs(effects.clueCollectionBonus)) effects.clueCollectionBonus = c.cc.clue;
    effects.ccMoraleBonus += c.cc.morale;
  }
  return { operators, effects };
}

// ==================== Dormitory ====================
// The two dominant shapes, a flat self-recovery rate and a flat bonus to every Operator in the room, ranked
// alone; the full room model (per-operator targets, the highest-only groups) is the calculator's.

function dormitoryCandidates(mode: RosterMode): GreedyCandidate[] {
  const result: GreedyCandidate[] = [];
  for (const op of allOperators) {
    for (const sk of skillsFor(op.name, 'Dormitory', mode)) {
      const c = aloneContribution(op.name, sk);
      const value = c ? (c.recovery.all || c.recovery.self) : 0;
      if (value > 0) result.push({ operatorName: op.name, value, description: sk.description });
    }
  }
  return result;
}

const DORMITORY_BASE_RECOVERY = 0.35;
const MORALE_POOL = 24;

/** Pass-1 (bootstrap) overrides: before anything has actually been
 * placed, every cross-facility condition that optimizerLogic.ts would
 * otherwise assume true by default (a reasonable simplification for its
 * ORIGINAL standalone single-room use case) is forced to its
 * conservative, "not yet verified" value. Pass 2 below replaces every
 * one of these with the REAL derived values, computed from what pass 1
 * actually placed -- this bootstrap set only exists to get a first,
 * safely-conservative placement to derive real numbers FROM. */
const BOOTSTRAP_OVERRIDES: DynamicContextOverrides = {
  gummyInTradingPost: false,
  ulpianusInBase: false,
  facilitiesWithSuiOperator: 0,
  facilitiesWithEliteOperator: 0,
  allPlacedNames: [],
  robotPowerPlantCount: 0,
  ursusSpecialtyBeverageTotal: 0,
  blacksteelWorldwideCountInBase: 0,
  rhineLabCountInBase: 0,
};

export interface RotationExperimentResult {
  factory: RoomAssignment[];
  tradingPost: RoomAssignment[];
  receptionRoom: RoomAssignment | null;
  office: RoomAssignment | null;
  powerPlant: RoomAssignment[];
  controlCenter: RoomAssignment | null;
  dormitoryRecoveryRate: number;
  dormitoryRestHoursNeeded: number;
  loginSnappedRestHoursNeeded: number;
  dormitorySlotsTotal: number; // 4 rooms x 5 slots = 20
  dormitoryPermanentStaff: string[]; // dedicated recovery-buff operators, never rotate out -- occupy some of the 20 slots permanently, separate from whoever's currently resting there
  totalOperatorsUsed: number; // sanity check -- every operator counted here is claimed exactly once, nobody double-booked
  chosenScenario: string; // which CC-enabler scenario won (see SCENARIOS below) -- e.g. "Gnosis forced into Control Center"
}

function workWindowFor(descriptions: (string | null)[]): number {
  const rates = descriptions.map((d) => {
    const m = d?.match(/morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i);
    return m ? 1 + parseFloat(m[1]) : 1;
  });
  const worstRate = Math.max(...rates, 1);
  return calcDeadTime(worstRate) ?? 0;
}

/** Picks the highest-ranked combo from a combinatorial search's results
 * that doesn't overlap `used` at all, claims it, and returns it along
 * with ITS OWN score (not necessarily the group's top-ranked option's
 * score, if that particular one wasn't available) -- same "first
 * fully-available option wins" pattern as wholeBaseOptimizer.ts's
 * firstAvailable, just inlined here since it needs to walk each group's
 * options list too, not just the group list itself. */
function claimFirstAvailableCombo<T extends { combo: string[] }>(groups: ConsolidatedGroup<T>[], used: Set<string>): { combo: string[]; score: number } | null {
  for (const g of groups) {
    for (const opt of g.options) {
      const combo = [...g.core, ...opt.fillers];
      if (combo.every((op) => !used.has(op))) {
        combo.forEach((op) => used.add(op));
        return { combo, score: opt.score };
      }
    }
  }
  return null;
}

/** Real per-slot facility levels, matching the rotation experiment's own
 * fixed room structure (2 Trading Posts, 2 Precious-Metal Factories, 2
 * Battle-Records Factories) -- each slot's own level, in the order those
 * slots are labeled ("Trading Post 1"/"2" etc.), defaulting to 3 (max)
 * for any slot the caller doesn't specify, same "assume fully built"
 * convention as the rest of this module already uses for everything
 * else. */
export interface RotationFacilityLevels {
  tpLevels: [number, number];
  factoryGoldLevels: [number, number];
  factoryExpLevels: [number, number];
}
const DEFAULT_ROTATION_LEVELS: RotationFacilityLevels = {
  tpLevels: [3, 3],
  factoryGoldLevels: [3, 3],
  factoryExpLevels: [3, 3],
};

function allocateOnce(
  mode: RosterMode,
  contextOverrides: DynamicContextOverrides,
  facilityLevels: RotationFacilityLevels,
  forceControlCenterInclude: string[] = []
): RotationExperimentResult {
  const used = new Set<string>();

  // --- Dormitory's dedicated recovery-buff staff, claimed FIRST and
  // permanently -- they never rotate into production rooms. Every
  // room's rest window below depends on this rate, so it has to exist
  // before anything else is allocated. ---
  const dormOps = greedyFill(dormitoryCandidates(mode), 6, used); // a handful of dedicated buffers, not all 20 slots -- the rest of the Dormitory's capacity is whoever's currently resting from elsewhere
  const dormitoryRecoveryRate = DORMITORY_BASE_RECOVERY + dormOps.reduce((sum, c) => sum + c.value, 0) / 4; // spread across 4 rooms
  const dormitoryRestHoursNeeded = dormitoryRecoveryRate > 0 ? MORALE_POOL / dormitoryRecoveryRate : Infinity;
  const loginSnappedRestHoursNeeded = snapDownToLogin(dormitoryRestHoursNeeded) || LOGIN_INTERVAL_HOURS;

  function toRoomAssignment(label: string, workingSet: string[], restingSet: string[], metricLabel: string, metricValue: number, restingMetricValue: number, facilityKind: string): RoomAssignment {
    const descriptions = workingSet.flatMap((name) => skillsFor(name, facilityKind, mode).map((s) => s.description));
    const window = workWindowFor(descriptions);
    const snappedWindow = snapDownToLogin(window);
    // Both sets alternate being active in roughly equal proportion over
    // time (this room's own single work/rest cycle applies symmetrically
    // to whichever set currently holds the room), so the true sustained
    // rate is their average, not just the (usually higher) working set's
    // own number.
    const longRunDailyRate = (metricValue + restingMetricValue) / 2;
    return {
      label,
      workingSet,
      restingSet,
      metricLabel,
      metricValue,
      restingMetricValue,
      workWindowHours: window,
      loginSnappedWorkWindowHours: snappedWindow,
      cycleLoginSnappedHours: snappedWindow + loginSnappedRestHoursNeeded,
      longRunDailyRate,
      longRunWeeklyRate: longRunDailyRate * 7,
      longRunMonthlyRate: longRunDailyRate * 30,
      longRunYearlyRate: longRunDailyRate * 365,
    };
  }

  // --- Control Center: category-covering fill, twice. Moved to happen
  // BEFORE Factory/Trading Post/Reception Room (not after, where it
  // used to sit) because its bonuses need to exist before those rooms
  // are evaluated, not be computed as an isolated, disconnected number
  // afterward. ---
  const ccWorking = controlCenterFill(5, used, mode, forceControlCenterInclude);
  const ccResting = controlCenterFill(5, used, mode);
  const controlCenter: RoomAssignment | null =
    ccWorking.operators.length > 0
      ? toRoomAssignment(
          'Control Center',
          ccWorking.operators,
          ccResting.operators,
          'Trading Post / Factory / Clue bonuses (highest-only) + Morale (stacks)',
          ccWorking.effects.tradingPostBonus + ccWorking.effects.factoryBonus + ccWorking.effects.clueCollectionBonus,
          ccResting.effects.tradingPostBonus + ccResting.effects.factoryBonus + ccResting.effects.clueCollectionBonus,
          'Control Center'
        )
      : null;
  // Feed the WORKING set's bonuses into every subsequent room's
  // evaluation -- the resting set's bonus only matters once it becomes
  // the working set on Control Center's own next rotation, same
  // single-snapshot simplification as the rest of this derivation.
  const contextOverridesWithCC: DynamicContextOverrides = {
    ...contextOverrides,
    controlCenterFactoryBonus: ccWorking.effects.factoryBonus,
    controlCenterTradingPostBonus: ccWorking.effects.tradingPostBonus,
  };

  // --- Factory + Trading Post: full combinatorial search. Real base
  // layout has 4 Factories (split 2 Precious Metals + 2 Battle Records,
  // same convention as wholeBaseOptimizer.ts) and 2 Trading Posts --
  // each room claims its OWN working+resting pair from the same shared
  // `used` pool everything else draws from too, so later rooms
  // naturally get whatever's left over once earlier ones have already
  // taken the best available operators. eliteTwo reuses this
  // codebase's existing, already-verified best-available-tier candidate
  // pools directly, rather than duplicating that selection logic. ---
  const factoryPool: Record<string, Candidate> = mode === 'eliteZero' ? FACTORY_CANDIDATES_ELITE_ZERO : FACTORY_CANDIDATES;
  const tpPool: Record<string, Candidate> = mode === 'eliteZero' ? TP_CANDIDATES_ELITE_ZERO : TP_CANDIDATES;

  // Each slot runs its OWN search now, at its OWN real level -- two
  // Factories (or two Trading Posts) can be at different levels, and a
  // lower-level room genuinely has fewer real operator slots (1 at
  // Level 1, 2 at Level 2, 3 at Level 3 -- see capacityForLevel in
  // baseConfig.ts), which runFactorySearch/runTradingPostSearch's new
  // maxSlots parameter now respects. Previously one shared search
  // (always assuming 3 slots) fed both same-type slots, silently
  // treating every Trading Post/Factory as fully built regardless of
  // its real level.
  function claimFactoryRoom(label: string, level: number, product: 'Battle Records' | 'Precious Metals', metricLabel: string): RoomAssignment {
    const groups = runFactorySearch(product, 500, factoryPool, contextOverridesWithCC, level);
    const workingClaim = claimFirstAvailableCombo(groups, used);
    const restingClaim = claimFirstAvailableCombo(groups, used);
    return toRoomAssignment(label, workingClaim?.combo ?? [], restingClaim?.combo ?? [], metricLabel, workingClaim?.score ?? 0, restingClaim?.score ?? 0, 'Factory');
  }
  function claimTpRoom(label: string, level: number): RoomAssignment {
    const groups = runTradingPostSearch(500, tpPool, { ...contextOverridesWithCC, tradingPostLevel: level }, level);
    const workingClaim = claimFirstAvailableCombo(groups, used);
    const restingClaim = claimFirstAvailableCombo(groups, used);
    return toRoomAssignment(label, workingClaim?.combo ?? [], restingClaim?.combo ?? [], 'LMD/day', workingClaim?.score ?? 0, restingClaim?.score ?? 0, 'Trading Post');
  }

  const factoryRooms = [
    claimFactoryRoom('Factory (Precious Metals) 1', facilityLevels.factoryGoldLevels[0], 'Precious Metals', 'Precious Metals/day'),
    claimFactoryRoom('Factory (Precious Metals) 2', facilityLevels.factoryGoldLevels[1], 'Precious Metals', 'Precious Metals/day'),
    claimFactoryRoom('Factory (Battle Records) 1', facilityLevels.factoryExpLevels[0], 'Battle Records', 'Battle Records EXP/day'),
    claimFactoryRoom('Factory (Battle Records) 2', facilityLevels.factoryExpLevels[1], 'Battle Records', 'Battle Records EXP/day'),
  ];
  const tpRooms = [claimTpRoom('Trading Post 1', facilityLevels.tpLevels[0]), claimTpRoom('Trading Post 2', facilityLevels.tpLevels[1])];

  // --- Reception Room, Office, Power Plant: greedy top-N, twice each.
  // Reception Room additionally gets Control Center's clueCollectionBonus
  // added on top of its own operators' own clue speed sum -- same
  // "external cross-facility bonus, not part of the room's own operator
  // competition" treatment as Factory/Trading Post above. ---
  const receptionPool = receptionRoomCandidates(mode);
  const receptionWorking = greedyFill(receptionPool, 2, used);
  const receptionResting = greedyFill(receptionPool, 2, used);
  const receptionRoom: RoomAssignment | null =
    receptionWorking.length > 0
      ? toRoomAssignment(
          'Reception Room',
          receptionWorking.map((c) => c.operatorName),
          receptionResting.map((c) => c.operatorName),
          'Clue search speed',
          receptionWorking.reduce((sum, c) => sum + c.value, 0) + ccWorking.effects.clueCollectionBonus,
          receptionResting.reduce((sum, c) => sum + c.value, 0) + ccWorking.effects.clueCollectionBonus,
          'Reception Room'
        )
      : null;

  const officePool = officeCandidates(mode);
  const officeWorking = greedyFill(officePool, 1, used);
  const officeResting = greedyFill(officePool, 1, used);
  const office: RoomAssignment | null =
    officeWorking.length > 0
      ? toRoomAssignment(
          'Office',
          officeWorking.map((c) => c.operatorName),
          officeResting.map((c) => c.operatorName),
          'HR contacting speed',
          officeWorking.reduce((sum, c) => sum + c.value, 0),
          officeResting.reduce((sum, c) => sum + c.value, 0),
          'Office'
        )
      : null;

  // 3 Power Plant facilities, 1 slot each -- working set of 3, resting set of 3.
  const powerPlantPool = powerPlantCandidates(mode);
  const powerPlantWorking = greedyFill(powerPlantPool, 3, used);
  const powerPlantResting = greedyFill(powerPlantPool, 3, used);
  const powerPlantRooms: RoomAssignment[] = powerPlantWorking.map((c, i) =>
    toRoomAssignment(
      `Power Plant ${i + 1}`,
      [c.operatorName],
      powerPlantResting[i] ? [powerPlantResting[i].operatorName] : [],
      'Drone recovery rate',
      c.value,
      powerPlantResting[i]?.value ?? 0,
      'Power Plant'
    )
  );

  return {
    factory: factoryRooms,
    tradingPost: tpRooms,
    receptionRoom,
    office,
    powerPlant: powerPlantRooms,
    controlCenter,
    dormitoryRecoveryRate,
    dormitoryRestHoursNeeded,
    loginSnappedRestHoursNeeded,
    dormitorySlotsTotal: 20,
    dormitoryPermanentStaff: dormOps.map((c) => c.operatorName),
    totalOperatorsUsed: used.size,
    chosenScenario: '', // placeholder -- this internal helper doesn't know which scenario it's part of; runScenario sets the real value
  };
}

/** Every distinct "room" in the plan, each with its own working set --
 * used below to count how many FACILITIES (not operators) contain at
 * least one roster member, for the facilitiesWithX-style overrides. */
function allRoomWorkingSets(result: RotationExperimentResult): string[][] {
  return [
    ...result.factory.map((r) => r.workingSet),
    ...result.tradingPost.map((r) => r.workingSet),
    ...(result.receptionRoom ? [result.receptionRoom.workingSet] : []),
    ...(result.office ? [result.office.workingSet] : []),
    ...result.powerPlant.map((r) => r.workingSet),
    ...(result.controlCenter ? [result.controlCenter.workingSet] : []),
    result.dormitoryPermanentStaff, // physically in the Dormitory, counts as its own facility for this purpose
  ];
}

/** Derives the REAL cross-facility overrides from what pass 1 actually
 * placed, instead of the bootstrap pass's conservative guesses --
 * checked against each roster set from baseGroupRosters.ts, the same
 * source of truth the rest of this codebase uses for these group
 * checks. Only checks WORKING sets (not resting sets), since a room's
 * reported metricValue is specifically the working set's output -- the
 * resting set's own conditions would only matter once it becomes the
 * working set on the next rotation, which this single-snapshot
 * derivation doesn't attempt to model. */
function deriveOverridesFromPlacement(result: RotationExperimentResult): DynamicContextOverrides {
  const rooms = allRoomWorkingSets(result);
  const allWorkingNames = rooms.flat();
  const tpWorkingNames = result.tradingPost.flatMap((r) => r.workingSet);
  const powerPlantWorkingNames = result.powerPlant.flatMap((r) => r.workingSet);
  const ccWorkingNames = result.controlCenter?.workingSet ?? [];

  const countRoomsWithMember = (roster: ReadonlySet<string>): number => rooms.filter((room) => room.some((name) => roster.has(name))).length;
  const countMembers = (roster: ReadonlySet<string>): number => allWorkingNames.filter((name) => roster.has(name)).length;

  // Felvine's real formula (from optimizerLogic.ts's own FELVINE constant):
  // Kirin R Yato contributes a flat +8, Rathalos S Noir Corne contributes
  // +2 per Soubo Adventurer in CC -- 2 assumed present here too, same
  // simplification the rest of this codebase already uses for that count.
  let felvineTotal = 0;
  if (ccWorkingNames.includes('Kirin R Yato')) felvineTotal += 8;
  if (ccWorkingNames.includes('Rathalos S Noir Corne')) felvineTotal += 2 * 2;

  return {
    gummyInTradingPost: tpWorkingNames.includes('Gummy'),
    ulpianusInBase: allWorkingNames.includes('Ulpianus'),
    allPlacedNames: allWorkingNames,
    robotPowerPlantCount: powerPlantWorkingNames.filter((name) => rosters.OPERATION_PLATFORM.has(name)).length,
    rhineLabCountInBase: countMembers(rosters.RHINE_LAB),
    blacksteelWorldwideCountInBase: countMembers(rosters.BLACKSTEEL_WORLDWIDE),
    facilitiesWithSuiOperator: countRoomsWithMember(new Set([...rosters.SUI, ...rosters.WANDERING_MEDIC])),
    facilitiesWithEliteOperator: countRoomsWithMember(rosters.ELITE_OPERATOR),
    ursusSpecialtyBeverageTotal: countMembers(rosters.URSUS_STUDENT_SELF_GOVERNING_GROUP),
    gnosisInControlCenter: ccWorkingNames.includes('Gnosis'),
    felvineTotal,
  };
}

/** Total production value across every room, for comparing scenarios
 * against each other. Precious Metals weighted x400 (matches
 * wholeBaseOptimizer.ts's own LMD-equivalent convention for gold),
 * Battle Records EXP weighted x1000 (matches that same file's existing
 * pre-scaling), LMD at face value. Not a perfectly principled unified
 * currency, but consistent with how the rest of this codebase already
 * compares these three different product types against each other. */
function totalProductionValue(result: RotationExperimentResult): number {
  let total = 0;
  for (const r of result.factory) {
    if (r.metricLabel === 'Precious Metals/day') total += r.longRunDailyRate * 400;
    else if (r.metricLabel === 'Battle Records EXP/day') total += r.longRunDailyRate * 1000;
  }
  for (const r of result.tradingPost) total += r.longRunDailyRate;
  return total;
}

interface Scenario {
  label: string;
  forceControlCenterInclude: string[];
}

/** Only scenarios where I actually know the real bonus value being
 * unlocked (Gnosis's Karlan Trade -0.15/+6, Kirin R Yato/Rathalos S
 * Noir Corne's Felvine +8/+4) get tried -- SilverAsh the Reignfrost's
 * CC-conditional Factory bonus is also now overridable in
 * optimizerLogic.ts, but I don't have her real bonus value, so
 * guessing at a number for that scenario isn't attempted here. */
const SCENARIOS: Scenario[] = [
  { label: 'Baseline (no forced Control Center picks)', forceControlCenterInclude: [] },
  { label: 'Gnosis forced into Control Center', forceControlCenterInclude: ['Gnosis'] },
  { label: 'Kirin R Yato + Rathalos S Noir Corne forced into Control Center', forceControlCenterInclude: ['Kirin R Yato', 'Rathalos S Noir Corne'] },
  { label: 'Gnosis + Kirin R Yato + Rathalos S Noir Corne forced into Control Center', forceControlCenterInclude: ['Gnosis', 'Kirin R Yato', 'Rathalos S Noir Corne'] },
];

/** Two-pass resolution for ONE scenario: pass 1 bootstraps a placement
 * (forcing whichever Control Center picks this scenario specifies),
 * then pass 2 re-runs the ENTIRE allocation using the REAL
 * cross-facility conditions derived from what pass 1 actually placed --
 * resolving the chicken-and-egg problem where a skill's true value
 * depends on placement, but placement depends on the skill's value. Not
 * iterated further than two passes: each additional pass re-runs the
 * full combinatorial search again, and these are small, bounded
 * secondary effects -- two passes captures the large majority of the
 * accuracy gain for a reasonable computation cost. */
function runScenario(mode: RosterMode, scenario: Scenario, facilityLevels: RotationFacilityLevels): RotationExperimentResult {
  const pass1 = allocateOnce(mode, BOOTSTRAP_OVERRIDES, facilityLevels, scenario.forceControlCenterInclude);
  const derivedOverrides = deriveOverridesFromPlacement(pass1);
  const pass2 = allocateOnce(mode, derivedOverrides, facilityLevels, scenario.forceControlCenterInclude);
  return { ...pass2, chosenScenario: scenario.label };
}

/** Tries every scenario in SCENARIOS (each a full two-pass resolution
 * of its own) and keeps whichever yields the highest total production
 * value -- this is what lets the experiment actually discover that
 * deliberately picking Gnosis for Control Center, even though her own
 * skill wouldn't make her the "best" CC candidate by the greedy
 * category-covering logic alone, can still be the better choice overall
 * once her unlocked Trading Post bonus is counted. Doesn't attempt to
 * discover EVERY possible cross-room synergy automatically -- that
 * would mean testing every combination of every operator with a
 * conditional cross-facility effect, which isn't computationally
 * tractable here. Limited to the specific, named enablers whose real
 * bonus values are actually known (see SCENARIOS above).
 *
 * facilityLevels defaults to every slot at Level 3 (max) when omitted --
 * initializeRotationExperimentData() must be called first, with real
 * operator data, or every candidate pool is empty and this returns
 * nothing useful. */
export function runRotationExperiment(mode: RosterMode, facilityLevels: RotationFacilityLevels = DEFAULT_ROTATION_LEVELS): RotationExperimentResult {
  const results = SCENARIOS.map((scenario) => runScenario(mode, scenario, facilityLevels));
  return results.reduce((best, r) => (totalProductionValue(r) > totalProductionValue(best) ? r : best));
}