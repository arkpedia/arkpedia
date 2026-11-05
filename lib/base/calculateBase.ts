import { BaseSkillSlots } from '@/lib/base/baseSkillSlots';
import { BaseOperator, BaseSkill } from '@/lib/operators/operatorTypes';
import { BaseAssignments, FactoryProducts, DormitoryAmbience, SlotAssignment, FactoryProduct, MoraleResult } from '@/lib/base/baseTypes';
import {
  calcGreyProductivity,
  factoryBaseCapacity,
  tradingPostBaseOrderLimit,
  greyMoraleRate,
  calcReceptionRoomBaseSpeed,
  receptionRoomBaseContribution,
  calcFullTime,
  calcDeadTime,
  calcDailyProduction,
  calcControlCenterMoraleRelief,
  calcTradingPostFullTime,
  calcTradingPostGoldPerHourStandardized,
  tradingPostExpectedMinutes,
  calcTradingPostGoldAndLmdPerHour,
  ControlCenterEffects,
  calcDormitoryRecovery,
  defaultDormitoryAmbience,
  type GoldOrderTier,
} from '@/lib/base/baseProductivity';
import { computeResourcePools, pureGoldProductionLineCount, nonDefaultRecruitSlots, influenceOf, territoryOf, ResourcePools, LayoutCounts } from '@/lib/base/baseResources';
import { activeBaseSkills } from '@/lib/base/activeBaseSkills';
import { skillEffectEntry, type BaseSkillEffectEntry, type SkillCondition, type SkillCountSource } from '@/lib/base/baseSkillEffects';
import { evaluateSkill, type SkillContribution, type SkillScope } from '@/lib/base/skillEvaluation';
import { CUSTOM_HANDLERS, CUSTOM_STAGE, type CustomContext, type CustomResult } from '@/lib/base/customSkillHandlers';
import { categoriesFor } from '@/lib/base/factorySkillCategories';
import { jayeContribution } from '@/lib/base/jaye';
import { workshopMorale, workshopOutcome, RECIPE_KIND_CODES, type WorkshopRecipe, type WorkshopSettings } from '@/lib/base/workshop';
import { dormitoryRecoveryRates, type DormRecoveryProvider } from '@/lib/base/dormitoryRecovery';
import { crossFacilityMoraleRelief } from '@/lib/base/crossFacilityMorale';
import { trainingOutcome, resolveTrainingTarget, TRAINING_CLASS_CODES, type TrainingTarget } from '@/lib/base/trainingRoom';
import type { BaseRosters, BaseRosterName } from './baseGroupRosters';
import type { FacilityDef } from './baseTypes';

/** One room's output per day at its current rates, never idle: Battle Record EXP,
 * Precious Metals made, gold sold by Trading Posts, and LMD beyond 500 per gold. */
export interface RoomDailyOutput { exp: number; goldMade: number; goldSold: number; extraLmd: number; pepeLmd: number }

const PRODUCTIVITY_KINDS = new Set(['factory', 'tradingPost']);
/** Sum of building_data.layouts.v0.slots[].provideLabor, assuming all rooms excavated. */
const MAX_DRONE_CAPACITY = 235;

export interface BaseCalculationInput {
  operators: BaseOperator[];
  rosters: BaseRosters;
  skillSlots: BaseSkillSlots;
  facilities: FacilityDef[];
  assignments: BaseAssignments;
  factoryProducts: FactoryProducts;
  dormitoryAmbience?: DormitoryAmbience;
  loginInterval?: number;
  swapPolicy?: 'onMoraleZero' | 'onLogin';
  clueExchangeActive?: boolean;
  moraleAbove12?: boolean;
  trainingTarget?: TrainingTarget;
  workshopSettings?: WorkshopSettings;
  workshopRecipes: WorkshopRecipe[];
  importedMorale?: Record<string, number>;
  /** Hours each operator has already worked without a break when this calculation's window starts (ramp skills). Default 0. */
  rampStartHours?: Record<string, number>;
  /** The window ramp skills average over, instead of the one derived from the login interval and Morale. */
  rampWindowOverride?: number;
  /** Per Dormitory, the order its single-target recovery skills pick in, least Morale first, instead of by the Morale
   * given now: the simulator picks at each login and keeps the pick until the next. */
  dormitoryPickOrder?: Record<string, string[]>;
  /** Spell out each counted and conditional skill's derivation for the breakdown panel (`formula` on its line). The
   * page asks for it; a search, which calls the calculator thousands of times, does not. */
  explain?: boolean;
}

/** Operators by name, built once per operator list (a search calls the calculator thousands of times on one list). */
const operatorIndexes = new WeakMap<readonly BaseOperator[], Map<string, BaseOperator>>();
function operatorNamed(operators: readonly BaseOperator[], name: string): BaseOperator | undefined {
  let index = operatorIndexes.get(operators);
  if (!index) {
    index = new Map();
    // The first record with a name wins, as Array.find did.
    for (const o of operators) if (!index.has(o.name)) index.set(o.name, o);
    operatorIndexes.set(operators, index);
  }
  return index.get(name);
}

/** Each built room's slots cut to its capacity; rooms with no places (unbuilt, elevators) and unknown keys are kept. */
export function withinCapacity(assignments: BaseAssignments, facilities: BaseCalculationInput['facilities']): BaseAssignments {
  let out: BaseAssignments | null = null;
  for (const f of facilities) {
    const slots = assignments[f.id];
    if (!slots || f.capacity <= 0 || slots.length <= f.capacity) continue;
    out ??= { ...assignments };
    out[f.id] = slots.slice(0, f.capacity);
  }
  return out ?? assignments;
}

interface FacilityBreakdownLine {
  operatorName: string;
  skillName: string | null;
  rawValue: number;
  included: boolean;
  reason: string;
  formula?: string; // the skill's own derivation: its counted and conditional parts, spelled out
  note?: string; // what the numbers leave out, shown in the breakdown panel instead of cluttering the facility tile
}
interface FacilityBreakdown {
  filledCount: number;
  greyProductivity: number;
  greyFormula: string;
  overrideActive: boolean;
  lines: FacilityBreakdownLine[];
  finalYellow: number;
  effectiveProductivity: number;
}

/** A placed operator's active skill with its table entry. */
interface RoomSkill { slot: SlotAssignment; skill: BaseSkill; entry: BaseSkillEffectEntry | undefined }

const RESOURCE_CONVERSION_NAMES = new Set(['perceptionFromMeasure', 'perceptionFromDreamland', 'perceptionFromMemoryFragments', 'soundlessResonanceFromPerception', 'chainOfThoughtFromPerception', 'witchcraftCrystalFromWorldlyPlight']);
const NO_ROOM: FacilityDef = { id: '', kind: 'elevator', label: '', capacity: 0, gridArea: '', level: 0 };

/** The complete cross-room calculator used by /base and scenario regressions. */
export function calculateBase(input: BaseCalculationInput) {
  const { operators, rosters, skillSlots, facilities: FACILITIES, factoryProducts, workshopRecipes, importedMorale, rampStartHours, rampWindowOverride, dormitoryPickOrder, explain = false,
    dormitoryAmbience = {}, loginInterval = 24, swapPolicy = 'onMoraleZero', clueExchangeActive = false, moraleAbove12 = true,
    trainingTarget = { class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false },
    workshopSettings = { recipeId: '1', qualifyingDormOperators: 0, causality: 0, karma: 0, thornsFailures: 0 },
  } = input;
  // A room never counts more operators than it has places: a saved plan keeps its slots after the room is
  // downgraded, and a hand-written plan can list two operators for a one-place Power Plant.
  const assignments = withinCapacity(input.assignments, FACILITIES);
  // The Morale levels this result reads, by operator: the rates below stay the same for any Morale on the same side
  // of each (see MoraleLevels). The simulator recalculates only when someone crosses one of their own.
  const moraleLevels: Record<string, number[]> = {};
  // Dorms with a single-target recovery skill, by id: it goes to the roommate with the least Morale, so their order
  // matters as well as levels. The simulator fixes that order at each login (dormitoryPickOrder).
  const moraleOrder: Record<string, string[]> = {};
  const readsMorale = (name: string, ...levels: number[]) => { const l = (moraleLevels[name] ??= []); for (const v of levels) if (!l.includes(v)) l.push(v); };
  for (const f of FACILITIES) if (f.kind !== 'dormitory') for (const s of assignments[f.id] ?? []) if (s) readsMorale(s.operatorName, 0); // exhausted at 0
  const baseSource = importedMorale ? 'account' : 'planner';
  const resolvedTrainingTarget = resolveTrainingTarget(trainingTarget, operators);
  const { ABYSSAL_HUNTERS, OPERATION_PLATFORM, SUI } = rosters;
  const layoutCounts: LayoutCounts = {
    tradingPostCount: FACILITIES.filter(f => f.kind === 'tradingPost' && f.level > 0).length,
    factoryCount: FACILITIES.filter(f => f.kind === 'factory' && f.level > 0).length,
    powerPlantCount: FACILITIES.filter(f => f.kind === 'powerPlant' && f.level > 0).length,
  };
  const totalDormitoryLevels = FACILITIES.filter(f => f.kind === 'dormitory').reduce((s, f) => s + f.level, 0);
  const totalFacilityLevels = FACILITIES.reduce((sum, room) => sum + room.level, 0);
  const dormitoryCount = FACILITIES.filter((f) => f.kind === 'dormitory' && f.level > 0).length;
  const officeLevel = FACILITIES.find(room => room.kind === 'office')?.level ?? 0;
  const receptionRoomLevel = FACILITIES.find(room => room.kind === 'receptionRoom')?.level ?? 0;
  const trainingRoomLevel = FACILITIES.find(room => room.kind === 'trainingRoom')?.level ?? 0;
  function rampWindow(hoursUntilMoraleGone: number): number {
    if (rampWindowOverride !== undefined) return rampWindowOverride;
    return Math.min(24, swapPolicy === 'onLogin' ? Math.min(loginInterval, hoursUntilMoraleGone) : hoursUntilMoraleGone);
  }
  function skillsFor(slot: SlotAssignment | null, facilityLabel: string): BaseSkill[] {
    // Exhausted operators retain their physical assignment, but their working
    // skills stop. Dormitory recovery skills remain active at zero Morale.
    if (slot && facilityLabel !== 'Dormitory' && importedMorale?.[slot.operatorName] === 0) return [];
    const op = slot && operatorNamed(operators, slot.operatorName);
    return op && slot ? activeBaseSkills(op, facilityLabel, slot.eliteLevel, skillSlots, slot.level) : [];
  }
  const filledCache = new Map<string, SlotAssignment[]>();
  const filledOf = (f: FacilityDef) => { let v = filledCache.get(f.id); if (!v) { v = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null); filledCache.set(f.id, v); } return v; };
  const workingCount = (staff: SlotAssignment[]) => staff.filter(s => importedMorale?.[s.operatorName] !== 0).length;
  const operatorByName = new Map(operators.map((o) => [o.name, o]));

  // ---------------------------------------------------------------- base-wide facts
  const allPlacedNames: string[] = [];
  const roomOf = new Map<string, FacilityDef>(); // where each placed operator works
  const namesByKind = new Map<string, string[]>();
  let robotPowerPlantCount = 0;
  const activeBuffs = new Map<string, Set<string>>(); // buff id -> room ids where it is active
  const roomSkills = new Map<string, RoomSkill[]>();
  for (const f of FACILITIES) {
    const filled = filledOf(f);
    const skills: RoomSkill[] = filled.flatMap((slot) => skillsFor(slot, f.label).map((skill) => ({ slot, skill, entry: skillEffectEntry(skill) })));
    roomSkills.set(f.id, skills);
    for (const { skill } of skills) if (skill.buffId) (activeBuffs.get(skill.buffId) ?? activeBuffs.set(skill.buffId, new Set()).get(skill.buffId)!).add(f.id);
    for (const s of filled) { allPlacedNames.push(s.operatorName); roomOf.set(s.operatorName, f); (namesByKind.get(f.kind) ?? namesByKind.set(f.kind, []).get(f.kind)!).push(s.operatorName); }
    if (f.kind === 'powerPlant') robotPowerPlantCount += filled.filter((s) => OPERATION_PLATFORM.has(s.operatorName)).length;
  }
  const trainee = resolvedTrainingTarget.operatorName && trainingRoomLevel > 0 && !allPlacedNames.includes(resolvedTrainingTarget.operatorName) ? resolvedTrainingTarget.operatorName : '';
  if (trainee) allPlacedNames.push(trainee);
  const ccRoom = FACILITIES.find((f) => f.kind === 'controlCenter');
  const ccSlots = ccRoom ? filledOf(ccRoom) : [];
  const ccOperatorNames = ccSlots.map((s) => s.operatorName);
  const trainingRoomSlots = filledOf(FACILITIES.find(f => f.kind === 'trainingRoom') ?? NO_ROOM);
  const dormitoryOperatorNames = new Set(namesByKind.get('dormitory') ?? []);
  const dormitoryHasOperator = (name: string) => dormitoryOperatorNames.has(name);
  const operatorInAnyTradingPost = (name: string) => roomOf.get(name)?.kind === 'tradingPost' ? { facilityId: roomOf.get(name)!.id } : null;
  const factionOf = (name: string) => operatorByName.get(name)?.faction || null;
  const rosterOf = (key: string): ReadonlySet<string> => rosters[key as BaseRosterName] ?? new Set();
  // Abyssal Hunters at work and at rest, for Gladiia; the trainee counts as working.
  const abyssalHunters = { working: 0, resting: 0, restingAtFullMorale: 0, perFactory: [] as { factoryId: string; count: number }[], totalInFactories: 0 };
  let dormOperatorCount = 0, suiWorkersOutsideDorms = 0;
  for (const f of FACILITIES) {
    const filled = filledOf(f);
    const here = filled.filter((s) => ABYSSAL_HUNTERS.has(s.operatorName)).length + (trainee && f.kind === 'trainingRoom' && ABYSSAL_HUNTERS.has(trainee) ? 1 : 0);
    if (f.kind === 'dormitory') {
      dormOperatorCount += filled.length;
      abyssalHunters.resting += here;
      abyssalHunters.restingAtFullMorale += filled.filter(s => ABYSSAL_HUNTERS.has(s.operatorName) && (s.morale ?? 0) >= 24).length;
      for (const s of filled) if (ABYSSAL_HUNTERS.has(s.operatorName)) readsMorale(s.operatorName, 24);
      continue;
    }
    abyssalHunters.working += here;
    suiWorkersOutsideDorms += filled.filter((s) => SUI.has(s.operatorName)).length + (trainee && f.kind === 'trainingRoom' && SUI.has(trainee) ? 1 : 0);
    if (f.kind === 'factory') {
      if (here > 0) abyssalHunters.perFactory.push({ factoryId: f.id, count: here });
      abyssalHunters.totalInFactories += here;
    }
  }
  const facilitiesWithRosterCache = new Map<string, number>();
  const facilitiesWithRoster = (key: string, workOnly: boolean) => {
    const cacheKey = `${key}|${workOnly}`;
    let n = facilitiesWithRosterCache.get(cacheKey);
    if (n === undefined) {
      const roster = rosterOf(key);
      n = FACILITIES.filter((f) => (!workOnly || f.kind !== 'dormitory') && (filledOf(f).some((s) => roster.has(s.operatorName)) || (f.kind === 'trainingRoom' && f.level > 0 && !!trainee && roster.has(trainee)))).length;
      facilitiesWithRosterCache.set(cacheKey, n);
    }
    return n;
  };
  const builtFactoryProducts = FACILITIES.filter(f => f.kind === 'factory' && f.level > 0).map(f => factoryProducts[f.id] ?? null);
  const distinctFactoryProductCount = new Set(builtFactoryProducts.filter(Boolean)).size;
  const baseGoldLineCount = pureGoldProductionLineCount(builtFactoryProducts);

  // Manual setting instead of a calculated fraction -- confirmed by the user: the real trigger depends on how the
  // whole day actually plays out, which this steady-state simulator can't track, so it's a direct on/off choice.
  for (const name of ['Ling', 'Dusk']) if (allPlacedNames.includes(name)) readsMorale(name, 12);
  const fractionAbove12 = (name: string) => (baseSource === 'account' && importedMorale?.[name] !== undefined ? importedMorale![name] > 12 : moraleAbove12) ? 1 : 0;

  // ---------------------------------------------------------------- the scope a skill is evaluated in
  /** `trainee` and `recipe` set the Training Room's and Workshop's targets and conditions. */
  interface ScopeOptions { operatorName: string; room: FacilityDef; roomNames: readonly string[]; working: number; product: FactoryProduct | null; target?: string | null; moraleByOperator?: Readonly<Record<string, number>>; trainee?: TrainingTarget; recipe?: WorkshopRecipe }
  // Workshop: the Dormitory residents' Morale levels, or the reader's own count when they override the head count.
  const dormMoraleLevels = FACILITIES.filter(room => room.kind === 'dormitory' && room.level > 0).flatMap(room => (assignments[room.id] || []).flatMap(slot => slot ? [slot.morale ?? 0] : []));
  const dormResidentsWhere = (test: (morale: number) => boolean) => workshopSettings.overrideDormCount ? Math.max(0, Math.min(dormitoryOperatorNames.size, workshopSettings.qualifyingDormOperators)) : dormMoraleLevels.filter(test).length;
  // Base-wide figures some counts read; set as the passes below find them.
  const pools: ResourcePools & { engineeringRobots: number } = { passion: 0, worldlyPlight: 0, soundlessResonance: 0, perceptionInformation: 0, intelligenceReserve: 0, memoryFragments: 0, witchcraftCrystal: 0, chainOfThought: 0, measure: 0, dreamland: 0, engineeringRobots: 0 };
  let felvine = 0, monsterMeal = 0, ursusBeverage = 0;
  let effectivePowerPlantCount = layoutCounts.powerPlantCount;
  let effectiveGoldLineCount = baseGoldLineCount;
  let officeHrSpeedPercent = 0;
  function scopeFor(o: ScopeOptions): SkillScope {
    const self = o.operatorName;
    const count = (source: SkillCountSource): number => {
      const at = source.indexOf(':');
      const head = at < 0 ? source : source.slice(0, at), rest = at < 0 ? '' : source.slice(at + 1);
      switch (head) {
        case 'room.operators': return o.roomNames.length;
        case 'room.others': return Math.max(0, o.roomNames.length - 1);
        case 'room.belowFullMorale': return o.roomNames.filter((n) => (o.moraleByOperator?.[n] ?? 0) < 24).length;
        case 'room.roster': return o.roomNames.filter((n) => rosterOf(rest).has(n)).length;
        case 'room.rosterOthers': return o.roomNames.filter((n) => n !== self && rosterOf(rest).has(n)).length;
        case 'room.faction': return o.roomNames.filter((n) => factionOf(n) === rest).length;
        case 'room.skillCategory': {
          const skills = roomSkills.get(o.room.id) ?? [];
          const reclassify = skills.some((x) => x.entry?.interaction?.reclassifiesSkills);
          return skills.filter((x) => categoriesFor(x.skill.name || '', reclassify).includes(rest)).length;
        }
        case 'base.tradingPosts': return layoutCounts.tradingPostCount;
        case 'base.factories': return layoutCounts.factoryCount;
        case 'base.powerPlants': return effectivePowerPlantCount;
        case 'base.dormitories': return dormitoryCount;
        case 'base.dormLevels': return totalDormitoryLevels;
        case 'base.facilityLevels': return totalFacilityLevels;
        case 'base.robotsInPowerPlants': return robotPowerPlantCount;
        case 'base.distinctFactoryProducts': return distinctFactoryProductCount;
        case 'base.goldFactories': return baseGoldLineCount;
        case 'base.goldLines': return effectiveGoldLineCount;
        case 'base.maxDroneCapacity': return MAX_DRONE_CAPACITY;
        case 'base.dormOperators': return dormOperatorCount;
        case 'base.roster': return allPlacedNames.filter((n) => rosterOf(rest).has(n)).length;
        case 'base.rosterOthers': return allPlacedNames.filter((n) => n !== self && rosterOf(rest).has(n)).length;
        case 'base.faction': return allPlacedNames.filter((n) => factionOf(n) === rest).length;
        case 'base.facilitiesWithRoster': return facilitiesWithRoster(rest, false);
        case 'base.workFacilitiesWithRoster': return facilitiesWithRoster(rest, true);
        case 'base.workersOfRoster': return rest === 'SUI' ? suiWorkersOutsideDorms : allPlacedNames.filter((n) => rosterOf(rest).has(n) && roomOf.get(n)?.kind !== 'dormitory').length;
        case 'cc.roster': return ccOperatorNames.filter((n) => rosterOf(rest).has(n)).length;
        case 'cc.rosterOthers': return ccOperatorNames.filter((n) => n !== self && rosterOf(rest).has(n)).length;
        case 'cc.faction': return ccOperatorNames.filter((n) => factionOf(n) === rest).length;
        case 'reception.roster': return (namesByKind.get('receptionRoom') ?? []).filter((n) => rosterOf(rest).has(n)).length;
        case 'otherPowerPlants.roster': return FACILITIES.filter((f) => f.kind === 'powerPlant' && f.id !== o.room.id && filledOf(f).some((s) => rosterOf(rest).has(s.operatorName) && importedMorale?.[s.operatorName] !== 0)).length;
        case 'powerPlants.rosterOthers': return (namesByKind.get('powerPlant') ?? []).filter((n) => n !== self && rosterOf(rest).has(n)).length;
        case 'tradingPosts.roster': return (namesByKind.get('tradingPost') ?? []).filter((n) => rosterOf(rest).has(n)).length;
        case 'tp.roster': case 'factory.roster': return o.roomNames.filter((n) => rosterOf(rest).has(n)).length;
        case 'tp.faction': return o.roomNames.filter((n) => factionOf(n) === rest).length;
        case 'level.room': return o.room.level;
        case 'level.receptionRoom': return receptionRoomLevel;
        case 'level.trainingRoom': return trainingRoomLevel;
        case 'office.extraSlots': return nonDefaultRecruitSlots(officeLevel);
        case 'resource': return rest === 'felvine' ? felvine : rest === 'monsterMeal' ? monsterMeal : rest === 'ursusBeverage' ? ursusBeverage : (pools as unknown as Record<string, number>)[rest] ?? 0;
        case 'dorm.moraleAtMost': return dormResidentsWhere((m) => m <= Number(rest));
        case 'dorm.moraleBelow': return dormResidentsWhere((m) => m < Number(rest));
        default: return 0;
      }
    };
    const holds = (c: SkillCondition): boolean => {
      switch (c.type) {
        case 'roomHas': return [c.name, ...(c.forms ?? [])].some((n) => o.roomNames.includes(n));
        case 'roomHasRoster': return o.roomNames.some((n) => n !== self && rosterOf(c.roster).has(n));
        case 'alone': return o.working === 1;
        case 'baseHas': return allPlacedNames.includes(c.name);
        case 'ccHas': return ccOperatorNames.includes(c.name);
        case 'inTradingPost': return roomOf.get(c.name)?.kind === 'tradingPost';
        case 'inFactory': return roomOf.get(c.name)?.kind === 'factory';
        case 'inPowerPlant': return roomOf.get(c.name)?.kind === 'powerPlant';
        case 'inDormitory': return dormitoryHasOperator(c.name);
        case 'inReceptionRoom': return roomOf.get(c.name)?.kind === 'receptionRoom';
        case 'trainerIs': return trainingRoomSlots.some((s) => s.operatorName === c.name);
        case 'clueExchange': return clueExchangeActive;
        case 'officeHrBelow': return officeHrSpeedPercent < c.value;
        case 'influenceAtLeastTerritory': return influenceOf(layoutCounts) >= territoryOf(layoutCounts);
        case 'territoryAboveInfluence': return territoryOf(layoutCounts) > influenceOf(layoutCounts);
        case 'countAtLeast': return count(c.count) >= c.value;
        case 'countAtMost': return count(c.count) <= c.value;
        case 'targetIs': return !!o.target && [c.name, ...(c.forms ?? [])].includes(o.target);
        case 'targetInRoster': return !!o.target && rosterOf(c.roster).has(o.target);
        case 'recipientMoraleBelow': return true;
        case 'product': return o.product === c.product;
        case 'masteryLevel': return o.trainee?.mastery === c.value;
        case 'traineeBranch': return !!o.trainee && o.trainee.branch.toLowerCase() === c.name.toLowerCase();
        case 'instantTrainingReady': return !!o.trainee?.instantTrainingReady;
        case 'recipeFamily': return !!o.recipe && o.recipe.name.toLowerCase().includes(c.name);
        case 'recipeCostIs': return o.recipe?.morale === c.value;
        case 'recipeCostAtLeast': return !!o.recipe && o.recipe.morale >= c.value;
        case 'all': return c.of.every(holds);
      }
    };
    const targetCode = o.trainee ? TRAINING_CLASS_CODES[o.trainee.class] : o.recipe ? RECIPE_KIND_CODES[o.recipe.category] : undefined;
    return { operatorName: self, roomNames: o.roomNames, product: o.product, target: o.target, count, holds, active: (buffId) => activeBuffs.get(buffId)?.has(o.room.id) ?? false, explain, ...(targetCode !== undefined ? { targetMatches: (targets: readonly string[]) => targets.includes(targetCode) } : {}) };
  }
  const roomScope = (f: FacilityDef, filled: SlotAssignment[], operatorName: string, extra: Partial<ScopeOptions> = {}) =>
    scopeFor({ operatorName, room: f, roomNames: filled.map((s) => s.operatorName), working: workingCount(filled), product: f.kind === 'factory' ? factoryProducts[f.id] || null : null, ...extra });
  const evaluateIn = (f: FacilityDef, filled: SlotAssignment[], x: RoomSkill, extra: Partial<ScopeOptions> = {}): SkillContribution | null =>
    x.entry ? evaluateSkill(x.entry, roomScope(f, filled, x.slot.operatorName, extra)) : null;
  const ccFamilyCount = (family: string) => (ccRoom ? roomSkills.get(ccRoom.id) ?? [] : []).filter((x) => x.entry?.family === family).length;
  const groupHuntingInControlCenter = (ccRoom ? roomSkills.get(ccRoom.id) ?? [] : []).some((x) => x.entry?.custom?.handler === 'abyssalGroupHunting');
  const customContextBase = (operatorName: string, roomNames: readonly string[]): CustomContext => ({
    operatorName, roomNames, rampWindowHours: 24, rampStartHours: rampStartHours?.[operatorName] ?? 0, selfMoraleRate: 1,
    othersProductivitySum: 0, capacityByOperator: {}, groupHuntingInControlCenter,
    othersOrderEfficiencySum: 0, othersOrderLimitRawSum: 0, abyssalHunters, fractionAbove12: fractionAbove12(operatorName), ccFamilyCount,
  });
  const runCustom = (c: SkillContribution, ctx: CustomContext): CustomResult => c.custom ? (CUSTOM_HANDLERS[c.custom.handler]?.(c.custom.params, ctx) ?? {}) : {};

  // ---------------------------------------------------------------- pass 1: what every room counts
  // Extra Power Plants (Eunectes, Greyy), the Pure Gold Production Lines, and the resource pools: generation first
  // with the generator's own room as scope, then the conversions in their stages.
  const generated: Record<string, number> = {};
  const conversions = new Set<string>();
  let powerPlantBonus = 0;
  let goldLineBonus = 0;
  for (const f of FACILITIES) {
    const filled = filledOf(f);
    for (const x of roomSkills.get(f.id) ?? []) {
      if (!x.entry || !(x.entry.effects.some((e) => e.kind === 'resource' || e.kind === 'powerPlantCount') || (x.entry.custom && CUSTOM_STAGE[x.entry.custom.handler] === 'base'))) continue;
      const c = evaluateIn(f, filled, x);
      if (!c) continue;
      powerPlantBonus += c.powerPlantCount;
      for (const [name, amount] of Object.entries(c.resources)) {
        if (RESOURCE_CONVERSION_NAMES.has(name)) conversions.add(name);
        else if (name === 'goldLines') goldLineBonus += amount;
        else generated[name] = (generated[name] ?? 0) + amount;
      }
      if (c.custom && CUSTOM_STAGE[c.custom.handler] === 'base') {
        const r = runCustom(c, customContextBase(x.slot.operatorName, filled.map((s) => s.operatorName)));
        for (const [name, amount] of Object.entries(r.resources ?? {})) generated[name] = (generated[name] ?? 0) + amount;
      }
    }
  }
  effectivePowerPlantCount = layoutCounts.powerPlantCount + powerPlantBonus;
  effectiveGoldLineCount = baseGoldLineCount + goldLineBonus;
  felvine = generated.felvine ?? 0;
  monsterMeal = generated.monsterMeal ?? 0;
  ursusBeverage = generated.ursusBeverage ?? 0;
  pools.engineeringRobots = generated.engineeringRobots ?? 0;
  const resourcePools = computeResourcePools(generated, conversions);
  Object.assign(pools, resourcePools);
  const totalMonsterMeal = monsterMeal, totalFelvine = felvine;

  // ---------------------------------------------------------------- Office, for Saileach's threshold
  // The Office's own HR speed before the Control Center's share: its skills alone, without the room's 5%.
  const officeRoom = FACILITIES.find((f) => f.kind === 'office');
  let officeReceptionRoomBonus = 0;
  if (officeRoom) {
    const filled = filledOf(officeRoom);
    let hr = 0;
    for (const x of roomSkills.get(officeRoom.id) ?? []) {
      const c = evaluateIn(officeRoom, filled, x);
      if (!c) continue;
      hr += c.hrSpeed;
      officeReceptionRoomBonus += c.cc.receptionClue;
    }
    officeHrSpeedPercent = hr * 100;
  }

  // ---------------------------------------------------------------- Control Center
  // The three pools keep the strongest candidate; own-room Morale stacks.
  const ccEffects: ControlCenterEffects = { tradingPostBonus: 0, factoryBonus: 0, clueCollectionBonus: 0, ccMoraleBonus: 0 };
  let clueCollectionSource: { operatorName: string; skillName: string | null } | null = null;
  let ccDormitoryAllOperatorsRelief = 0; // highest-only among "all Operators in Dormitories" effects
  let ccDormitoryEliteOperatorsRelief = 0; // highest-only among "all Elite Operators in Dormitories" effects
  let officeHrSpeedBonusFromCC = 0;
  let trainingSpeedBonusFromCC = 0; // highest-only
  let factoryPreciousMetalBonusFromCC = 0;
  let receptionRoomClueSpeedFromCC = 0;
  const receptionRoomClueSpeedSources: { operatorName: string; skillName: string | null; amount: number }[] = [];
  const perTradingPostBonus = new Map<string, number>();
  const perTradingPostOrderLimitBonus = new Map<string, number>();
  const perFactoryProductivityBonus = new Map<string, number>();
  const perFactoryProductivitySources = new Map<string, { operatorName: string; skillName: string | null; amount: number }[]>();
  function addPerFactoryProductivity(facilityId: string, amount: number, operatorName: string, skillName: string | null) {
    perFactoryProductivityBonus.set(facilityId, (perFactoryProductivityBonus.get(facilityId) || 0) + amount);
    perFactoryProductivitySources.set(facilityId, [...(perFactoryProductivitySources.get(facilityId) || []), { operatorName, skillName, amount }]);
  }
  const ccBreakdownLines: FacilityBreakdownLine[] = [];
  const ccSelfMorale: Record<string, number> = {};
  // Recovery for workers in other buildings: Banner of Babel, Solitary Light and Business Is Business compete.
  let bannerOfBabelBonus = 0, chongyueSolitaryLightBonus = 0;
  let mlynar: { ownRooms: number; everyRoom: number } | null = null;
  const tradingPostRooms = FACILITIES.filter((f) => f.kind === 'tradingPost');
  const factoryRooms = FACILITIES.filter((f) => f.kind === 'factory');
  if (ccRoom) {
    for (const x of roomSkills.get(ccRoom.id) ?? []) {
      const c = evaluateIn(ccRoom, ccSlots, x);
      if (!c) continue;
      const entry = x.entry!;
      const custom = c.custom && CUSTOM_STAGE[c.custom.handler] === 'base' ? runCustom(c, customContextBase(x.slot.operatorName, ccOperatorNames)) : {};
      ccEffects.ccMoraleBonus += c.cc.morale;
      if (Math.abs(c.cc.orderEfficiency) > Math.abs(ccEffects.tradingPostBonus)) ccEffects.tradingPostBonus = c.cc.orderEfficiency;
      if (Math.abs(c.cc.factory) > Math.abs(ccEffects.factoryBonus)) ccEffects.factoryBonus = c.cc.factory;
      if (Math.abs(c.cc.clue) > Math.abs(ccEffects.clueCollectionBonus)) { ccEffects.clueCollectionBonus = c.cc.clue; clueCollectionSource = { operatorName: x.slot.operatorName, skillName: x.skill.name }; }
      if (c.cc.dormRecovery) ccDormitoryAllOperatorsRelief = Math.max(ccDormitoryAllOperatorsRelief, c.cc.dormRecovery);
      if (c.cc.dormEliteRecovery) ccDormitoryEliteOperatorsRelief = Math.max(ccDormitoryEliteOperatorsRelief, c.cc.dormEliteRecovery);
      officeHrSpeedBonusFromCC += c.cc.hrSpeed;
      if (c.cc.training) trainingSpeedBonusFromCC = Math.max(trainingSpeedBonusFromCC, c.cc.training);
      factoryPreciousMetalBonusFromCC += c.cc.preciousMetal;
      if (c.cc.receptionClue) { receptionRoomClueSpeedFromCC += c.cc.receptionClue; receptionRoomClueSpeedSources.push({ operatorName: x.slot.operatorName, skillName: x.skill.name, amount: c.cc.receptionClue }); }
      if (c.cc.otherRoomsRecovery) {
        if (entry.family === 'control_mp_expand_double') bannerOfBabelBonus = Math.max(bannerOfBabelBonus, c.cc.otherRoomsRecovery);
        else chongyueSolitaryLightBonus = Math.max(chongyueSolitaryLightBonus, c.cc.otherRoomsRecovery);
      }
      if (custom.otherRoomsRecovery) mlynar = custom.otherRoomsRecovery;
      const self = c.selfMorale + (custom.selfMorale ?? 0);
      if (self) ccSelfMorale[x.slot.operatorName] = (ccSelfMorale[x.slot.operatorName] || 0) + self;
      for (const { name, amount } of c.targetMorale) ccSelfMorale[name] = (ccSelfMorale[name] || 0) + amount;
      for (const t of c.tradingPostOfOperator) { const tp = operatorInAnyTradingPost(t.name); if (tp) perTradingPostOrderLimitBonus.set(tp.facilityId, (perTradingPostOrderLimitBonus.get(tp.facilityId) || 0) + t.amount); }
      for (const { factoryId, amount } of custom.perFactoryProductivity ?? []) addPerFactoryProductivity(factoryId, amount, x.slot.operatorName, x.skill.name);
      // Effects aimed at one room at a time, evaluated with that room as the scope.
      const landsElsewhere: string[] = [];
      if (entry.effects.some((e) => e.kind === 'perTradingPostOrderEfficiency' || e.kind === 'perTradingPostOrderLimit' || e.kind === 'perFactoryProductivity')) {
        for (const tp of tradingPostRooms) {
          const there = evaluateIn(tp, filledOf(tp), x)!;
          if (there.perTradingPostOrderEfficiency) { perTradingPostBonus.set(tp.id, (perTradingPostBonus.get(tp.id) || 0) + there.perTradingPostOrderEfficiency); landsElsewhere.push('a specific Trading Post'); }
          if (there.perTradingPostOrderLimit) { perTradingPostOrderLimitBonus.set(tp.id, (perTradingPostOrderLimitBonus.get(tp.id) || 0) + there.perTradingPostOrderLimit); landsElsewhere.push('a specific Trading Post order limit'); }
        }
        for (const fac of factoryRooms) {
          const filledHere = filledOf(fac);
          const there = evaluateIn(fac, filledHere, x)!;
          if (there.perFactoryProductivity) {
            // One entry per counted operator, so the panel can show "+7% × 3" (Viviana, Flametail).
            const per = entry.effects.find((e) => e.kind === 'perFactoryProductivity' && e.per)?.per;
            const n = Math.max(1, per ? roomScope(fac, filledHere, x.slot.operatorName).count(per.count) : 1);
            for (let i = 0; i < n; i++) addPerFactoryProductivity(fac.id, there.perFactoryProductivity / n, x.slot.operatorName, x.skill.name);
            landsElsewhere.push('a specific Factory');
          }
        }
      }
      // One line per skill, carrying whatever it contributed. Morale is the Control Center's own output; everything
      // else it produces lands in other facilities, so those are reported as 0 here with the note saying where.
      const has = (...kinds: string[]) => entry.effects.some((e) => kinds.includes(e.kind));
      const elsewhere = [...new Set([
        ...(has('ccOrderEfficiency') ? ['Trading Post order efficiency'] : []),
        ...(has('ccFactoryProductivity') ? ['Factory productivity'] : []),
        ...(has('ccClueSpeed', 'ccReceptionClueSpeed') ? ['Reception Room clue speed'] : []),
        ...(custom.perFactoryProductivity?.length ? ['a specific Factory'] : []),
        ...landsElsewhere,
        ...(has('ccHrSpeed') ? ['Office HR speed'] : []),
        ...(has('ccPreciousMetalProductivity') ? ['Factory Precious Metal productivity'] : []),
        ...(has('ccDormRecovery', 'ccDormEliteRecovery') ? ['Dormitory morale'] : []),
        ...(has('ccTrainingSpeed') ? ['Training Room speed'] : []),
        ...(has('ccOtherRoomsRecovery') || custom.otherRoomsRecovery ? ['every other building'] : []),
      ])];
      const morale = c.cc.morale;
      const note = [entry.note, custom.note].filter(Boolean).join(' ');
      if (morale !== 0 || elsewhere.length > 0 || note) {
        ccBreakdownLines.push({
          operatorName: x.slot.operatorName, skillName: x.skill.name, rawValue: morale, included: morale !== 0,
          reason: morale !== 0 ? 'Morale per hour for everyone in the Control Center -- these stack rather than competing.' : elsewhere.length > 0 ? `Contributes nothing to this room; it lands in ${elsewhere.join(', ')}.` : 'No numeric effect on this room.',
          ...(c.formula ? { formula: c.formula } : {}), ...(note ? { note } : {}),
        });
      }
    }
  }
  // The base "each CC operator provides +0.05 relief" portion, unconditional on who they are -- kept separate from
  // the full ccMoraleRelief, since that bundles the cross-facility effects for every OTHER facility.
  const ccBaseMoraleRelief = calcControlCenterMoraleRelief(ccSlots.length);
  const reliefFor = (kind: FacilityDef['kind']) => ccBaseMoraleRelief + crossFacilityMoraleRelief(kind, bannerOfBabelBonus, chongyueSolitaryLightBonus, mlynar);
  const ccMoraleRelief = reliefFor('factory');
  // A Factory bonus for the room a named operator works in, from another room (Justice Knight for Wild Mane).
  for (const f of FACILITIES) if (f.kind !== 'controlCenter') for (const x of roomSkills.get(f.id) ?? []) {
    if (!x.entry?.effects.some((e) => e.kind === 'factoryOfOperator')) continue;
    const c = evaluateIn(f, filledOf(f), x);
    for (const t of c?.factoryOfOperator ?? []) { const room = roomOf.get(t.name); if (room?.kind === 'factory') addPerFactoryProductivity(room.id, t.amount, x.slot.operatorName, x.skill.name); }
  }

  // ---------------------------------------------------------------- one room
  /** The gold-order distribution a Trading Post's skills shift: the higher tier wins; two operators with lower-tier skills shift further. */
  function goldOrderTierOf(skills: RoomSkill[]): GoldOrderTier {
    if (skills.some((x) => x.entry?.interaction?.goldOrderTier === 'higher')) return 'higher';
    const lower = new Set(skills.filter((x) => x.entry?.interaction?.goldOrderTier === 'lower').map((x) => x.slot.operatorName)).size;
    return lower >= 2 ? 'doubleLower' : lower === 1 ? 'lower' : 'base';
  }
  const tradeRuleOf = (skills: RoomSkill[]) => {
    const rules = skills.map((x) => x.entry?.interaction?.trade).filter((t): t is NonNullable<typeof t> => !!t);
    return {
      pepe: rules.some((t) => t.order === 'pepe'), closure: rules.some((t) => t.order === 'closure'),
      fixedGold: rules.find((t) => t.fixedGold)?.fixedGold ?? null,
      provisoBonus: Math.max(0, ...rules.map((t) => t.defaultedGoldBonus ?? 0)),
      tequilaLmdBonus: Math.max(0, ...rules.map((t) => t.lmdBonusAbove3 ?? 0)),
    };
  };
  const lineFor = (x: RoomSkill, c: SkillContribution | null, rawValue: number, included: boolean, reason: string, extra: { formula?: string; note?: string } = {}): FacilityBreakdownLine => {
    const formula = extra.formula ?? c?.formula;
    const note = [x.entry?.note, extra.note].filter(Boolean).join(' ');
    return { operatorName: x.slot.operatorName, skillName: x.skill.name, rawValue, included, reason, ...(formula ? { formula } : {}), ...(note ? { note } : {}) };
  };

  function productivityFor(f: FacilityDef, ccEffects: ControlCenterEffects, ccMoraleRelief: number) {
    const filled = filledOf(f);
    const skills = roomSkills.get(f.id) ?? [];
    const roomNames = filled.map((s) => s.operatorName);
    // Every skill's data shapes, before the custom handlers that read the room's aggregate.
    const evaluated = skills.map((x) => ({ x, c: evaluateIn(f, filled, x) }));
    let specialProductivitySum = 0;
    let specialCapacitySum = 0;
    let specialOrderLimitSum = 0;
    const perOperatorSpecialMorale: Record<string, number> = {};
    let overrideActive = false;
    let overrideProductivitySum = 0;
    let exemptProductivitySum = 0;
    const specialNotes: { operator: string; note: string }[] = [];
    let facilityBreakdown: FacilityBreakdown | null = null;
    // Room-wide Morale effects and each operator's own, from every skill's shapes (the custom handlers never change these).
    const morale: MoraleResult = { grey: greyMoraleRate(filled.length), selfYellow: {}, allOperatorsYellow: 0 };
    for (const { x, c } of evaluated) {
      if (!c) continue;
      morale.allOperatorsYellow += c.roomMorale;
      // The Control Center's own, targeted and custom Morale was gathered above (ccSelfMorale).
      if (c.selfMorale && f.kind !== 'controlCenter') morale.selfYellow[x.slot.operatorName] = (morale.selfYellow[x.slot.operatorName] || 0) + c.selfMorale;
    }
    const ownRateIn = (opName: string, relief: number) => Math.max(0, morale.grey + morale.allOperatorsYellow + (morale.selfYellow[opName] || 0) - relief);
    // The window is facility-wide: the first operator anywhere in the room to run out of Morale ends it.
    const windowFor = (relief: number) => {
      const worstRate = filled.length > 0 ? Math.max(...filled.map((s) => ownRateIn(s.operatorName, relief))) : 0;
      return rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);
    };
    const moraleWindowCustom = (x: RoomSkill, c: SkillContribution, relief: number) => runCustom(c, {
      ...customContextBase(x.slot.operatorName, roomNames), rampWindowHours: windowFor(relief), selfMoraleRate: ownRateIn(x.slot.operatorName, relief),
    });

    if (f.kind === 'factory') {
      const results: { x: RoomSkill; c: SkillContribution; productivity: number; capacity: number; note?: string; formula?: string }[] = [];
      let othersSum = 0;
      const capacityByOp: Record<string, number> = {};
      for (const { x, c } of evaluated) {
        if (!c || c.custom) continue;
        results.push({ x, c, productivity: c.productivity, capacity: c.capacity });
        // Facility-count-based contributions (exempt from an override) are excluded from Waai Fu's "everyone else's" sum, per her text.
        if (c.productivity && !c.exemptFromOverride) othersSum += c.productivity;
        if (c.capacity) capacityByOp[x.slot.operatorName] = (capacityByOp[x.slot.operatorName] || 0) + c.capacity;
      }
      // Bubble and Vermeil read every operator's capacity change; Waai Fu what everyone else provides, Bubble and Vermeil included.
      for (const handler of ['bubble', 'vermeil', 'waaiFu']) for (const { x, c } of evaluated) {
        if (!c || c.custom?.handler !== handler) continue;
        const r = runCustom(c, { ...customContextBase(x.slot.operatorName, roomNames), capacityByOperator: capacityByOp, othersProductivitySum: othersSum });
        results.push({ x, c, productivity: r.productivity ?? 0, capacity: r.capacity ?? 0, note: r.note, formula: r.formula });
        if (handler !== 'waaiFu' && r.productivity) othersSum += r.productivity;
      }
      // Ramps and Totter: their average depends on the room's Morale window, known only once every other skill has resolved.
      for (const { x, c } of evaluated) {
        if (!c?.custom || CUSTOM_STAGE[c.custom.handler] !== 'moraleWindow') continue;
        const r = moraleWindowCustom(x, c, ccMoraleRelief);
        results.push({ x, c, productivity: r.productivity ?? 0, capacity: r.capacity ?? 0, note: r.note, formula: r.formula });
      }
      for (const r of results) {
        if (r.productivity) specialProductivitySum += r.productivity;
        if (r.capacity) specialCapacitySum += r.capacity;
        if (r.c.overridesOthers) { overrideActive = true; overrideProductivitySum += r.productivity; }
        if (r.c.exemptFromOverride) exemptProductivitySum += r.productivity;
      }
      const greyProductivity = calcGreyProductivity(workingCount(filled));
      const breakdownLines: FacilityBreakdownLine[] = results.map((r) => {
        const raw = r.productivity;
        let included: boolean, reason: string;
        if (r.c.exemptFromOverride) { included = raw !== 0; reason = 'Exempt -- this skill survives even when another skill overrides everyone else’s productivity.'; }
        else if (overrideActive) { included = r.c.overridesOthers && raw !== 0; reason = r.c.overridesOthers ? 'Counted -- this is the override skill itself.' : 'Excluded -- an override skill in this Factory replaces everyone else’s own productivity entirely.'; }
        else { included = raw !== 0; reason = raw === 0 ? 'No numeric productivity contribution for this Factory’s selected product.' : 'Counted normally.'; }
        return lineFor(r.x, r.c, raw, included, reason, { formula: r.formula, note: r.note });
      });
      const finalYellow = exemptProductivitySum + (overrideActive ? overrideProductivitySum : specialProductivitySum);
      facilityBreakdown = {
        filledCount: filled.length, greyProductivity,
        greyFormula: `1.01 + (${filled.length} - 1) × 0.01 = ${greyProductivity.toFixed(2)}`,
        overrideActive, lines: breakdownLines, finalYellow, effectiveProductivity: Math.max(0, greyProductivity + finalYellow),
      };
    } else if (f.kind === 'tradingPost') {
      const resultsTP: { x: RoomSkill | null; c: SkillContribution | null; orderEfficiency: number; orderLimit: number; note?: string; formula?: string; name: string }[] = [];
      const push = (x: RoomSkill | null, c: SkillContribution | null, r: { orderEfficiency?: number; orderLimit?: number; note?: string; formula?: string }, name = x?.slot.operatorName ?? '') =>
        resultsTP.push({ x, c, orderEfficiency: r.orderEfficiency ?? 0, orderLimit: r.orderLimit ?? 0, note: r.note, formula: r.formula, name });
      const grey = calcGreyProductivity(workingCount(filled));
      let othersEff = perTradingPostBonus.get(f.id) || 0;
      // Raw (including negatives) order limit total: Degenbrecher's Champion's Bearing and Swire's Investment Solicitations scale
      // off it, their own negative contributions netted in, and Jaye reads it for her effective order limit.
      let othersLimitRaw = perTradingPostOrderLimitBonus.get(f.id) || 0;
      const baseLimit = tradingPostBaseOrderLimit(f.level);
      for (const { x, c } of evaluated) {
        if (!c || c.custom) continue;
        push(x, c, { orderEfficiency: c.orderEfficiency, orderLimit: c.orderLimit });
        othersEff += c.orderEfficiency;
        othersLimitRaw += c.orderLimit;
      }
      const customs = evaluated.filter((e): e is { x: RoomSkill; c: SkillContribution } => !!e.c?.custom);
      // Champion's Bearing reads the limit increase before Basic Needs lowers it; Investment Solicitations afterward
      // (Annex 1's examples; the game data alone does not encode the ordering).
      for (const { x, c } of customs) {
        if (c.custom!.handler !== 'perOthersOrderLimit' || !c.custom!.params.beforeLimitChanges) continue;
        const r = runCustom(c, { ...customContextBase(x.slot.operatorName, roomNames), othersOrderLimitRawSum: othersLimitRaw });
        push(x, c, r); othersEff += r.orderEfficiency ?? 0;
      }
      const jaye = customs.filter(({ c }) => c.custom!.handler.startsWith('jaye'));
      const snowsant = customs.find(({ c }) => c.custom!.handler === 'snowsant');
      const tier = goldOrderTierOf(skills);
      const rule = tradeRuleOf(skills);
      if (jaye.length) {
        const promoted = jaye.some(({ c }) => c.custom!.handler === 'jayeBasicNeeds');
        const modeled = jayeContribution(baseLimit + othersLimitRaw, othersEff, snowsant ? snowsant.c.custom!.params.cap : 0, promoted, grey + ccEffects.tradingPostBonus, loginInterval, f.level, tradingPostExpectedMinutes(tier, f.level));
        push(null, null, { orderEfficiency: modeled.jaye, orderLimit: modeled.limitReduction, note: promoted ? 'Street Economics + Basic Needs cancel queue dependence. Snowsant copies other operators first, then Basic Needs uses that combined bonus (game glossary: Special Interaction Rules).' : `Expected average from an empty queue over ${loginInterval}h between collections; speed is recalculated after every expected order.` }, 'Jaye');
        if (snowsant) push(null, null, { orderEfficiency: modeled.snowsant }, 'Snowsant');
        othersLimitRaw += modeled.limitReduction;
      }
      for (const { x, c } of customs) {
        if (c.custom!.handler.startsWith('jaye') || (c.custom!.handler === 'snowsant' && jaye.length) || (c.custom!.handler === 'perOthersOrderLimit' && c.custom!.params.beforeLimitChanges)) continue;
        push(x, c, runCustom(c, { ...customContextBase(x.slot.operatorName, roomNames), othersOrderEfficiencySum: othersEff, othersOrderLimitRawSum: othersLimitRaw }));
      }
      for (const r of resultsTP) {
        specialProductivitySum += r.orderEfficiency;
        specialOrderLimitSum += r.orderLimit;
        if (r.c?.overridesOthers) { overrideActive = true; overrideProductivitySum += r.orderEfficiency; }
      }
      const tpBreakdownLines: FacilityBreakdownLine[] = [];
      if (tier !== 'base') tpBreakdownLines.push({ operatorName: '(Order quality)', skillName: null, rawValue: 0, included: false, reason: 'Quality-weighted output estimate.', note: 'Uses mature Lv3 observed order probabilities. Warm-up and lower-level quality distributions are not verified; their output is an approximation.' });
      if (jaye.length && customs.some(({ c }) => c.custom!.handler === 'perOthersOrderLimit')) tpBreakdownLines.push({ operatorName: 'Jaye', skillName: null, rawValue: 0, included: false, reason: 'Observed capacity/efficiency ordering.', note: 'Uses the supplied Annex 1 examples: Degenbrecher before Basic Needs, Swire afterward. The game tables do not encode the ordering.' });
      if (rule.closure && rule.pepe) tpBreakdownLines.push({ operatorName: '(Special orders)', skillName: null, rawValue: 0, included: false, reason: 'Conflicting special order types.', note: 'Pepe’s fixed order is used; the priority against Closure’s Special Orders has not been verified.' });
      for (const r of resultsTP) {
        const raw = r.orderEfficiency;
        let included: boolean, reason: string;
        if (overrideActive) { included = !!r.c?.overridesOthers && raw !== 0; reason = r.c?.overridesOthers ? 'Counted -- this is the override skill itself.' : 'Excluded -- an override skill in this Trading Post replaces everyone else’s own order efficiency entirely.'; }
        else { included = raw !== 0; reason = raw === 0 ? 'No numeric order efficiency contribution (may still affect order limit or Morale separately).' : 'Counted normally.'; }
        tpBreakdownLines.push(r.x ? lineFor(r.x, r.c, raw, included, reason, { formula: r.formula, note: r.note }) : { operatorName: r.name, skillName: null, rawValue: raw, included, reason, ...(r.note ? { note: r.note } : {}) });
      }
      const tpFinalYellow = overrideActive ? overrideProductivitySum : specialProductivitySum;
      facilityBreakdown = {
        filledCount: filled.length, greyProductivity: grey,
        greyFormula: `1.01 + (${filled.length} - 1) × 0.01 = ${grey.toFixed(2)}`,
        overrideActive, lines: tpBreakdownLines, finalYellow: tpFinalYellow, effectiveProductivity: Math.max(0, grey + tpFinalYellow),
      };
    }

    ccMoraleRelief = reliefFor(f.kind);
    const productivity = PRODUCTIVITY_KINDS.has(f.kind) ? { grey: calcGreyProductivity(workingCount(filled)), yellow: 0 } : null;
    // Layer Control Center's highest-only global bonus on top of this facility's own local skill contributions.
    if (productivity) {
      if (f.kind === 'tradingPost') {
        const ccBonusTotal = ccEffects.tradingPostBonus + (perTradingPostBonus.get(f.id) || 0);
        productivity.yellow = (overrideActive ? overrideProductivitySum : specialProductivitySum) + ccBonusTotal;
        if (facilityBreakdown) {
          if (ccBonusTotal !== 0) {
            facilityBreakdown.lines.push({ operatorName: '(Control Center)', skillName: null, rawValue: ccBonusTotal, included: true, reason: 'Cross-facility Order Efficiency bonus (Control Center highest-only bonus plus any per-Trading-Post bonus) -- added after this room’s own local skills.' });
          }
          facilityBreakdown.finalYellow = productivity.yellow;
          facilityBreakdown.effectiveProductivity = Math.max(0, facilityBreakdown.greyProductivity + productivity.yellow);
        }
      }
      if (f.kind === 'factory') {
        // "Zero out everyone else" skills (Snegurochka, Automation family) replace every other LOCAL contribution except
        // the ones granted by facility count (Purestream, Thorns); the Control Center's cross-facility bonuses always apply.
        productivity.yellow = overrideActive ? overrideProductivitySum + exemptProductivitySum : specialProductivitySum;
        productivity.yellow += ccEffects.factoryBonus;
        if (factoryProducts[f.id] === 'Precious Metals') productivity.yellow += factoryPreciousMetalBonusFromCC;
        productivity.yellow += perFactoryProductivityBonus.get(f.id) || 0;
        if (facilityBreakdown) {
          // One line per contributing skill, with the multiplier spelled out, not one per affected operator.
          const groupedSources = new Map<string, { operatorName: string; skillName: string | null; per: number; count: number }>();
          for (const src of perFactoryProductivitySources.get(f.id) || []) {
            const groupKey = `${src.operatorName}|${src.skillName ?? ''}`;
            const held = groupedSources.get(groupKey);
            if (held) held.count += 1; else groupedSources.set(groupKey, { operatorName: src.operatorName, skillName: src.skillName, per: src.amount, count: 1 });
          }
          for (const g of groupedSources.values()) {
            facilityBreakdown.lines.push({ operatorName: g.operatorName, skillName: g.skillName, rawValue: g.per * g.count, included: true, reason: 'Cross-facility bonus targeting this Factory specifically -- added after this room’s own local skills.', ...(g.count > 1 ? { formula: `${(g.per * 100).toFixed(2)}% x ${g.count} operators = ${(g.per * g.count * 100).toFixed(2)}%` } : {}) });
          }
          const sharedCcFactoryBonus = ccEffects.factoryBonus + (factoryProducts[f.id] === 'Precious Metals' ? factoryPreciousMetalBonusFromCC : 0);
          if (sharedCcFactoryBonus !== 0) {
            facilityBreakdown.lines.push({ operatorName: '(Control Center)', skillName: null, rawValue: sharedCcFactoryBonus, included: true, reason: 'Cross-facility Factory productivity bonus (Control Center highest-only bonus, plus any Precious-Metal-specific bonus) -- added after this room’s own local skills.' });
          }
          facilityBreakdown.finalYellow = productivity.yellow;
          facilityBreakdown.effectiveProductivity = Math.max(0, facilityBreakdown.greyProductivity + productivity.yellow);
        }
      }
    }

    const capacity = f.kind === 'factory' ? { base: factoryBaseCapacity(f.level), adjustment: specialCapacitySum } : null;
    const orderLimit = f.kind === 'tradingPost' ? { base: tradingPostBaseOrderLimit(f.level), adjustment: specialOrderLimitSum + (perTradingPostOrderLimitBonus.get(f.id) || 0) } : null;
    let clueSpeed: number | null = null;
    let clueSpeedBase: number | null = null;
    if (f.kind === 'receptionRoom') {
      const lines: FacilityBreakdownLine[] = [];
      let specialClueSum = 0;
      for (const { x, c } of evaluated) {
        if (!c) continue;
        const r = c.custom ? moraleWindowCustom(x, c, ccMoraleRelief) : {};
        const raw = c.clueSpeed + (r.clueSpeed ?? 0);
        specialClueSum += raw;
        lines.push(lineFor(x, c, raw, raw !== 0, c.custom ? 'Ramping skill -- scales with the room’s own Morale window.' : raw === 0 ? 'No numeric Clue search speed effect.' : 'Counted normally.', { formula: r.formula, note: r.note }));
      }
      clueSpeed = specialClueSum + ccEffects.clueCollectionBonus + officeReceptionRoomBonus + receptionRoomClueSpeedFromCC;
      clueSpeedBase = calcReceptionRoomBaseSpeed(filled.map((s) => ({ rarity: operatorByName.get(s.operatorName)?.rarity ?? null, eliteLevel: s.eliteLevel, exhausted: importedMorale?.[s.operatorName] === 0 })));
      const receptionBreakdownLines: FacilityBreakdownLine[] = [];
      // Itemise the base speed per operator, zero contributions included, so a 3-star at Elite 0 visibly adds nothing.
      for (const slot of filled) {
        const rarity = operatorByName.get(slot.operatorName)?.rarity ?? null;
        const contribution = receptionRoomBaseContribution({ rarity, eliteLevel: slot.eliteLevel, exhausted: importedMorale?.[slot.operatorName] === 0 });
        const eliteLabel = slot.eliteLevel === 'Base' ? 'Elite 0' : slot.eliteLevel ?? 'Elite 0';
        receptionBreakdownLines.push({ operatorName: slot.operatorName, skillName: 'in the room', rawValue: contribution.slotted, included: contribution.slotted !== 0, reason: 'Every working operator adds this, whether or not their skill does anything here. Exhausted operators retain rarity and promotion bonuses.' });
        receptionBreakdownLines.push({ operatorName: slot.operatorName, skillName: rarity ? `${rarity}★ rarity` : 'rarity', rawValue: contribution.rarity, included: contribution.rarity !== 0, reason: contribution.rarity !== 0 ? 'Rarity bonus: 6★ +5%, 5★ +4%, 4★ +2%.' : 'Rarity bonus only applies at 4★ and above.' });
        receptionBreakdownLines.push({ operatorName: slot.operatorName, skillName: eliteLabel, rawValue: contribution.elite, included: contribution.elite !== 0, reason: contribution.elite !== 0 ? 'Promotion bonus: Elite 2 +16%, Elite 1 +8%.' : 'Promotion bonus starts at Elite 1 -- Elite 0 adds nothing.' });
      }
      receptionBreakdownLines.push(...lines);
      if (ccEffects.clueCollectionBonus !== 0) receptionBreakdownLines.push({ operatorName: clueCollectionSource?.operatorName ?? '(Control Center)', skillName: clueCollectionSource?.skillName ?? null, rawValue: ccEffects.clueCollectionBonus, included: true, reason: 'Highest single Clue Collection Speed bonus among Control Center operators -- only the strongest of this type applies, so any others in the room contribute nothing.' });
      if (officeReceptionRoomBonus !== 0) receptionBreakdownLines.push({ operatorName: '(Office)', skillName: null, rawValue: officeReceptionRoomBonus, included: true, reason: 'Cross-facility bonus from an Office skill.' });
      for (const src of receptionRoomClueSpeedSources) receptionBreakdownLines.push({ operatorName: src.operatorName, skillName: src.skillName, rawValue: src.amount, included: src.amount !== 0, reason: 'Control Center cross-facility bonus aimed at this room -- additive, so it stacks with the highest-only Clue Collection Speed above rather than competing with it.' });
      facilityBreakdown = {
        filledCount: filled.length, greyProductivity: clueSpeedBase,
        greyFormula: `100% room baseline + each operator's three contributions itemised below = ${(clueSpeedBase * 100).toFixed(2)}%`,
        overrideActive: false, lines: receptionBreakdownLines, finalYellow: clueSpeed, effectiveProductivity: clueSpeedBase + clueSpeed,
      };
    }
    if (f.kind === 'controlCenter' && filled.length > 0) {
      // The Control Center produces Morale for its own occupants plus bonuses that land in other facilities.
      facilityBreakdown = {
        filledCount: filled.length, greyProductivity: 0,
        greyFormula: 'no baseline -- the Control Center produces Morale for this room plus bonuses that land elsewhere',
        overrideActive: false, lines: ccBreakdownLines.filter((line) => filled.some((slot) => slot.operatorName === line.operatorName)),
        finalYellow: ccEffects.ccMoraleBonus, effectiveProductivity: ccEffects.ccMoraleBonus,
      };
    }
    let droneRate: number | null = null;
    if (f.kind === 'powerPlant') {
      // building_data.powerData.basicSpeedBuff: +5% per staffed plant.
      let total = 0.05 * workingCount(filled);
      const lines: FacilityBreakdownLine[] = [];
      for (const { x, c } of evaluated) {
        if (!c) continue;
        const r = c.custom ? moraleWindowCustom(x, c, ccMoraleRelief) : {};
        const raw = c.droneRate + (r.droneRate ?? 0);
        total += raw;
        lines.push(lineFor(x, c, raw, raw !== 0, raw !== 0 ? 'Counted normally.' : x.entry?.shape === 'flat' || x.entry?.shape === 'pool' ? 'No numeric drone recovery effect.' : 'No drone recovery contribution under the current setup.', { formula: r.formula, note: r.note }));
      }
      droneRate = total;
      if (filled.length > 0) facilityBreakdown = { filledCount: filled.length, greyProductivity: 0.05 * workingCount(filled), greyFormula: '5% innate charging bonus from the plant operator, plus skill bonuses', overrideActive: false, lines, finalYellow: total - 0.05 * workingCount(filled), effectiveProductivity: total };
    }

    let office: { speed: number; ownSpeed: number; ccBonus: number; refreshHours: number } | null = null;
    let trainingSpeed: number | null = null;
    let trainingHours: number | null = null;
    const recipe = workshopRecipes.find(r => r.id === workshopSettings.recipeId && r.level <= f.level) ?? workshopRecipes.find(r => r.level <= f.level)!;
    let workshop: ReturnType<typeof workshopOutcome> | null = null;
    if (f.kind === 'workshop' && filled[0] && recipe) {
      // The crafter's skills against the recipe: its kind (the effects' targets), name and base Morale cost.
      const crafter = filled[0];
      const scoped = skills.filter((x) => x.slot === crafter && x.entry).map((x) => ({ x, scope: roomScope(f, filled, crafter.operatorName, { recipe }) }));
      const contributions = scoped.map(({ x, scope }) => evaluateSkill(x.entry!, scope));
      const moraleCost = workshopMorale(contributions, recipe);
      const customs = contributions.filter((c) => c.custom).map((c) => runCustom(c, { ...customContextBase(crafter.operatorName, roomNames), workshop: { recipeMorale: recipe.morale, moraleCost, causality: workshopSettings.causality, karma: workshopSettings.karma, thornsFailures: workshopSettings.thornsFailures } }));
      // For the reader, from the skills that apply to this recipe's kind: their notes (what a T3 byproduct becomes) and
      // the Dormitory head counts the counted skills read.
      const applies = (targets: readonly string[], scope: SkillScope) => !targets.length || scope.targetMatches!(targets);
      const entryNotes = scoped.flatMap(({ x, scope }) => x.entry!.note && applies(x.entry!.targets, scope) ? [x.entry!.note] : []);
      const dormCounts = scoped.flatMap(({ x, scope }) => x.entry!.effects.filter((e) => e.per?.count.startsWith('dorm.morale') && applies(e.targets ?? [], scope)).map((e) => scope.count(e.per!.count)));
      workshop = workshopOutcome(contributions, recipe, customs, entryNotes, dormCounts);
    }
    if (f.kind === 'office') {
      let hr = 0;
      for (const { c } of evaluated) if (c) hr += c.hrSpeed;
      const ownSpeed = 0.05 * workingCount(filled) + hr;
      const combinedSpeed = ownSpeed + officeHrSpeedBonusFromCC;
      office = { speed: combinedSpeed, ownSpeed, ccBonus: officeHrSpeedBonusFromCC, refreshHours: 12 / (1 + combinedSpeed) };
    }

    if (f.kind === 'trainingRoom' && filled[0]) {
      // The trainer's skills against the trainee: class (the effects' targets), branch and the mastery being trained.
      const trainer = filled[0];
      const target = { ...resolvedTrainingTarget, mastery: Math.min(trainingTarget.mastery, f.level) };
      const contributions = skills.filter((x) => x.slot === trainer && x.entry).map((x) => ({ x, c: evaluateIn(f, filled, x, { trainee: target })! }));
      const result = trainingOutcome(contributions.map(({ c }) => c), target, trainingSpeedBonusFromCC);
      trainingSpeed = result.speed;
      trainingHours = result.hours;
      facilityBreakdown = { filledCount: 1, greyProductivity: 1.05, greyFormula: '100% baseline + 5% from the trainer', overrideActive: false, lines: contributions.map(({ x, c }) => ({ operatorName: trainer.operatorName, skillName: x.skill.name, rawValue: c.trainingSpeed, included: c.trainingSpeed !== 0, reason: c.trainingSpeed ? 'Applies to the selected trainee, mastery and placed group members.' : 'No speed bonus for this target; the skill may change time or Morale instead.', note: c.entry.note, formula: c.formula })), finalYellow: result.speed - 1.05, effectiveProductivity: result.speed };
      if (trainingSpeedBonusFromCC) facilityBreakdown.lines.push({ operatorName: '(Control Center)', skillName: null, rawValue: trainingSpeedBonusFromCC, included: true, reason: 'Strongest Control Center training bonus.' });
      perOperatorSpecialMorale[trainer.operatorName] = result.morale;
      for (const { c } of contributions) if (c.entry.note) specialNotes.push({ operator: trainer.operatorName, note: c.entry.note });
    }

    // Training Room and Workshop skills own their Morale; the table's Morale numbers for those rooms are not rates the room reads.
    if (f.kind === 'trainingRoom' || f.kind === 'workshop') { morale.allOperatorsYellow = 0; for (const k of Object.keys(morale.selfYellow)) delete morale.selfYellow[k]; }
    // Every facility gets morale relief from however many operators are in the Control Center, on top of its own skills'.
    // The Control Center itself uses the base portion only (the cross-facility effects are for every OTHER facility) plus
    // its own skills' stacking Morale.
    const facilityMoraleYellowShared = morale.allOperatorsYellow - (f.kind === 'controlCenter' ? ccEffects.ccMoraleBonus + ccBaseMoraleRelief : ccMoraleRelief) - 0;
    // Workshop Morale is spent per craft, never by an hourly staffing clock.
    const combinedMoraleRate = f.kind === 'workshop' ? 0 : Math.max(0, morale.grey + facilityMoraleYellowShared);

    // Always individualized per operator: Morale almost always decreases differently per operator once any of them
    // has their own self-only modifier.
    let perOperatorMorale: Record<string, number> | null = null;
    if (f.kind !== 'dormitory' && f.kind !== 'workshop' && filled.length > 0) {
      perOperatorMorale = {};
      const cancelsSui = f.kind === 'controlCenter' && skills.some((x) => x.entry?.interaction?.cancelsSuiSelfDrain);
      for (const slot of filled) {
        const opName = slot.operatorName;
        let selfOnly = (morale.selfYellow[opName] || 0) + (perOperatorSpecialMorale[opName] || 0) + (f.kind === 'controlCenter' ? (ccSelfMorale[opName] || 0) : 0);
        // Ling clears the Sui operators' own Morale LOSS (Chongyue's +0.5); their own savings (Dusk's -0.5) stay.
        if (cancelsSui && SUI.has(opName) && !skills.some((x) => x.slot.operatorName === opName && x.entry?.interaction?.cancelsSuiSelfDrain)) selfOnly = Math.min(0, selfOnly);
        const immune = skills.some((x) => x.slot.operatorName === opName && x.entry?.interaction?.immuneToRoomMorale);
        const rateBeforeSelf = immune ? Math.max(0, morale.grey + facilityMoraleYellowShared - morale.allOperatorsYellow) : combinedMoraleRate;
        perOperatorMorale[opName] = Math.max(0, rateBeforeSelf + selfOnly);
      }
    }

    // Worst-case (highest-rate, i.e. first-to-die) operator's time, for the shared Full/Dead-time display.
    const worstCaseMoraleRate = perOperatorMorale ? Math.max(combinedMoraleRate, ...Object.values(perOperatorMorale)) : combinedMoraleRate;
    let deadTime = filled.length > 0 && f.kind !== 'workshop' ? calcDeadTime(worstCaseMoraleRate) : null;
    if (baseSource === 'account' && filled.length && f.kind !== 'workshop' && f.kind !== 'dormitory') {
      const known = filled.every(s => importedMorale?.[s.operatorName] !== undefined);
      const times = filled.map(s => {
        const current = importedMorale?.[s.operatorName] ?? 0;
        const rate = perOperatorMorale?.[s.operatorName] ?? combinedMoraleRate;
        return current === 0 ? 0 : rate > 0 ? current / rate : Infinity;
      });
      const first = Math.min(...times);
      deadTime = known && Number.isFinite(first) ? first : null;
    }

    let fullTime: number | null = null;
    if (f.kind === 'factory' && productivity && capacity) {
      fullTime = calcFullTime(capacity.base + capacity.adjustment, productivity.grey + productivity.yellow, factoryProducts[f.id] || null);
    } else if (f.kind === 'tradingPost' && productivity && orderLimit) {
      const rule = tradeRuleOf(skills);
      fullTime = calcTradingPostFullTime(Math.max(1, orderLimit.base + orderLimit.adjustment), productivity.grey + productivity.yellow, f.level, goldOrderTierOf(skills), rule.closure ? 144 : undefined);
      if (rule.pepe) fullTime = Math.max(1, orderLimit.base + orderLimit.adjustment) * 4.5;
    }

    return {
      productivity, capacity, orderLimit,
      morale: { grey: morale.grey, yellow: facilityMoraleYellowShared },
      clueSpeed, clueSpeedBase, droneRate, office, trainingSpeed, trainingHours, workshop,
      combinedMoraleRate, perOperatorMorale, deadTime, fullTime, facilityBreakdown, specialNotes,
    };
  }

  // ---------------------------------------------------------------- Dormitories
  const dormitoryRecoveryByFacility: Record<string, { name: string; base: number; bonus: number }[]> = {};
  for (const f of FACILITIES) {
    if (f.kind !== 'dormitory') continue;
    const slots = filledOf(f);
    const roomNames = slots.map((s2) => s2.operatorName);
    const moraleByOperator = Object.fromEntries(slots.map(s => [s.operatorName, s.morale ?? 0]));
    const pickOrder = dormitoryPickOrder?.[f.id];
    const skills = roomSkills.get(f.id) ?? [];
    // Skills that look at a roommate's Morale (Bobbing, Coldshot: who is below 24) are noticed as they count it.
    let readMorale = false;
    const watchedMorale = new Proxy(moraleByOperator, { get: (target, key) => { readMorale = true; return Reflect.get(target, key); } });
    const thisRoomBaseRecovery = calcDormitoryRecovery(f.level, dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level));
    const providerBonuses = skills.flatMap((x) => x.entry?.interaction?.providerBonus ? [x.entry.interaction.providerBonus] : []);
    const perSlotResults: DormRecoveryProvider[] = slots.map((s) => {
      const own = skills.filter((x) => x.slot.operatorName === s.operatorName);
      // The roommate a single-target skill goes to: a preferred one when present and below full Morale, else the
      // least-Morale one below full (the room's order breaking ties, or the simulator's pick order).
      const preferring = own.find((x) => x.entry?.interaction?.preferredTarget)?.entry?.interaction;
      const preferred = preferring?.preferredTarget ? [preferring.preferredTarget, ...(preferring.preferredTargetForms ?? [])] : [];
      const byNeed = (a: string, b: string) => pickOrder ? pickOrder.indexOf(a) - pickOrder.indexOf(b) : moraleByOperator[a] - moraleByOperator[b];
      const targetIfSelected =
        preferred.filter(n => roomNames.includes(n) && moraleByOperator[n] < 24).sort(byNeed)[0] ??
        roomNames.filter(n => n !== s.operatorName && moraleByOperator[n] < 24).sort(byNeed)[0] ??
        null;
      const provider: DormRecoveryProvider = { name: s.operatorName, selfBonus: 0, allOperatorsBonus: 0, allOthersBonus: 0, singleTargetBonus: 0, targetIfSelected };
      for (const x of own) {
        const c = evaluateIn(f, slots, x, { target: targetIfSelected, moraleByOperator: watchedMorale });
        if (!c) continue;
        provider.selfBonus += c.recovery.self;
        provider.allOperatorsBonus += c.recovery.all;
        provider.allOthersBonus += c.recovery.others;
        provider.singleTargetBonus += c.recovery.single;
        if (c.recovery.exclusive !== undefined) provider.exclusiveRecovery = c.recovery.exclusive;
        if (c.recovery.conditionalGroup) provider.conditionalGroupBonus = c.recovery.conditionalGroup;
        if (c.recovery.distributed !== undefined) {
          const recipients = roomNames.filter(n => (watchedMorale[n] ?? 0) < 24);
          provider.distributedBonus = { recipients, amount: recipients.length ? c.recovery.distributed / recipients.length : 0 };
        }
        if (x.entry?.interaction?.recipientBonus) provider.recipientBonus = x.entry.interaction.recipientBonus;
      }
      return provider;
    });
    // Which Morale this room's recovery reads, for every occupant.
    const singleTarget = perSlotResults.some(p => p.singleTargetBonus > 0 || p.distributedBonus);
    if (singleTarget) moraleOrder[f.id] = roomNames;
    for (const name of roomNames) {
      if (singleTarget) readsMorale(name, 24);
      for (const p of perSlotResults) if (p.conditionalGroupBonus) readsMorale(name, p.conditionalGroupBonus.below);
      if (readMorale || perSlotResults.some(p => p.distributedBonus)) readsMorale(name, 24);
    }
    dormitoryRecoveryByFacility[f.id] = dormitoryRecoveryRates(perSlotResults, thisRoomBaseRecovery, rosters, moraleByOperator, providerBonuses, ccDormitoryAllOperatorsRelief, ccDormitoryEliteOperatorsRelief);
  }

  const rooms = Object.fromEntries(FACILITIES.map(f => [f.id, productivityFor(f, ccEffects, ccMoraleRelief)]));

  // ---------------------------------------------------------------- base-wide output
  // Green is the realistic daily average at the player's login interval (a room that caps out before the next login
  // sits idle); Red the ideal with collection the instant a room caps, always >= Green.
  let dailyExpGreen = 0;
  let dailyExpRed = 0;
  let dailyGoldMadeGreen = 0;
  let dailyGoldMadeRed = 0;
  let dailyGoldSoldGreen = 0;
  let dailyGoldFromProvisoGreen = 0;
  let dailyGoldFromProvisoRed = 0;
  let dailyGoldSoldRed = 0;
  let dailyExtraLmdFromOrdersGreen = 0;
  let dailyExtraLmdFromOrdersRed = 0;
  let dailyLmdFromPepeGreen = 0; // Pepe's Special Exclusive Orders: no gold bar at all, fixed 270 min per order
  let dailyLmdFromPepeRed = 0;

  // Each room's own share of the Red (never idle) totals above, per day, so a chronological simulation can apply its
  // own storage and Morale cut-offs.
  const roomDailyOutput: Record<string, RoomDailyOutput> = {};
  for (const f of FACILITIES) {
    if (f.capacity <= 0) continue;
    // An unmanned room, or one whose every worker is exhausted, cannot turn a base-wide bonus into output on its own.
    if (!workingCount(filledOf(f))) continue;
    const { productivity, deadTime, fullTime } = rooms[f.id];
    const roomOutput = { exp: 0, goldMade: 0, goldSold: 0, extraLmd: 0, pepeLmd: 0 };
    roomDailyOutput[f.id] = roomOutput;
    const capHours = fullTime !== null && deadTime !== null ? Math.min(fullTime, deadTime) : fullTime !== null ? fullTime : deadTime;
    const cyclesPerDay = 24 / loginInterval;
    const realisticFraction = capHours !== null ? (Math.min(capHours, loginInterval) * cyclesPerDay) / 24 : 1;
    const idealFraction = 1;

    if (f.kind === 'factory' && productivity) {
      const product = factoryProducts[f.id];
      const effectiveProductivity = productivity.grey + productivity.yellow;
      if (product === 'Battle Records') {
        const perDay = calcDailyProduction(effectiveProductivity, 'Battle Records') * 1000;
        dailyExpGreen += perDay * realisticFraction;
        dailyExpRed += perDay * idealFraction;
        roomOutput.exp += perDay * idealFraction;
      } else if (product === 'Precious Metals') {
        const perDay = calcDailyProduction(effectiveProductivity, 'Precious Metals');
        dailyGoldMadeGreen += perDay * realisticFraction;
        dailyGoldMadeRed += perDay * idealFraction;
        roomOutput.goldMade += perDay * idealFraction;
      }
    }
    if (f.kind === 'tradingPost' && productivity) {
      const effectiveProductivity = productivity.grey + productivity.yellow;
      const skills = roomSkills.get(f.id) ?? [];
      const rule = tradeRuleOf(skills);
      const goldTier = goldOrderTierOf(skills);
      const realisticHours = realisticFraction * 24;
      const idealHours = idealFraction * 24;
      if (rule.pepe) {
        dailyLmdFromPepeGreen += (realisticHours * 60 / 270) * 1000;
        dailyLmdFromPepeRed += (idealHours * 60 / 270) * 1000;
        roomOutput.pepeLmd += (idealHours * 60 / 270) * 1000;
      } else if (rule.closure) {
        // Fixed 2-gold/1200-LMD, 144-minute orders; not Defaulted.
        const tradesPerHour = effectiveProductivity / 2.4;
        dailyGoldSoldGreen += 2 * tradesPerHour * realisticHours;
        dailyGoldSoldRed += 2 * tradesPerHour * idealHours;
        roomOutput.goldSold += 2 * tradesPerHour * idealHours;
        dailyExtraLmdFromOrdersGreen += 200 * tradesPerHour * realisticHours;
        dailyExtraLmdFromOrdersRed += 200 * tradesPerHour * idealHours;
        roomOutput.extraLmd += 200 * tradesPerHour * idealHours;
      } else if (rule.fixedGold !== null) {
        const perHour = calcTradingPostGoldPerHourStandardized(effectiveProductivity, rule.fixedGold, f.level);
        dailyGoldSoldGreen += perHour * realisticHours;
        dailyGoldSoldRed += perHour * idealHours;
        roomOutput.goldSold += perHour * idealHours;
      } else {
        // Tailoring's distribution tier, Proviso's gold bonus and Tequila's LMD bonus all apply together.
        const { goldPerHour, extraLmdPerHour } = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, rule.provisoBonus, rule.tequilaLmdBonus, goldTier, f.level);
        dailyGoldSoldGreen += goldPerHour * realisticHours;
        dailyGoldSoldRed += goldPerHour * idealHours;
        roomOutput.goldSold += goldPerHour * idealHours;
        dailyExtraLmdFromOrdersGreen += extraLmdPerHour * realisticHours;
        dailyExtraLmdFromOrdersRed += extraLmdPerHour * idealHours;
        roomOutput.extraLmd += extraLmdPerHour * idealHours;
        if (rule.provisoBonus > 0) {
          const withoutProviso = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, 0, rule.tequilaLmdBonus, goldTier, f.level);
          const provisoGoldPerHour = goldPerHour - withoutProviso.goldPerHour;
          dailyGoldFromProvisoGreen += provisoGoldPerHour * realisticHours;
          dailyGoldFromProvisoRed += provisoGoldPerHour * idealHours;
        }
      }
    }
  }
  // LMD only comes from gold actually SOLD (Trading Post), not gold merely produced (Factory).
  const dailyGoldWorthGreen = dailyGoldSoldGreen * 500 + dailyExtraLmdFromOrdersGreen + dailyLmdFromPepeGreen;
  const dailyGoldWorthRed = dailyGoldSoldRed * 500 + dailyExtraLmdFromOrdersRed + dailyLmdFromPepeRed;

  return { moraleLevels, moraleOrder, rooms, roomDailyOutput, productivityFor, operatorByName, totalMonsterMeal, resourcePools, ccEffects, ccMoraleRelief, totalFelvine, dormitoryOperatorNames, dormitoryRecoveryByFacility, dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed, dailyGoldSoldGreen, dailyGoldFromProvisoGreen, dailyGoldFromProvisoRed, dailyGoldSoldRed, dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed, dailyGoldWorthGreen, dailyGoldWorthRed };
}
