import { BaseSkillSlots } from '@/lib/base/baseSkillSlots';
import { BaseOperator, BaseSkill } from '@/lib/operators/operatorTypes';
import { BaseAssignments, FactoryProducts, DormitoryAmbience, SlotAssignment } from '@/lib/base/baseTypes';
import {
  calcProductivity,
  calcCapacity,
  calcCapacityPerOperator,
  calcOrderLimit,
  calcMorale,
  calcClueSpeed,
  calcReceptionRoomBaseSpeed,
  receptionRoomBaseContribution,
  calcDroneRate,
  calcFullTime,
  calcDeadTime,
  calcDailyProduction,
  calcControlCenterEffects,
  clueCollectionBonusFrom,
  calcControlCenterMoraleRelief,
  calcOffice,
  calcTradingPostFullTime,
  calcTradingPostGoldPerHourStandardized,
  goldOrderTier,
  tradingPostExpectedMinutes,
  calcTradingPostGoldAndLmdPerHour,
  ControlCenterEffects,
  calcGreyProductivity,
  factoryYellowContribution,
  tradingPostYellowContribution,
  calcDormitoryRecovery,
  defaultDormitoryAmbience,
} from '@/lib/base/baseProductivity';
import { FACTORY_SPECIAL_SKILLS, FactorySkillContext } from '@/lib/base/factorySpecialSkills';
import { DORMITORY_SPECIAL_SKILLS, DORMITORY_PREFERRED_TARGET } from '@/lib/base/dormitorySpecialSkills';
import { RECEPTION_ROOM_SPECIAL_SKILLS } from '@/lib/base/receptionRoomSpecialSkills';
import { POWER_PLANT_SPECIAL_SKILLS } from '@/lib/base/powerPlantSpecialSkills';
import { OFFICE_SPECIAL_SKILLS } from '@/lib/base/officeSpecialSkills';
import { TRADING_POST_SPECIAL_SKILLS, TradingPostContext } from '@/lib/base/tradingPostSpecialSkills';
import { CONTROL_CENTER_SPECIAL_SKILLS } from '@/lib/base/controlCenterSpecialSkills';
import {
  computeResourcePools,
  consumerBonuses,
  BaseResourceState,
  pureGoldProductionLineCount,
  ResourcePools,
  LayoutCounts,
} from '@/lib/base/baseResources';
import { activeBaseSkills } from '@/lib/base/activeBaseSkills';
import { specialSkillKey, hasNamedSkill, type NamedSkillCheck } from '@/lib/base/specialSkillKeys';
import { jayeContribution } from '@/lib/base/jaye';
import { workshopResult, type WorkshopRecipe, type WorkshopSettings } from '@/lib/base/workshopSkills';
import { dormitoryRecoveryRates } from '@/lib/base/dormitoryRecovery';
import { crossFacilityMoraleRelief } from '@/lib/base/crossFacilityMorale';
import { trainingResult, resolveTrainingTarget, type TrainingTarget } from '@/lib/base/trainingRoomSkills';
import type { BaseRosters } from './baseGroupRosters';
import type { FacilityDef } from './baseTypes';

/** One room's output per day at its current rates, never idle: Battle Record EXP,
 * Precious Metals made, gold sold by Trading Posts, and LMD beyond 500 per gold. */
export interface RoomDailyOutput { exp: number; goldMade: number; goldSold: number; extraLmd: number; pepeLmd: number }

const PRODUCTIVITY_KINDS = new Set(['factory', 'tradingPost']);

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
}

/** The complete cross-room calculator used by /base and scenario regressions. */
export function calculateBase(input: BaseCalculationInput) {
  const { operators, rosters, skillSlots, facilities: FACILITIES, assignments, factoryProducts, workshopRecipes, importedMorale,
    dormitoryAmbience = {}, loginInterval = 24, swapPolicy = 'onMoraleZero', clueExchangeActive = false, moraleAbove12 = true,
    trainingTarget = { class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false },
    workshopSettings = { recipeId: '1', qualifyingDormOperators: 0, causality: 0, karma: 0, thornsFailures: 0 },
  } = input;
  const baseSource = importedMorale ? 'account' : 'planner';
  const resolvedTrainingTarget = resolveTrainingTarget(trainingTarget, operators);
  const { ELITE_OPERATOR, ABYSSAL_HUNTERS, OPERATION_PLATFORM, BLACKSTEEL_WORLDWIDE, TEAM_RAINBOW, DURIN, PINUS_SYLVESTRIS, WANDERING_MEDIC, SUI, KNIGHTS, LATERANO, RHINE_LAB } = rosters;
  const layoutCounts: LayoutCounts = {
    tradingPostCount: FACILITIES.filter(f => f.kind === 'tradingPost' && f.level > 0).length,
    factoryCount: FACILITIES.filter(f => f.kind === 'factory' && f.level > 0).length,
    powerPlantCount: FACILITIES.filter(f => f.kind === 'powerPlant' && f.level > 0).length,
  };
  const totalDormitoryLevels = FACILITIES.filter(f => f.kind === 'dormitory').reduce((s,f) => s + f.level, 0);
  function rampWindow(hoursUntilMoraleGone: number): number {
    return Math.min(24, swapPolicy === 'onLogin' ? Math.min(loginInterval, hoursUntilMoraleGone) : hoursUntilMoraleGone);
  }
  function cleanSkillName(name: string | null): string | null {
    return name?.split('Replaces')[0].trim() ?? null;
  }
  function skillsFor(slot: SlotAssignment | null, facilityLabel: string): BaseSkill[] {
    // Exhausted operators retain their physical assignment, but their working
    // skills stop. Dormitory recovery skills remain active at zero Morale.
    if (slot && facilityLabel !== 'Dormitory' && importedMorale?.[slot.operatorName] === 0) return [];
    const op = slot && operators.find(o => o.name === slot.operatorName);
    return op && slot ? activeBaseSkills(op, facilityLabel, slot.eliteLevel, skillSlots, slot.level) : [];
  }
  // A skill's handler key, and whether a slot has a skill by key: never `${operatorName}|${name}`
  // by hand, which a skill or operator Global renamed no longer matches (lib/base/specialSkillKeys.ts).
  const formerNames = new Map(operators.map((o) => [o.name, o.aliases ?? []]));
  const keyOf = (operatorName: string, sk: BaseSkill) => specialSkillKey(operatorName, sk, formerNames.get(operatorName));
  const hasSkill = (slot: SlotAssignment | null | undefined, facilityLabel: string, key: NamedSkillCheck) =>
    !!slot && hasNamedSkill(slot.operatorName, skillsFor(slot, facilityLabel), key, formerNames.get(slot.operatorName));
  const workingCount = (staff: SlotAssignment[]) => staff.filter(s => importedMorale?.[s.operatorName] !== 0).length;
  interface FacilityBreakdownLine {
    operatorName: string;
    skillName: string | null; // null for generic (regex-parsed) skills
    rawValue: number;
    included: boolean;
    reason: string;
    formula?: string; // the skill's own derivation, when its handler provides one -- not every handler has this populated yet
    note?: string; // non-numeric/unmodeled caveat text, when its handler provides one -- shown in the breakdown panel instead of cluttering the facility tile
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

  // Returns the rate AND the per-skill lines behind it, so the Power Plant can
  // offer the same "?" explanation the other facilities do -- a bare +13%
  // doesn't say whether it came from a base drone skill or from a Rhine Lab
  // headcount that might be counting the wrong people.
  function computePowerPlantDroneRate(
    f: (typeof FACILITIES)[number],
    filled: SlotAssignment[]
  ): { rate: number; lines: FacilityBreakdownLine[] } {
    const genericDescriptions: (string | null)[] = [];
    const genericLines: { operatorName: string; skillName: string | null; description: string | null }[] = [];
    const specialEntries: { slot: SlotAssignment; skillName: string | null; handler: (typeof POWER_PLANT_SPECIAL_SKILLS)[string] }[] = [];
    for (const slot of filled) {
      for (const sk of skillsFor(slot, f.label)) {
        const key = keyOf(slot.operatorName, sk);
        if (key in POWER_PLANT_SPECIAL_SKILLS) {
          specialEntries.push({ slot, skillName: sk.name, handler: POWER_PLANT_SPECIAL_SKILLS[key] });
        } else {
          genericDescriptions.push(sk.description);
          genericLines.push({ operatorName: slot.operatorName, skillName: sk.name, description: sk.description });
        }
      }
    }
    const linesFor = (): FacilityBreakdownLine[] =>
      genericLines.map((g) => {
        const raw = calcDroneRate([g.description]);
        return {
          operatorName: g.operatorName,
          skillName: g.skillName,
          rawValue: raw,
          included: raw !== 0,
          reason: raw === 0 ? 'No numeric drone recovery effect.' : 'Counted normally.',
        };
      });
    if (specialEntries.length === 0) return { rate: 0.05 * workingCount(filled) + calcDroneRate(genericDescriptions), lines: linesFor() };

    const kaltsitInControlCenter = ccOperatorNames.includes("Kal'tsit");
    const lateranoInAnyOtherPowerPlant = [...powerPlantsWithLaterano].some((id) => id !== f.id);

    // Spuria's ramp -- same "real time until the first operator anywhere
    // in this Power Plant dies from Morale loss" window used everywhere
    // else this codebase models a ramping skill.
    const powerPlantMorale = calcMorale(
      filled.length,
      filled.flatMap((s) => skillsFor(s, f.label).map((sk) => ({ operatorName: s.operatorName, description: sk.description })))
    );
    const ppRelief = ccBaseMoraleRelief + crossFacilityMoraleRelief('powerPlant', bannerOfBabelBonus, chongyueSolitaryLightBonus, mlynarActive, ccActiveSkillNames);
    const ownRate = (opName: string) => Math.max(0, powerPlantMorale.grey + powerPlantMorale.allOperatorsYellow - ppRelief + (powerPlantMorale.selfYellow[opName] || 0));
    const worstRate = filled.length > 0 ? Math.max(...filled.map((s) => ownRate(s.operatorName))) : 0;
    const rampWindowHours = rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);

    let total = 0.05 * workingCount(filled) + calcDroneRate(genericDescriptions);
    const lines = linesFor();
    for (const { slot, skillName, handler } of specialEntries) {
      const result = handler({
        otherRobotInPowerPlant: FACILITIES.some(room => room.kind === 'powerPlant' && assignments[room.id]?.some(s => s && s.operatorName !== slot.operatorName && rosters.OPERATION_PLATFORM.has(s.operatorName))),
        makotoInFactory: FACILITIES.some(room => room.kind === 'factory' && assignments[room.id]?.some(s => s?.operatorName === 'Makoto Yuki')),
        sameFacilityOperatorNames: filled.map((s) => s.operatorName),
        lateranoInAnyOtherPowerPlant,
        kaltsitInControlCenter,
        // Training Room has exactly 1 slot in this simulator, so this
        // directly reflects whether Logos is that slot's occupant.
        logosIsTrainerInTrainingRoom: logosInTrainingRoom,
        maxDroneCapacity: 235, // sum of building_data.layouts.v0.slots[].provideLabor, assuming all rooms excavated
        // Whole-base Rhine Lab count, minus this specific operator if
        // they're themselves a Rhine Lab member -- Muelsyse's skill says
        // "every OTHER Rhine Lab Operator", not including herself.
        //
        // Capped at 5 here, not in the handler: her text is "for every other
        // Rhine Lab Operator in base (excluding Assistants and Activity Room
        // users, caps at 5)", and powerPlantSpecialSkills.ts documents this
        // count as arriving pre-capped -- but it wasn't, so six or more Rhine
        // Lab operators overpaid her beyond the +15% ceiling.
        otherRhineLabCountBaseWide: Math.min(5, rhineLabCountInBase - (RHINE_LAB.has(slot.operatorName) ? 1 : 0)),
        // Summed from the actual Dormitories rather than assuming 4 x Level 5.
        // Same hardcoded max-level assumption Senshi's Diner had above.
        totalDormitoryLevels,
        rampWindowHours,
      });
      if (result.droneRate) total += result.droneRate;
      lines.push({
        operatorName: slot.operatorName,
        skillName,
        rawValue: result.droneRate ?? 0,
        included: (result.droneRate ?? 0) !== 0,
        reason: (result.droneRate ?? 0) !== 0
          ? 'Counted normally.'
          : 'No drone recovery contribution under the current setup.',
        note: result.note,
      });
    }
    return { rate: total, lines };
  }

  function productivityFor(
    f: (typeof FACILITIES)[number],
    ccEffects: ControlCenterEffects,
    ccMoraleRelief: number
  ) {
    const slots = assignments[f.id] || [];
    const filled = slots.filter((s): s is SlotAssignment => s !== null);

    let descriptions: (string | null)[];
    let specialProductivitySum = 0;
    let specialCapacitySum = 0;
    let specialOrderLimitSum = 0;
    const perOperatorSpecialMorale: Record<string, number> = {};
    let overrideActive = false;
    let overrideProductivitySum = 0;
    let exemptProductivitySum = 0;
    const specialNotes: { operator: string; note: string }[] = [];
    let facilityBreakdown: FacilityBreakdown | null = null;
    let genericSkillsForMorale: { operatorName: string; description: string | null }[] = [];
    let genericSkillsForCapacity: { operatorName: string; description: string | null }[] = [];

    if (f.kind === 'factory') {
      const sameFactoryOperatorNames = filled.map((s) => s.operatorName);
      const sameFactorySkillNames = filled.flatMap((s) => skillsFor(s, f.label).map((sk) => sk.name || ''));

      const genericDescriptions: (string | null)[] = [];
      const specialEntries: { slot: SlotAssignment; skillName: string; key: string; handler: (typeof FACTORY_SPECIAL_SKILLS)[string] }[] = [];

      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = keyOf(slot.operatorName, sk);
          if (key in FACTORY_SPECIAL_SKILLS) {
            const handler = FACTORY_SPECIAL_SKILLS[key];
            specialEntries.push({ slot, skillName: sk.name || '', key, handler });
          } else {
            genericDescriptions.push(sk.description);
            genericSkillsForMorale.push({ operatorName: slot.operatorName, description: sk.description });
            genericSkillsForCapacity.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }
      descriptions = genericDescriptions;

      const baseCtx: Omit<FactorySkillContext, 'manualValue' | 'othersProductivitySum' | 'otherOperatorsCapacity' | 'totalFactoryCapacityIncrease' | 'eliteLevel'> = {
        rosters,
        totalDormitoryLevels,
        trainingRoomLevel: FACILITIES.find(room => room.kind === 'trainingRoom')?.level ?? 0,
        totalFacilityLevels: FACILITIES.reduce((sum, room) => sum + room.level, 0),
        allPlacedNames,
        selectedProduct: factoryProducts[f.id] || null,
        sameFactoryOperatorNames,
        sameFactorySkillNames,
        filledCountThisFactory: filled.length,
        tradingPostOperatorCount,
        tradingPostCount: FACILITIES.filter((f2) => f2.kind === 'tradingPost' && f2.level > 0).length,
        powerPlantOperatorCount,
        powerPlantCount: effectivePowerPlantCount,
        robotPowerPlantCount,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        factionCountInBase,
        dormitoryCount,
        gladiiaGroupHuntingActiveInCC,
        felvineTotal: totalFelvine,
        monsterMealTotal: totalMonsterMeal,
        ursusSpecialtyBeverageTotal: totalUrsusBeverage,
        blacksteelWorldwideCountInBase,
        rhineLabCountInBase,
        resourcePools,
        resourceBonuses,
        operatorInAnyTradingPost,
        rampWindowHours: 24, // placeholder -- only the morale-dependent operators below read this, and they get a corrected context after the real value is known
        selfMoraleRate: 1, // placeholder -- only Totter's handlers read this
      };

      // Three groups now: Waai Fu (self-referential off everyone else's
      // productivity), the ramping operators (Fang/Kroos/Scene/Ceobe,
      // whose average productivity depends on THEIR OWN Morale-based
      // time window, only knowable once every other special skill --
      // including Morale-affecting ones -- has resolved), and
      // everything else.
      const MORALE_DEPENDENT_FACTORY_SKILLS = new Set([
        'Fang|Hothead',
        'Kroos|Slowcoach',
        'Scene|Time-Lapse Photography',
        'Ceobe|Right Now',
        'Totter|Blurry Vision',
        'Totter|Blizzard Outside',
        'Aroma|Routine Cleaning',
        'Mechanist|I Slept Already',
      ]);
      let othersSum = 0;
      const pending: { slot: SlotAssignment; skillName: string; key: string; handler: (typeof FACTORY_SPECIAL_SKILLS)[string] }[] = [];
      let waaiFuEntry: (typeof specialEntries)[number] | null = null;
      let bubbleEntry: (typeof specialEntries)[number] | null = null;
      let vermeilEntry: (typeof specialEntries)[number] | null = null;
      const moraleDependentEntries: (typeof specialEntries)[number][] = [];

      for (const entry of specialEntries) {
        if (entry.key === 'Waai Fu|Cooperative Will') {
          waaiFuEntry = entry;
        } else if (entry.key === 'Bubble|Bigger is Better!') {
          bubbleEntry = entry;
        } else if (entry.key === 'Vermeil|Recycling') {
          vermeilEntry = entry;
        } else if (MORALE_DEPENDENT_FACTORY_SKILLS.has(entry.key)) {
          moraleDependentEntries.push(entry);
        } else {
          pending.push(entry);
        }
      }

      const results: { result: ReturnType<(typeof FACTORY_SPECIAL_SKILLS)[string]>; operator: string }[] = [];
      const pendingSelfMorale: Record<string, number> = {};
      const pendingSpecialCapacity: Record<string, number> = {};
      for (const { slot, handler } of pending) {
        const result = handler({ ...baseCtx, eliteLevel: slot.eliteLevel, manualValue: slot.manualValue });
        results.push({ result, operator: slot.operatorName });
        // Facility-count-based contributions (Purestream, Thorns, Alanna,
        // Narantuya -- marked exemptFromOverride) are explicitly excluded
        // from Waai Fu's "everyone else's productivity" sum, per her own
        // skill text.
        if (result.productivity && !result.exemptFromOverride) othersSum += result.productivity;
        if (result.selfMorale) {
          pendingSelfMorale[slot.operatorName] = (pendingSelfMorale[slot.operatorName] || 0) + result.selfMorale;
        }
        if (result.capacity) {
          pendingSpecialCapacity[slot.operatorName] = (pendingSpecialCapacity[slot.operatorName] || 0) + result.capacity;
        }
      }

      if (bubbleEntry || vermeilEntry) {
        // Shared per-operator capacity data (generic regex-parsed +
        // any special-cased skill), needed by both Bubble and Vermeil.
        const genericCapacityByOp = calcCapacityPerOperator(genericSkillsForCapacity);
        const capacityByOp = (opName: string) => (genericCapacityByOp[opName] || 0) + (pendingSpecialCapacity[opName] || 0);

        if (bubbleEntry) {
          // Bubble scales off EVERY operator's own individual capacity
          // contribution, including her own -- 1% productivity per
          // point at <=15, 3% per point at >=16 (confirmed correction
          // to the raw skill text's "16 or less"/"greater than 16"
          // wording).
          const allOperatorsCapacity: Record<string, number> = {};
          for (const slot of filled) {
            const total = capacityByOp(slot.operatorName);
            if (total !== 0) allOperatorsCapacity[slot.operatorName] = total;
          }
          const result = bubbleEntry.handler({
            ...baseCtx,
            eliteLevel: bubbleEntry.slot.eliteLevel,
            manualValue: bubbleEntry.slot.manualValue,
            otherOperatorsCapacity: allOperatorsCapacity,
          });
          results.push({ result, operator: 'Bubble' });
          // Genuinely counts toward "everyone else's productivity" for
          // Waai Fu -- Bubble returns real productivity, not just
          // capacity, and has no confirmed exemption in her skill text
          // (unlike the facility-count-based skills, which do).
          if (result.productivity) othersSum += result.productivity;
        }

        if (vermeilEntry) {
          // Vermeil: flat +2% per point of capacity increase across
          // EVERY operator in the Factory, including her own (confirmed
          // -- unlike Bubble, who excludes herself).
          const totalFactoryCapacityIncrease = filled.reduce((sum, s) => sum + capacityByOp(s.operatorName), 0);
          const result = vermeilEntry.handler({
            ...baseCtx,
            eliteLevel: vermeilEntry.slot.eliteLevel,
            manualValue: vermeilEntry.slot.manualValue,
            totalFactoryCapacityIncrease,
          });
          results.push({ result, operator: 'Vermeil' });
          if (result.productivity) othersSum += result.productivity;
        }
      }

      if (waaiFuEntry) {
        // othersSum so far only includes special-cased contributions --
        // generic, regex-parsed skills (e.g. Vanilla's plain "+25%")
        // never touched it at all, since they're computed entirely
        // separately via calcProductivity. Add that contribution too,
        // using only the skill-based yellow portion, not the grey
        // baseline rate (which isn't "provided" by any operator's skill
        // in the sense Waai Fu's own skill text means).
        const genericOthers = calcProductivity('factory', genericDescriptions, filled.length, factoryProducts[f.id] || null);
        othersSum += genericOthers.yellow;
        const result = waaiFuEntry.handler({
          ...baseCtx,
          eliteLevel: waaiFuEntry.slot.eliteLevel,
          manualValue: waaiFuEntry.slot.manualValue,
          othersProductivitySum: othersSum,
        });
        results.push({ result, operator: 'Waai Fu' });
      }


      if (moraleDependentEntries.length > 0) {
        // Real per-operator Morale calc for THIS Factory, using only
        // what's known so far (generic descriptions + every
        // non-morale-dependent special skill's self-only Morale
        // contribution).
        const factoryMorale = calcMorale(filled.length, genericSkillsForMorale);
        const ownRate = (opName: string) =>
          Math.max(
            0,
            factoryMorale.grey +
              factoryMorale.allOperatorsYellow +
              (factoryMorale.selfYellow[opName] || 0) +
              (pendingSelfMorale[opName] || 0) -
              ccMoraleRelief
          );

        // The window is genuinely facility-wide -- the first operator
        // ANYWHERE in this Factory to run out of Morale ends the whole
        // Factory's operational window, not just each operator's own
        // individual survival time.
        const worstRate = Math.max(...filled.map((s) => ownRate(s.operatorName)));
        const rampWindowHours = rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);

        for (const { slot, handler } of moraleDependentEntries) {
          const opName = slot.operatorName;
          const result = handler({
            ...baseCtx,
            rampWindowHours,
            selfMoraleRate: ownRate(opName),
            eliteLevel: slot.eliteLevel,
            manualValue: slot.manualValue,
          });
          results.push({ result, operator: opName });
        }
      }

      for (const { result, operator } of results) {
        if (result.productivity) specialProductivitySum += result.productivity;
        if (result.capacity) specialCapacitySum += result.capacity;
        if (result.selfMorale) {
          perOperatorSpecialMorale[operator] = (perOperatorSpecialMorale[operator] || 0) + result.selfMorale;
        }
        if (result.overridesOthersProductivity) {
          overrideActive = true;
          if (result.productivity) overrideProductivitySum += result.productivity;
        }
        if (result.exemptFromOverride && result.productivity) exemptProductivitySum += result.productivity;
        // NOTE: result.note is no longer pushed onto the tile-level
        // specialNotes list here -- it was cluttering the small facility
        // tile with skill caveat text instead of the usual grey/yellow
        // stats. It's carried into breakdownLines below instead, so it
        // only shows up in the "explain this facility" panel.
      }

      // Step-by-step breakdown for the "explain this facility" panel --
      // built from the SAME data the real calculation above already
      // produced, not re-derived separately, so it can't drift from what
      // actually happened.
      const product = factoryProducts[f.id] || null;
      // Exhausted operators stay placed but no longer work, base 1% included.
      const greyProductivity = calcGreyProductivity(workingCount(filled));
      const breakdownLines: FacilityBreakdownLine[] = [];

      for (const g of genericSkillsForMorale) {
        const raw = factoryYellowContribution(g.description, product);
        const included = raw !== 0 && !overrideActive;
        breakdownLines.push({
          operatorName: g.operatorName,
          skillName: null,
          rawValue: raw,
          included,
          reason: overrideActive
            ? 'Excluded -- an override skill in this Factory replaces everyone else\u2019s own productivity entirely.'
            : raw === 0
            ? 'No numeric productivity effect for this Factory\u2019s selected product.'
            : 'Counted normally.',
        });
      }

      for (const { result, operator } of results) {
        const raw = result.productivity ?? 0;
        let included: boolean;
        let reason: string;
        if (result.exemptFromOverride) {
          included = raw !== 0;
          reason = 'Exempt -- this skill survives even when another skill overrides everyone else\u2019s productivity.';
        } else if (overrideActive) {
          included = !!result.overridesOthersProductivity && raw !== 0;
          reason = result.overridesOthersProductivity
            ? 'Counted -- this is the override skill itself.'
            : 'Excluded -- an override skill in this Factory replaces everyone else\u2019s own productivity entirely.';
        } else {
          included = raw !== 0;
          reason = raw === 0 ? 'No numeric productivity contribution.' : 'Counted normally.';
        }
        breakdownLines.push({
          operatorName: operator,
          skillName: specialEntries.find((e) => e.slot.operatorName === operator)?.skillName ?? null,
          rawValue: raw,
          included,
          reason,
          formula: result.formula,
          note: result.note,
        });
      }

      const finalYellow = exemptProductivitySum + (overrideActive ? overrideProductivitySum : specialProductivitySum + genericDescriptions.reduce((sum, d) => sum + factoryYellowContribution(d, product), 0));
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity,
        greyFormula: `1.01 + (${filled.length} - 1) \u00d7 0.01 = ${greyProductivity.toFixed(2)}`,
        overrideActive,
        lines: breakdownLines,
        finalYellow,
        effectiveProductivity: Math.max(0, greyProductivity + finalYellow),
      };
    } else if (f.kind === 'tradingPost') {
      const sameRoomOperatorNames = filled.map((s) => s.operatorName);
      const genericDescriptions: (string | null)[] = [];
      const specialEntries: { slot: SlotAssignment; skillName: string; key: string; handler: (typeof TRADING_POST_SPECIAL_SKILLS)[string] }[] = [];

      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = keyOf(slot.operatorName, sk);
          if (key in TRADING_POST_SPECIAL_SKILLS) {
            const handler = TRADING_POST_SPECIAL_SKILLS[key];
            specialEntries.push({ slot, skillName: sk.name || '', key, handler });
          } else {
            genericDescriptions.push(sk.description);
            genericSkillsForMorale.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }
      descriptions = genericDescriptions;

      const baseTPCtx: Omit<TradingPostContext, 'manualValue' | 'othersOrderEfficiencySum' | 'othersOrderLimitSum'> = {
        rosters,
        tradingPostLevel: f.level,
        bubbleKingdomHuntersInTradingPosts: allPlacedNames.filter(n => rosters.BUBBLE_KINGDOM_HUNTERS.has(n) && operatorInAnyTradingPost(n)).length,
        receptionRoomLevel: FACILITIES.find(room => room.kind === 'receptionRoom')?.level ?? 0,
        totalDormitoryLevels,
        sameRoomOperatorNames,
        filledCountThisRoom: filled.length,
        dormitoryOperatorCount: dormitoryOperatorNames.size,
        distinctFactoryProductCount,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        ulpianusInBase,
        facilitiesWithSuiOperator,
        facilitiesWithEliteOperator,
        resourceBonuses,
        monsterMealTotal: totalMonsterMeal,
        felvineTotal: totalFelvine,
        effectiveGoldLineCount,
        allPlacedNames,
      };

      // Snowsant/Jaye's second skill are self-referential off everyone
      // ELSE's order efficiency; Degenbrecher/Swire off everyone else's
      // order limit contribution. Both need everything else resolved first.
      const SELF_REFERENTIAL = new Set([
        'Jaye|Basic Needs',
        'Jaye|Street Economics',
        'Snowsant|Heavenly Reward α',
        'Snowsant|Heavenly Reward β',
        "Degenbrecher|Champion's Bearing",
        'Swire the Elegant Wit|Investment Solicitations',
      ]);

      const pendingTP = specialEntries.filter((e) => !SELF_REFERENTIAL.has(e.key));
      const deferredTP = specialEntries.filter((e) => SELF_REFERENTIAL.has(e.key));
      // Basic Needs also changes capacity. Annex 1 places Champion's Bearing
      // before that change and Investment Solicitations afterward. Snowsant
      // copying is handled together with Jaye under the glossary rule.
      const orderLimitAffectingDeferred = deferredTP.filter((e) => e.skillName === 'Basic Needs');
      const capacityScalingBeforeJaye = deferredTP.filter(e => e.slot.operatorName === 'Degenbrecher');
      const remainingDeferred = deferredTP.filter((e) => e.skillName !== 'Basic Needs' && e.slot.operatorName !== 'Degenbrecher');

      const prelimProd = calcProductivity('tradingPost', genericDescriptions, workingCount(filled), null);
      const prelimOrderLimit = calcOrderLimit(genericDescriptions, f.level);
      let othersEff = prelimProd.yellow + (perTradingPostBonus.get(f.id) || 0);
      // Raw (including negatives) order limit total -- used by
      // Degenbrecher's "Champion's Bearing", Swire the Elegant Wit's
      // "Investment Solicitations" (both scale off the raw adjustment at
      // their own evaluation stage, including
      // their own negative Intimidate/Imposing Presence contribution
      // netted in -- not a positive-only "exclude my own" version), and
      // Jaye's own effective-order-limit computation.
      let othersLimitRaw = prelimOrderLimit.adjustment + (perTradingPostOrderLimitBonus.get(f.id) || 0);

      const resultsTP: { result: ReturnType<(typeof TRADING_POST_SPECIAL_SKILLS)[string]>; operator: string; skillName?: string | null }[] = [];
      for (const { slot, skillName, handler } of pendingTP) {
        const result = handler({ ...baseTPCtx, manualValue: slot.manualValue });
        resultsTP.push({ result, operator: slot.operatorName, skillName });
        if (result.orderEfficiency) othersEff += result.orderEfficiency;
        if (result.orderLimit) othersLimitRaw += result.orderLimit;
      }
      // Champion's Bearing reads the limit increase before Basic Needs lowers
      // it. Investment Solicitations reads the resulting limit afterward.
      // This reproduces Annex 1's separate dependency examples; the game data
      // alone does not encode that ordering, so it remains an observed model.
      for (const { slot, skillName, handler } of capacityScalingBeforeJaye) {
        const result = handler({ ...baseTPCtx, othersOrderLimitRawSum: othersLimitRaw });
        resultsTP.push({ result, operator: slot.operatorName, skillName });
        othersEff += result.orderEfficiency ?? 0;
      }
      const jayeEntry = specialEntries.find(e => e.slot.operatorName === 'Jaye');
      const snowEntry = specialEntries.find(e => e.slot.operatorName === 'Snowsant');
      if (jayeEntry) {
        const modeled = jayeContribution(prelimOrderLimit.base + othersLimitRaw, othersEff, snowEntry ? (snowEntry.skillName.endsWith('β') ? 0.35 : 0.25) : 0, orderLimitAffectingDeferred.length > 0, prelimProd.grey + ccEffects.tradingPostBonus, loginInterval, f.level, tradingPostExpectedMinutes(goldOrderTier(filled.flatMap(slot => skillsFor(slot, f.label).map(sk => ({ operatorName: slot.operatorName, skillName: cleanSkillName(sk.name) ?? '' })))), f.level));
        resultsTP.push({ operator: 'Jaye', result: { orderEfficiency: modeled.jaye, orderLimit: modeled.limitReduction, note: orderLimitAffectingDeferred.length ? 'Street Economics + Basic Needs cancel queue dependence. Snowsant copies other operators first, then Basic Needs uses that combined bonus (game glossary: Special Interaction Rules).' : `Expected average from an empty queue over ${loginInterval}h between collections; speed is recalculated after every expected order.` } });
        if (snowEntry) resultsTP.push({ operator: 'Snowsant', result: { orderEfficiency: modeled.snowsant } });
        othersLimitRaw += modeled.limitReduction;
      }
      for (const { slot, skillName, handler } of remainingDeferred) {
        if (slot.operatorName === 'Jaye' || (slot.operatorName === 'Snowsant' && jayeEntry)) continue;
        const result = handler({
          ...baseTPCtx,
          manualValue: slot.manualValue,
          othersOrderEfficiencySum: othersEff,
          othersOrderLimitRawSum: othersLimitRaw,
          genericOrderLimitAdjustment: prelimOrderLimit.base,
        });
        resultsTP.push({ result, operator: slot.operatorName, skillName });
      }

      for (const { result, operator } of resultsTP) {
        if (result.orderEfficiency) specialProductivitySum += result.orderEfficiency;
        if (result.orderLimit) specialOrderLimitSum += result.orderLimit;
        if (result.selfMorale) {
          perOperatorSpecialMorale[operator] = (perOperatorSpecialMorale[operator] || 0) + result.selfMorale;
        }
        if (result.allOperatorsBonus) {
          for (const s of filled) {
            perOperatorSpecialMorale[s.operatorName] = (perOperatorSpecialMorale[s.operatorName] || 0) + result.allOperatorsBonus;
          }
        }
        if (result.overridesOthersEfficiency) {
          overrideActive = true;
          if (result.orderEfficiency) overrideProductivitySum += result.orderEfficiency;
        }
        // NOTE: result.note is no longer pushed onto the tile-level
        // specialNotes list here -- see the matching Factory-side note
        // above. It's carried into tpBreakdownLines below instead, so it
        // only shows up in the "explain this facility" panel.
      }

      // Step-by-step breakdown for the "explain this facility" panel --
      // same approach as Factory: built from the results already
      // computed above, not re-derived separately.
      const tpGreyProductivity = calcGreyProductivity(workingCount(filled));
      const tpBreakdownLines: FacilityBreakdownLine[] = [];
      const quality = goldOrderTier(filled.flatMap(slot => skillsFor(slot, f.label).map(sk => ({ operatorName: slot.operatorName, skillName: cleanSkillName(sk.name) ?? '' }))));
      if (quality !== 'base') tpBreakdownLines.push({ operatorName: '(Order quality)', skillName: null, rawValue: 0, included: false, reason: 'Quality-weighted output estimate.', note: 'Uses mature Lv3 observed order probabilities. Warm-up and lower-level quality distributions are not verified; their output is an approximation.' });
      if (jayeEntry && [...capacityScalingBeforeJaye, ...remainingDeferred].some(e => e.slot.operatorName === 'Degenbrecher' || e.slot.operatorName === 'Swire the Elegant Wit')) tpBreakdownLines.push({ operatorName: 'Jaye', skillName: null, rawValue: 0, included: false, reason: 'Observed capacity/efficiency ordering.', note: 'Uses the supplied Annex 1 examples: Degenbrecher before Basic Needs, Swire afterward. The game tables do not encode the ordering.' });
      if (filled.some(s => s.operatorName === 'Closure') && filled.some(s => hasSkill(s, f.label, 'Pepe|Insightful'))) tpBreakdownLines.push({ operatorName: '(Special orders)', skillName: null, rawValue: 0, included: false, reason: 'Conflicting special order types.', note: 'Pepe’s fixed order is used; the priority against Closure’s Special Orders has not been verified.' });

      for (const g of genericSkillsForMorale) {
        const raw = tradingPostYellowContribution(g.description);
        const included = raw !== 0 && !overrideActive;
        tpBreakdownLines.push({
          operatorName: g.operatorName,
          skillName: null,
          rawValue: raw,
          included,
          reason: overrideActive
            ? 'Excluded -- an override skill in this Trading Post replaces everyone else\u2019s own order efficiency entirely.'
            : raw === 0
            ? 'No numeric order efficiency effect.'
            : 'Counted normally.',
        });
      }

      for (const { result, operator, skillName } of resultsTP) {
        const raw = result.orderEfficiency ?? 0;
        let included: boolean;
        let reason: string;
        if (overrideActive) {
          included = !!result.overridesOthersEfficiency && raw !== 0;
          reason = result.overridesOthersEfficiency
            ? 'Counted -- this is the override skill itself.'
            : 'Excluded -- an override skill in this Trading Post replaces everyone else\u2019s own order efficiency entirely.';
        } else {
          included = raw !== 0;
          reason = raw === 0 ? 'No numeric order efficiency contribution (may still affect order limit or Morale separately).' : 'Counted normally.';
        }
        tpBreakdownLines.push({
          operatorName: operator,
          skillName: skillName ?? specialEntries.find((e) => e.slot.operatorName === operator)?.skillName ?? null,
          rawValue: raw,
          included,
          reason,
          formula: result.formula,
          note: result.note,
        });
      }

      const tpFinalYellow = overrideActive
        ? overrideProductivitySum
        : prelimProd.yellow + specialProductivitySum;
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: tpGreyProductivity,
        greyFormula: `1.01 + (${filled.length} - 1) \u00d7 0.01 = ${tpGreyProductivity.toFixed(2)}`,
        overrideActive,
        lines: tpBreakdownLines,
        finalYellow: tpFinalYellow,
        effectiveProductivity: Math.max(0, tpGreyProductivity + tpFinalYellow),
      };
    } else {
      descriptions = filled.flatMap((s) => skillsFor(s, f.label).map((sk) => sk.description));
      genericSkillsForMorale = filled.flatMap((s) =>
        skillsFor(s, f.label).map((sk) => ({ operatorName: s.operatorName, description: sk.description }))
      );
    }

    // Specialized room handlers own their self-morale, avoiding duplicate or unconditional parsing.
    if (f.kind === 'trainingRoom' || f.kind === 'workshop') genericSkillsForMorale = [];
    if (f.kind === 'controlCenter') genericSkillsForMorale = genericSkillsForMorale.filter(value => !skillsFor(filled.find(s => s.operatorName === value.operatorName)!, f.label).some(sk => keyOf(value.operatorName, sk) in CONTROL_CENTER_SPECIAL_SKILLS && sk.description === value.description));
    if (f.kind === 'office' || f.kind === 'receptionRoom') genericSkillsForMorale = genericSkillsForMorale.filter(value => {
      const map = f.kind === 'office' ? OFFICE_SPECIAL_SKILLS : RECEPTION_ROOM_SPECIAL_SKILLS;
      return !skillsFor(filled.find(s => s.operatorName === value.operatorName)!, f.label).some(sk => keyOf(value.operatorName, sk) in map && sk.description === value.description);
    });
    ccMoraleRelief = ccBaseMoraleRelief + crossFacilityMoraleRelief(f.kind, bannerOfBabelBonus, chongyueSolitaryLightBonus, mlynarActive, ccActiveSkillNames);
    const morale = calcMorale(filled.length, genericSkillsForMorale);
    const productivity = PRODUCTIVITY_KINDS.has(f.kind)
      ? calcProductivity(f.kind as 'factory' | 'tradingPost', descriptions, workingCount(filled), factoryProducts[f.id] || null)
      : null;
    // Layer Control Center's highest-only global bonus on top of this
    // facility's own local skill contributions.
    if (productivity) {
      if (f.kind === 'tradingPost') {
        const thisTpBonus = perTradingPostBonus.get(f.id) || 0;
        productivity.yellow = (overrideActive ? overrideProductivitySum : productivity.yellow + specialProductivitySum) + ccEffects.tradingPostBonus + thisTpBonus;
        // Sync the breakdown panel to match -- it was built above before
        // these cross-facility Control Center bonuses were known, so its
        // displayed percentage was silently stuck at the pre-CC-bonus
        // value even when the real productivity (and the LMD figures
        // computed from it) correctly included them.
        if (facilityBreakdown) {
          const ccBonusTotal = ccEffects.tradingPostBonus + thisTpBonus;
          if (ccBonusTotal !== 0) {
            facilityBreakdown.lines.push({
              operatorName: '(Control Center)',
              skillName: null,
              rawValue: ccBonusTotal,
              included: true,
              reason: 'Cross-facility Order Efficiency bonus (Control Center highest-only bonus plus any per-Trading-Post bonus) -- added after this room\u2019s own local skills.',
            });
          }
          facilityBreakdown.finalYellow = productivity.yellow;
          facilityBreakdown.effectiveProductivity = Math.max(0, facilityBreakdown.greyProductivity + productivity.yellow);
        }
      }
      if (f.kind === 'factory') {
        // "Zero out everyone else" skills (Snegurochka, Automation
        // family) replace ALL other LOCAL productivity contributions --
        // generic AND other special-cased ones -- with just their own,
        // EXCEPT skills whose productivity is granted based on facility
        // count rather than being "contributed" in the sense these
        // skills mean (Purestream, Thorns the Lodestar) -- not about
        // evaluation order, they're simply exempt from the zero-out
        // entirely, regardless of which other operators are also
        // present. CC-sourced cross-facility bonuses are conceptually
        // independent of this LOCAL override and always apply, the same
        // fix as Trading Post above -- these used to be silently
        // dropped whenever an override was active.
        productivity.yellow = overrideActive ? overrideProductivitySum + exemptProductivitySum : productivity.yellow + specialProductivitySum;
        productivity.yellow += ccEffects.factoryBonus;
        if (factoryProducts[f.id] === 'Precious Metals') {
          productivity.yellow += factoryPreciousMetalBonusFromCC;
        }
        productivity.yellow += perFactoryProductivityBonus.get(f.id) || 0;
        // Same sync the Trading Post branch above does: the breakdown was
        // built before any of these cross-facility bonuses were known, so
        // without this its total silently disagreed with the tile -- a Factory
        // of three Knights on Precious Metals showed 178% in the panel next to
        // 174% on the tile, with nothing named to account for the difference.
        if (facilityBreakdown) {
          // One line per contributing skill, not per contributing operator:
          // these skills grant their amount per affected operator, so a
          // three-Knight Factory produced three identical rows and the reader
          // had to add them up. Grouped, with the multiplier spelled out.
          const groupedSources = new Map<string, { operatorName: string; skillName: string | null; per: number; count: number }>();
          for (const src of perFactoryProductivitySources.get(f.id) || []) {
            const groupKey = `${src.operatorName}|${src.skillName ?? ''}`;
            const held = groupedSources.get(groupKey);
            if (held) {
              held.count += 1;
            } else {
              groupedSources.set(groupKey, { operatorName: src.operatorName, skillName: src.skillName, per: src.amount, count: 1 });
            }
          }
          for (const g of groupedSources.values()) {
            facilityBreakdown.lines.push({
              operatorName: g.operatorName,
              skillName: g.skillName,
              rawValue: g.per * g.count,
              included: true,
              reason: 'Cross-facility bonus targeting this Factory specifically -- added after this room\u2019s own local skills.',
              formula: g.count > 1 ? `${(g.per * 100).toFixed(2)}% x ${g.count} operators = ${(g.per * g.count * 100).toFixed(2)}%` : undefined,
            });
          }
          const sharedCcFactoryBonus = ccEffects.factoryBonus
            + (factoryProducts[f.id] === 'Precious Metals' ? factoryPreciousMetalBonusFromCC : 0);
          if (sharedCcFactoryBonus !== 0) {
            facilityBreakdown.lines.push({
              operatorName: '(Control Center)',
              skillName: null,
              rawValue: sharedCcFactoryBonus,
              included: true,
              reason: 'Cross-facility Factory productivity bonus (Control Center highest-only bonus, plus any Precious-Metal-specific bonus) -- added after this room\u2019s own local skills.',
            });
          }
          facilityBreakdown.finalYellow = productivity.yellow;
          facilityBreakdown.effectiveProductivity = Math.max(0, facilityBreakdown.greyProductivity + productivity.yellow);
        }
      }
    }

    const capacity = f.kind === 'factory' ? calcCapacity(descriptions, f.level) : null;
    if (capacity) capacity.adjustment += specialCapacitySum;
    const orderLimit = f.kind === 'tradingPost' ? calcOrderLimit(descriptions, f.level) : null;
    if (orderLimit) orderLimit.adjustment += specialOrderLimitSum + (perTradingPostOrderLimitBonus.get(f.id) || 0);
    let clueSpeed: number | null = null;
    let clueSpeedBase: number | null = null;
    let inesNote: string | undefined;
    const receptionRoomSelfMorale: Record<string, number> = {};
    if (f.kind === 'receptionRoom') {
      const sameRoomOperatorNames = filled.map((s) => s.operatorName);
      const genericDescriptions: (string | null)[] = [];
      // The breakdown's generic lines are built from this, NOT from
      // genericSkillsForMorale: that array is assigned every skill in the room
      // for the morale calculation and then had the generic ones pushed onto it
      // again here, so Curiosity was listed twice and Gourmand -- which is
      // special-cased and deliberately excluded from genericDescriptions --
      // appeared as a phantom flat +2%. The displayed lines have to come from
      // the same list the total sums, or the panel contradicts its own Final.
      const genericClueLines: { operatorName: string; description: string | null }[] = [];
      let specialClueSum = 0;
      const pendingReceptionEntries: { slot: SlotAssignment; sk: BaseSkill; handler: (typeof RECEPTION_ROOM_SPECIAL_SKILLS)[string] }[] = [];
      let inesEntry: { slot: SlotAssignment; handler: (typeof RECEPTION_ROOM_SPECIAL_SKILLS)[string] } | null = null;

      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = keyOf(slot.operatorName, sk);
          if (key in RECEPTION_ROOM_SPECIAL_SKILLS) {
            const handler = RECEPTION_ROOM_SPECIAL_SKILLS[key];
            if (key === 'Ines|Shadow Gathering') {
              inesEntry = { slot, handler };
            } else {
              pendingReceptionEntries.push({ slot, sk, handler });
            }
          } else {
            genericDescriptions.push(sk.description);
            genericClueLines.push({ operatorName: slot.operatorName, description: sk.description });
          }
        }
      }

      const pendingReceptionSelfMorale: Record<string, number> = {};
      for (const { slot, handler } of pendingReceptionEntries) {
        const result = handler({
          rosters,
          manualValue: slot.manualValue,
          sameRoomOperatorNames,
          filledCountThisRoom: filled.filter(s => importedMorale?.[s.operatorName] !== 0).length,
          dormitoryHasOperator,
          monsterMealTotal: totalMonsterMeal,
          rampWindowHours: 24, // unused by any non-Ines handler
          resourceBonuses,
          clueExchangeActive,
          violetOrchidInControlCenter: ccOperatorNames.includes('Violet Mizutsune Orchid'),
          officeLevel,
        });
        if (result.clueSpeed) specialClueSum += result.clueSpeed;
        if (result.selfMorale) {
          receptionRoomSelfMorale[slot.operatorName] = (receptionRoomSelfMorale[slot.operatorName] || 0) + result.selfMorale;
        }
      }

      if (inesEntry) {
        // Real facility-wide Morale window, same principle as the
        // Factory ramping operators -- the first operator ANYWHERE in
        // this Reception Room to run out of Morale ends the whole
        // room's operational window, not just Ines's own survival time.
        const receptionMorale = calcMorale(filled.length, genericSkillsForMorale);
        const ownRate = (opName: string) =>
          Math.max(
            0,
            receptionMorale.grey +
              receptionMorale.allOperatorsYellow +
              (receptionMorale.selfYellow[opName] || 0) +
              (pendingReceptionSelfMorale[opName] || 0) -
              ccMoraleRelief
          );
        const worstRate = Math.max(...filled.map((s) => ownRate(s.operatorName)));
        const rampWindowHours = rampWindow(worstRate > 0 ? 24 / worstRate : Infinity);
        const result = inesEntry.handler({
          rosters,
          manualValue: inesEntry.slot.manualValue,
          sameRoomOperatorNames,
          filledCountThisRoom: filled.length,
          dormitoryHasOperator,
          monsterMealTotal: totalMonsterMeal,
          rampWindowHours,
          resourceBonuses,
          clueExchangeActive,
          violetOrchidInControlCenter: ccOperatorNames.includes('Violet Mizutsune Orchid'),
          officeLevel,
        });
        if (result.clueSpeed) specialClueSum += result.clueSpeed;
        if (result.note) inesNote = result.note;
      }
      clueSpeed = calcClueSpeed(genericDescriptions) + specialClueSum + ccEffects.clueCollectionBonus + officeReceptionRoomBonus + receptionRoomClueSpeedFromCC;
      clueSpeedBase = calcReceptionRoomBaseSpeed(
        filled.map((s) => ({
          rarity: operatorByName.get(s.operatorName)?.rarity ?? null,
          eliteLevel: s.eliteLevel,
          exhausted: importedMorale?.[s.operatorName] === 0,
        }))
      );
      const receptionBreakdownLines: FacilityBreakdownLine[] = [];
      // Itemise the base speed per operator instead of hiding it inside one
      // summed figure. "+25%" for an Elite 2 5-star says nothing about which
      // part is the promotion and which the rarity, and three of the reported
      // Reception Room bugs were "innate/promotion/rarity bonuses missing" --
      // which is impossible to confirm or refute against a single total.
      // Zero contributions are listed too, marked excluded, so a 3-star at
      // Elite 0 visibly contributes nothing rather than being absent.
      for (const slot of filled) {
        const contribution = receptionRoomBaseContribution({
          rarity: operatorByName.get(slot.operatorName)?.rarity ?? null,
          eliteLevel: slot.eliteLevel,
          exhausted: importedMorale?.[slot.operatorName] === 0,
        });
        const rarity = operatorByName.get(slot.operatorName)?.rarity ?? null;
        const eliteLabel = slot.eliteLevel === 'Base' ? 'Elite 0' : slot.eliteLevel ?? 'Elite 0';
        receptionBreakdownLines.push({
          operatorName: slot.operatorName,
          skillName: 'in the room',
          rawValue: contribution.slotted,
          included: contribution.slotted !== 0,
          reason: 'Every working operator adds this, whether or not their skill does anything here. Exhausted operators retain rarity and promotion bonuses.',
        });
        receptionBreakdownLines.push({
          operatorName: slot.operatorName,
          skillName: rarity ? `${rarity}★ rarity` : 'rarity',
          rawValue: contribution.rarity,
          included: contribution.rarity !== 0,
          reason: contribution.rarity !== 0
            ? 'Rarity bonus: 6★ +5%, 5★ +4%, 4★ +2%.'
            : 'Rarity bonus only applies at 4★ and above.',
        });
        receptionBreakdownLines.push({
          operatorName: slot.operatorName,
          skillName: eliteLabel,
          rawValue: contribution.elite,
          included: contribution.elite !== 0,
          reason: contribution.elite !== 0
            ? 'Promotion bonus: Elite 2 +16%, Elite 1 +8%.'
            : 'Promotion bonus starts at Elite 1 -- Elite 0 adds nothing.',
        });
      }
      for (const g of genericClueLines) {
        const raw = calcClueSpeed([g.description]);
        receptionBreakdownLines.push({
          operatorName: g.operatorName,
          skillName: null,
          rawValue: raw,
          included: raw !== 0,
          reason: raw === 0 ? 'No numeric Clue search speed effect.' : 'Counted normally.',
        });
      }
      for (const { slot, sk, handler } of pendingReceptionEntries) {
        const result = handler({
          rosters,
          manualValue: slot.manualValue,
          sameRoomOperatorNames,
          filledCountThisRoom: filled.length,
          dormitoryHasOperator,
          monsterMealTotal: totalMonsterMeal,
          rampWindowHours: 24,
          resourceBonuses,
          clueExchangeActive,
          violetOrchidInControlCenter: ccOperatorNames.includes('Violet Mizutsune Orchid'),
          officeLevel,
        });
        const raw = result.clueSpeed ?? 0;
        receptionBreakdownLines.push({ operatorName: slot.operatorName, skillName: sk.name, rawValue: raw, included: raw !== 0, reason: raw === 0 ? 'No numeric Clue search speed effect.' : 'Counted normally.', note: result.note });
      }
      if (inesEntry) {
        receptionBreakdownLines.push({ operatorName: 'Ines', skillName: 'Shadow Gathering', rawValue: specialClueSum, included: specialClueSum !== 0, reason: 'Ramping skill -- scales with the room\u2019s own Morale window, recomputed above.', note: inesNote });
      }
      if (ccEffects.clueCollectionBonus !== 0) {
        receptionBreakdownLines.push({ operatorName: clueCollectionSource?.operatorName ?? '(Control Center)', skillName: clueCollectionSource?.skillName ?? null, rawValue: ccEffects.clueCollectionBonus, included: true, reason: 'Highest single Clue Collection Speed bonus among Control Center operators -- only the strongest of this type applies, so any others in the room contribute nothing.' });
      }
      if (officeReceptionRoomBonus !== 0) {
        receptionBreakdownLines.push({ operatorName: '(Office)', skillName: null, rawValue: officeReceptionRoomBonus, included: true, reason: 'Cross-facility bonus from an Office skill.' });
      }
      for (const src of receptionRoomClueSpeedSources) {
        receptionBreakdownLines.push({
          operatorName: src.operatorName,
          skillName: src.skillName,
          rawValue: src.amount,
          included: src.amount !== 0,
          reason: 'Control Center cross-facility bonus aimed at this room -- additive, so it stacks with the highest-only Clue Collection Speed above rather than competing with it.',
        });
      }
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: clueSpeedBase,
        greyFormula: `100% room baseline + each operator's three contributions itemised below = ${(clueSpeedBase * 100).toFixed(2)}%`,
        overrideActive: false,
        lines: receptionBreakdownLines,
        finalYellow: clueSpeed,
        effectiveProductivity: clueSpeedBase + clueSpeed,
      };
    }
    if (f.kind === 'controlCenter' && filled.length > 0) {
      // The Control Center produces Morale for its own occupants plus a set of
      // bonuses that land in other facilities, so there is no baseline to show
      // and the grey figure is 0 -- same shape as the Power Plant's.
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: 0,
        greyFormula: 'no baseline -- the Control Center produces Morale for this room plus bonuses that land elsewhere',
        overrideActive: false,
        lines: ccBreakdownLines.filter((line) => filled.some((slot) => slot.operatorName === line.operatorName)),
        finalYellow: ccEffects.ccMoraleBonus,
        effectiveProductivity: ccEffects.ccMoraleBonus,
      };
    }
    const powerPlant = f.kind === 'powerPlant' ? computePowerPlantDroneRate(f, filled) : null;
    const droneRate = powerPlant ? powerPlant.rate : null;
    if (powerPlant && filled.length > 0) {
      // building_data.powerData.basicSpeedBuff: +5% per staffed plant.
      facilityBreakdown = {
        filledCount: filled.length,
        greyProductivity: 0.05 * workingCount(filled),
        greyFormula: '5% innate charging bonus from the plant operator, plus skill bonuses',
        overrideActive: false,
        lines: powerPlant.lines,
        finalYellow: powerPlant.rate - 0.05 * workingCount(filled),
        effectiveProductivity: powerPlant.rate,
      };
    }

    let office: { speed: number; ownSpeed: number; ccBonus: number; refreshHours: number } | null = null;
    let trainingSpeed: number | null = null;
    let trainingHours: number | null = null;
    const recipe = workshopRecipes.find(r => r.id === workshopSettings.recipeId && r.level <= f.level) ?? workshopRecipes.find(r => r.level <= f.level)!;
    const workshop = f.kind === 'workshop' && filled[0] && recipe ? workshopResult(filled[0].operatorName, skillsFor(filled[0], f.label), { ...workshopSettings, dormMorale: workshopSettings.overrideDormCount ? undefined : FACILITIES.filter(room => room.kind === 'dormitory' && room.level > 0).flatMap(room => (assignments[room.id] || []).flatMap(slot => slot ? [slot.morale ?? 0] : [])), recipe, dormitoryOperatorCount: dormitoryOperatorNames.size, stainlessInDorm: dormitoryHasOperator('Stainless'), intelligenceReserve: resourcePools.intelligenceReserve, ursusBeverages: totalUrsusBeverage }) : null;
    const officeSpecialMorale: Record<string, number> = {};
    if (f.kind === 'office') {
      const genericOfficeDescriptions: (string | null)[] = [];
      let specialHrSum = 0;
      for (const slot of filled) {
        for (const sk of skillsFor(slot, f.label)) {
          const key = keyOf(slot.operatorName, sk);
          if (key in OFFICE_SPECIAL_SKILLS) {
            const handler = OFFICE_SPECIAL_SKILLS[key];
            const result = handler({
              manualValue: slot.manualValue,
              dormitoryCount: FACILITIES.filter((f2) => f2.kind === 'dormitory' && f2.level > 0).length,
              totalDormitoryLevels,
              officeLevel,
              facilitiesWithEliteOperator,
              silverAshReignfrostInControlCenter,
              resourceBonuses,
              ursusSpecialtyBeverageTotal: totalUrsusBeverage,
            });
            if (result.hrSpeed) specialHrSum += result.hrSpeed;
            if (result.selfMorale) {
              officeSpecialMorale[slot.operatorName] = (officeSpecialMorale[slot.operatorName] || 0) + result.selfMorale;
            }
          } else {
            genericOfficeDescriptions.push(sk.description);
          }
        }
      }
      const generic = calcOffice(genericOfficeDescriptions);
      const ownSpeed = 0.05 * workingCount(filled) + generic.speed + specialHrSum;
      const combinedSpeed = ownSpeed + officeHrSpeedBonusFromCC;
      office = { speed: combinedSpeed, ownSpeed, ccBonus: officeHrSpeedBonusFromCC, refreshHours: 12 / (1 + combinedSpeed) };
    }

    if (f.kind === 'trainingRoom' && filled[0]) {
      const trainer = filled[0];
      const result = trainingResult(trainer.operatorName, skillsFor(trainer, f.label), {
        target: { ...resolvedTrainingTarget, mastery: Math.min(trainingTarget.mastery, f.level) }, allPlacedNames, rosters, worldlyPlight: resourcePools.worldlyPlight,
      }, trainingSpeedBonusFromCC);
      trainingSpeed = result.speed;
      trainingHours = result.hours;
      facilityBreakdown = { filledCount: 1, greyProductivity: 1.05, greyFormula: '100% baseline + 5% from the trainer', overrideActive: false, lines: result.contributions.map(value => ({ operatorName: trainer.operatorName, skillName: value.skill.name, rawValue: value.speed, included: value.speed !== 0, reason: value.speed ? 'Applies to the selected trainee, mastery and placed group members.' : 'No speed bonus for this target; the skill may change time or Morale instead.', note: value.note })), finalYellow: result.speed - 1.05, effectiveProductivity: result.speed };
      if (trainingSpeedBonusFromCC) facilityBreakdown.lines.push({ operatorName: '(Control Center)', skillName: null, rawValue: trainingSpeedBonusFromCC, included: true, reason: 'Strongest Control Center training bonus.' });
      perOperatorSpecialMorale[trainer.operatorName] = result.morale;
      for (const value of result.contributions) if (value.note) specialNotes.push({ operator: trainer.operatorName, note: value.note });
    }

    // Every facility gets morale relief from however many operators
    // are physically in Control Center right now, on top of whatever
    // this facility's own skills contribute. Dormitories additionally
    // get their own dedicated relief from Control Center skills that
    // specifically target them. This is the SHARED, room-wide portion
    // only -- confirmed against the full uploaded skill list, the vast
    // majority of "Morale consumed per hour +/-X" skills only affect
    // the operator who has them, not the room, so those are tracked
    // per-operator below instead of folded into this shared number.
    //
    // Control Center itself is a special case: it uses ccBaseMoraleRelief
    // (just the base "+0.05 per CC operator" portion, unconditional on
    // who they are) rather than the full ccMoraleRelief, since that
    // bundles in bannerOfBabelBonus/chongyueSolitaryLightBonus -- two
    // skill-specific bonuses documented as cross-facility effects for
    // every OTHER facility, not meant to apply back to Control Center's
    // own display. It also gets ccMoraleBonus added on top, a separate
    // source (parsed from individual operators' own skill text) that
    // only affects Control Center's own morale. Both the base relief
    // and ccMoraleBonus stack together -- the first operator placed in
    // Control Center should show the base relief immediately, even with
    // no morale-related skill of their own.
    const facilityMoraleYellowShared =
      morale.allOperatorsYellow -
      (f.kind === 'controlCenter' ? ccEffects.ccMoraleBonus + ccBaseMoraleRelief : ccMoraleRelief) -
      0;

    // Workshop Morale is spent per craft, never by an hourly staffing clock.
    const combinedMoraleRate = f.kind === 'workshop' ? 0 : Math.max(0, morale.grey + facilityMoraleYellowShared);

    // Always individualized per operator now -- never a single number
    // for the whole room, since Morale almost always decreases
    // differently per operator once any of them has their own
    // self-only modifier (which is the common case, not an exception).
    let perOperatorMorale: Record<string, number> | null = null;
    if (f.kind !== 'dormitory' && f.kind !== 'workshop' && filled.length > 0) {
      perOperatorMorale = {};
      for (const slot of filled) {
        const opName = slot.operatorName;
        let selfOnly =
          (morale.selfYellow[opName] || 0) +
          (perOperatorSpecialMorale[opName] || 0) +
          (officeSpecialMorale[opName] || 0) +
          (receptionRoomSelfMorale[opName] || 0) +
          (ccSelfMorale[opName] || 0);
        if (f.kind === 'controlCenter' && opName !== 'Ling' && rosters.SUI.has(opName) && activeSkillKeys.has('Ling|Keep the Wine Flowing' satisfies NamedSkillCheck)) selfOnly = Math.max(0, selfOnly);
        const isWaaiFuImmune = opName === 'Waai Fu';
        const rateBeforeSelf = isWaaiFuImmune
          ? Math.max(0, morale.grey + facilityMoraleYellowShared - morale.allOperatorsYellow)
          : combinedMoraleRate;
        perOperatorMorale[opName] = Math.max(0, rateBeforeSelf + selfOnly);
      }
    }

    // Worst-case (highest-rate, i.e. first-to-die) operator's time,
    // for the shared Full/Dead-time display alongside the per-operator
    // Morale breakdown.
    const worstCaseMoraleRate = perOperatorMorale
      ? Math.max(combinedMoraleRate, ...Object.values(perOperatorMorale))
      : combinedMoraleRate;
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
      fullTime = calcTradingPostFullTime(Math.max(1, orderLimit.base + orderLimit.adjustment), productivity.grey + productivity.yellow, f.level, goldOrderTier(filled.flatMap(slot => skillsFor(slot, f.label).map(sk => ({ operatorName: slot.operatorName, skillName: cleanSkillName(sk.name) ?? '' })))), filled.some(slot => hasSkill(slot, f.label, 'Closure|Special Orders')) ? 144 : undefined);
      if (filled.some(slot => hasSkill(slot, f.label, 'Pepe|Insightful'))) fullTime = Math.max(1, orderLimit.base + orderLimit.adjustment) * 4.5;
    }

    return {
      productivity,
      capacity,
      orderLimit,
      morale: { grey: morale.grey, yellow: facilityMoraleYellowShared },
      clueSpeed,
      clueSpeedBase,
      droneRate,
      office,
      trainingSpeed,
      trainingHours,
      workshop,
      combinedMoraleRate,
      perOperatorMorale,
      deadTime,
      fullTime,
      facilityBreakdown,
      // Reception Room notes are deliberately NOT included here. They ride on
      // their own breakdown line instead, which is what FacilityBreakdownLine's
      // `note` field is documented for -- "shown in the breakdown panel instead
      // of cluttering the facility tile". Ch'en the Dawnstreak's "non-numeric
      // effect, not modeled" filled her tile with a paragraph of explanation.
      // The Control Center has no "?" panel, so its notes stay on the tile.
      // Control Center notes are no longer piled onto the tile either -- they
      // ride on their own breakdown line now that the room has a panel.
      specialNotes,
    };
  }


  // Base-wide operator/faction data -- needed by Control Center's
  // special handlers before its own effects can be computed.
  const operatorByName = new Map(operators.map((o) => [o.name, o]));
  let tradingPostOperatorCount = 0;
  let powerPlantOperatorCount = 0;
  let robotPowerPlantCount = 0;
  let lancet2InPowerPlant = false;
  const powerPlantsWithRobot = new Set<string>();
  const powerPlantsWithLaterano = new Set<string>();
  let greyyDawnlightPowerPlantId: string | null = null;
  // Justice Knight's "Beep beep, activate!" Power Plant skill boosts
  // Wild Mane's own Factory (not this Power Plant) -- tracked here so
  // it can be applied to perFactoryProductivityBonus once that map
  // exists further below, since this loop runs first.
  let justiceKnightActiveInAnyPowerPlant = false;
  let wildManeFactoryId: string | null = null;
  const allPlacedNames: string[] = [];
  for (const f of FACILITIES) {
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    if (f.kind === 'tradingPost') tradingPostOperatorCount += slots.length;
    if (f.kind === 'powerPlant') {
      powerPlantOperatorCount += slots.length;
      robotPowerPlantCount += slots.filter((s) => OPERATION_PLATFORM.has(s.operatorName)).length;
      if (slots.some((s) => OPERATION_PLATFORM.has(s.operatorName) && importedMorale?.[s.operatorName] !== 0)) powerPlantsWithRobot.add(f.id);
      if (slots.some((s) => LATERANO.has(s.operatorName))) powerPlantsWithLaterano.add(f.id);
      if (slots.some((s) => s.operatorName === 'Lancet-2')) lancet2InPowerPlant = true;
      const greyySlot = slots.find((s) => s.operatorName === 'Greyy the Lightningbearer');
      if (hasSkill(greyySlot, f.label, 'Greyy the Lightningbearer|Dawnlight')) {
        greyyDawnlightPowerPlantId = f.id;
      }
      const jkSlot = slots.find((s) => s.operatorName === 'Justice Knight');
      if (hasSkill(jkSlot, f.label, 'Justice Knight|"Beep beep, activate!"')) {
        justiceKnightActiveInAnyPowerPlant = true;
      }
    }
    if (f.kind === 'factory' && slots.some((s) => s.operatorName === 'Wild Mane')) {
      wildManeFactoryId = f.id;
    }
    allPlacedNames.push(...slots.map((s) => s.operatorName));
  }
  if (resolvedTrainingTarget.operatorName && FACILITIES.some(f => f.kind === 'trainingRoom' && f.level > 0) && !allPlacedNames.includes(resolvedTrainingTarget.operatorName)) allPlacedNames.push(resolvedTrainingTarget.operatorName);
  function factionCountInBase(factionName: string): number {
    return allPlacedNames.filter((n) => operatorByName.get(n)?.faction === factionName).length;
  }

  const ccSlots = (assignments['controlCenter'] || []).filter((s): s is SlotAssignment => s !== null);
  const ccOperatorNames = ccSlots.map((s) => s.operatorName);
  const silverAshReignfrostInControlCenter = ccOperatorNames.includes('SilverAsh the Reignfrost');

  // Training Room has exactly 1 slot in this simulator's model, so "is
  // Logos the Trainer" and "is Logos the Training Room's occupant" are
  // the same question here -- there's no separate trainer/trainee role
  // distinction to model since only one operator can ever be assigned.
  const trainingRoomSlots = (assignments['trainingRoom'] || []).filter((s): s is SlotAssignment => s !== null);
  const logosInTrainingRoom = trainingRoomSlots.some((s) => s.operatorName === 'Logos');

  // Eunectes's "I've Got This" (Control Center): if Lancet-2 is in a
  // Power Plant, Power Plant count +2 -- explicitly the FACILITY count
  // only, not operator/robot headcounts, so this affects every Factory
  // skill that scales off powerPlantCount (Windflit, Eunectes's own
  // Automation skills, Passenger, Weedy) without touching
  // powerPlantOperatorCount/robotPowerPlantCount at all.
  const eunectesIveGotThisActive = ccSlots.some(
    (s) => hasSkill(s, 'Control Center', "Eunectes|I've Got This")
  );
  // Greyy the Lightningbearer's "Dawnlight": +1 Power Plant (facility
  // count only), conditional on no OTHER Power Plant containing an
  // Operation Platform robot (her own Power Plant is excluded from that
  // check by definition -- it's "other" Power Plants specifically).
  const greyyDawnlightActive =
    greyyDawnlightPowerPlantId !== null &&
    ![...powerPlantsWithRobot].some((id) => id !== greyyDawnlightPowerPlantId);
  const effectivePowerPlantCount =
    FACILITIES.filter((f2) => f2.kind === 'powerPlant' && f2.level > 0).length +
    (eunectesIveGotThisActive && lancet2InPowerPlant ? 2 : 0) +
    (greyyDawnlightActive ? 1 : 0);
  const civilightEternaInCC = ccOperatorNames.includes('Civilight Eterna');

  const dormitoryCountForCC = FACILITIES.filter((f) => f.kind === 'dormitory' && f.level > 0).length;

  const tradingPostFacilities = FACILITIES.filter((f) => f.kind === 'tradingPost');
  const tradingPostFactionCounts = tradingPostFacilities.map((f) => ({
    facilityId: f.id,
    operatorNames: (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null).map((s) => s.operatorName),
  }));
  function operatorInAnyTradingPost(name: string): { facilityId: string } | null {
    for (const tp of tradingPostFactionCounts) {
      if (tp.operatorNames.includes(name)) return { facilityId: tp.facilityId };
    }
    return null;
  }
  const receptionRoomOperatorNames = (assignments['receptionRoom'] || [])
    .filter((s): s is SlotAssignment => s !== null)
    .map((s) => s.operatorName);
  function reineInReceptionRoom(name: string): boolean {
    return receptionRoomOperatorNames.includes(name);
  }

  let blacksteelWorldwideCountInFactories = 0;
  const blacksteelWorldwideFactoryCounts: { factoryId: string; count: number }[] = [];
  const pinusSylvestrisFactoryAssignments: { factoryId: string; product: 'Battle Records' | 'Precious Metals' | null }[] = [];
  const abyssalHunterFactoryCounts: { factoryId: string; count: number }[] = [];
  let abyssalHunterTotalInFactories = 0; // base-wide total across every Factory -- Gladiia's Group Hunting bonus scales each Factory's boost by BOTH how many AH are in that specific Factory AND how many exist base-wide, confirmed by the user's own worked examples
  const factoriesWithKnight: { facilityId: string; knightCount: number; totalFilled: number }[] = [];
  for (const f of FACILITIES) {
    if (f.kind !== 'factory') continue;
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    const ahHere = slots.filter((s) => ABYSSAL_HUNTERS.has(s.operatorName)).length;
    if (ahHere > 0) abyssalHunterFactoryCounts.push({ factoryId: f.id, count: ahHere });
    abyssalHunterTotalInFactories += ahHere;
    const knightCount = slots.filter((s) => KNIGHTS.has(s.operatorName)).length;
    if (knightCount > 0) factoriesWithKnight.push({ facilityId: f.id, knightCount, totalFilled: slots.length });
    const bswHere = slots.filter((s) => BLACKSTEEL_WORLDWIDE.has(s.operatorName)).length;
    if (bswHere > 0) blacksteelWorldwideFactoryCounts.push({ factoryId: f.id, count: bswHere });
    for (const s of slots) {
      if (BLACKSTEEL_WORLDWIDE.has(s.operatorName)) blacksteelWorldwideCountInFactories += 1;
      if (PINUS_SYLVESTRIS.has(s.operatorName)) {
        pinusSylvestrisFactoryAssignments.push({ factoryId: f.id, product: (factoryProducts[f.id] as 'Battle Records' | 'Precious Metals' | undefined) || null });
      }
    }
  }

  // Preliminary Office HR speed (generic + Office special skills, minus
  // anything that itself depends on Control Center) -- computed early
  // because Saileach's Control Center skill needs this value.
  // Base-wide resource pools -- computed once, early, since both Office
  // and Control Center handlers need the final values. Self-contained
  // (doesn't depend on dormitoryOperatorNames/facilitiesWithSuiOperator,
  // which are computed later in this function for other purposes) so it
  // doesn't need to wait on those.
  const activeSkillKeys = new Set<string>();
  let earlyDormitoryOperatorCount = 0;
  let earlySuiFacilityCount = 0;
  let earlySuiHeadcountNonDorm = 0;
  let abyssalHuntersRestingInDormitories = 0;
  let abyssalHuntersRestingAtFullMorale = 0;
  let abyssalHuntersInNonDormFacilities = 0;
  let totalMonsterMeal = 0;
  // Base-wide headcounts for Eyjafjalla's and Yu's Dormitory skills.
  // Real text excludes "Assistants and Activity Room users" -- confirmed
  // not needed for this base setup (no Assistants/Activity Room usage),
  // so this counts every placed operator matching the roster directly.
  let wanderingMedicCountBaseWide = 0;
  let suiCountBaseWide = 0;
  let virtuosaRoomOperatorCount = 0;
  for (const f of FACILITIES) {
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    for (const slot of slots) {
      for (const sk of skillsFor(slot, f.label)) {
        activeSkillKeys.add(keyOf(slot.operatorName, sk));
      }
      if (WANDERING_MEDIC.has(slot.operatorName)) wanderingMedicCountBaseWide++;
      if (SUI.has(slot.operatorName)) suiCountBaseWide++;
    }
    const trainee = f.kind === 'trainingRoom' && f.level > 0 && resolvedTrainingTarget.operatorName && !slots.some(s => s.operatorName === resolvedTrainingTarget.operatorName) ? resolvedTrainingTarget.operatorName : '';
    if (trainee && WANDERING_MEDIC.has(trainee)) wanderingMedicCountBaseWide++;
    if (trainee && SUI.has(trainee)) suiCountBaseWide++;
    const abyssalHere = slots.filter((s) => ABYSSAL_HUNTERS.has(s.operatorName)).length + (trainee && ABYSSAL_HUNTERS.has(trainee) ? 1 : 0);
    if (f.kind === 'dormitory') {
      earlyDormitoryOperatorCount += slots.length;
      abyssalHuntersRestingInDormitories += abyssalHere;
      abyssalHuntersRestingAtFullMorale += slots.filter(s => rosters.ABYSSAL_HUNTERS.has(s.operatorName) && (s.morale ?? 0) >= 24).length;
      // Senshi's Diner: "provide 1 Monster Meal for every level of the
      // current Dormitory" -- Dormitories are confirmed Level 5, so
      // each Senshi placement generates 5.
      // Virtuosa's Soundless Resonance: "for every 1 Operator in that
      // Dormitory, Soundless Resonance +1" -- scales with HER OWN room's
      // size specifically, not the base-wide Dormitory total.
      for (const slot of slots) {
        if (hasSkill(slot, f.label, "Senshi|Senshi's Diner")) {
          // "for every level of the current Dormitory" -- the level of the
          // Dormitory he is actually standing in, which is user-settable. This
          // was hardcoded to 5 on the assumption that every Dormitory is max
          // level; in a Level 2 Dormitory he generates 2, so Laios read 155%
          // (5 meals) where he should read 149% (2 meals x 2% each).
          totalMonsterMeal += f.level;
        }
        if (hasSkill(slot, f.label, 'Virtuosa|Soundless Resonance')) {
          virtuosaRoomOperatorCount = slots.length;
        }
      }
      continue;
    }
    abyssalHuntersInNonDormFacilities += abyssalHere;
    const suiHere = slots.filter((s) => SUI.has(s.operatorName)).length + (trainee && SUI.has(trainee) ? 1 : 0);
    if (suiHere > 0) earlySuiFacilityCount += 1;
    earlySuiHeadcountNonDorm += suiHere;
  }
  const teamRainbowOperatorsInCC = ccOperatorNames.filter((n) => TEAM_RAINBOW.has(n)).length;
  const blacksteelWorldwideCountInBase = allPlacedNames.filter((n) => BLACKSTEEL_WORLDWIDE.has(n)).length;
  // Nasti's own skill counts herself toward her 3% scale, so this is a
  // plain whole-base count with no exclusion. Muelsyse's separate
  // "other Rhine Lab" count (excluding herself) is computed per-Power-
  // Plant where it's actually consumed, since it needs to know which
  // specific operator is asking.
  const rhineLabCountInBase = allPlacedNames.filter((n) => RHINE_LAB.has(n)).length;

  // Gladiia's Group Hunting -- confirmed mechanic: 5%/10% productivity
  // per Abyssal Hunter in Factories (base-wide count), capping at
  // Waai Fu's Cooperative Will needs to know whether Gladiia's Group
  // Hunting is active (it gets overridden when it is) -- the NUMERIC
  // bonus itself is applied entirely through controlCenterSpecialSkills.ts's
  // perFactoryProductivity mechanism now, not duplicated here (that
  // duplication was the actual bug: this used to ALSO compute and apply
  // its own separate copy of the same bonus, using the older, simpler
  // per-factory-only formula, stacking on top of the newer, correctly
  // base-wide-scaled one).
  const gladiiaGroupHuntingActiveInCC = ccOperatorNames.includes('Gladiia');
  // Prelim pass, mirroring the Office prelim pattern above: runs every
  // Control Center handler once early, using placeholder values for
  // fields that genuinely can't be known yet (resourceBonuses,
  // officeHrSpeedPercent) since only a couple of handlers even read
  // those for their own Morale output -- an accepted, minor
  // approximation, same tradeoff already made for Office's own prelim
  // pass. Purpose: derive each Control Center operator's own Morale
  // rate, then the facility-wide window (time until the first operator
  // hits 0), then for Ling/Dusk specifically, what fraction of that
  // window they spend above vs below 12 Morale -- confirmed by the
  // user: operators start at full Morale and are simply left in place
  // until the first one runs out.
  const emptyResourcePoolsForPrelim: ResourcePools = {
    passion: 0,
    worldlyPlight: 0,
    soundlessResonance: 0,
    perceptionInformation: 0,
    intelligenceReserve: 0,
    memoryFragments: 0,
    witchcraftCrystal: 0,
    chainOfThought: 0,
    measure: 0,
    dreamland: 0,
  };
  let prelimCcMoraleBonus = 0;
  const prelimCcSelfMorale: Record<string, number> = {};
  for (const slot of ccSlots) {
    for (const sk of skillsFor(slot, 'Control Center')) {
      const key = keyOf(slot.operatorName, sk);
      const handler = CONTROL_CENTER_SPECIAL_SKILLS[key];
      if (!handler) continue;
      const result = handler({
        rosters,
        manualValue: slot.manualValue,
        ccOperatorNames,
        // Wang's Expedience compares Factories against Power Plants +
        // Trading Posts, which is the player's own layout now.
        ...layoutCounts,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        tradingPostFactionCounts,
        reineInReceptionRoom,
        operatorInAnyTradingPost,
        blacksteelWorldwideCountInFactories,
        blacksteelWorldwideFactoryCounts,
        pinusSylvestrisFactoryAssignments,
        abyssalHunterFactoryCounts,
        abyssalHunterTotalInFactories,
        factoriesWithKnight,
        powerPlantOperatorCount,
        robotPowerPlantCount,
        officeHrSpeedPercent: 0, // not yet known at this point -- only Saileach reads this, and her skill doesn't affect Morale at all
        civilightEternaInCC,
        resourcePools: emptyResourcePoolsForPrelim,
        resourceBonuses: {},
        activeSkillKeys,
        abyssalHuntersInNonDormFacilities,
        abyssalHuntersRestingInDormitories,
        abyssalHuntersRestingAtFullMorale,
        eliteLevel: slot.eliteLevel,
        allPlacedNames,
      });
      if (result.ccMoraleBonus) prelimCcMoraleBonus += result.ccMoraleBonus;
      if (result.selfMorale) {
        prelimCcSelfMorale[slot.operatorName] = (prelimCcSelfMorale[slot.operatorName] || 0) + result.selfMorale;
      }
      if (result.targetedMoraleEffect) {
        const { targetName, amount } = result.targetedMoraleEffect;
        prelimCcSelfMorale[targetName] = (prelimCcSelfMorale[targetName] || 0) + amount;
      }
      if (result.targetedMoraleEffects) {
        for (const { targetName, amount } of result.targetedMoraleEffects) {
          prelimCcSelfMorale[targetName] = (prelimCcSelfMorale[targetName] || 0) + amount;
        }
      }
    }
  }
  // Manual setting instead of a calculated fraction -- confirmed by the
  // user: the real trigger depends on how the whole day actually plays
  // out, which this steady-state simulator can't track, so it's a
  // direct on/off choice instead. Defaults to "above 12".
  const lingFractionAbove12 = (baseSource === 'account' && importedMorale?.Ling !== undefined ? importedMorale!.Ling > 12 : moraleAbove12) ? 1 : 0;
  const duskFractionAbove12 = (baseSource === 'account' && importedMorale?.Dusk !== undefined ? importedMorale!.Dusk > 12 : moraleAbove12) ? 1 : 0;

  const officeLevel = FACILITIES.find(room => room.kind === 'office')?.level ?? 0;
  const dormLevelFor = (name: string) => FACILITIES.find(room => room.kind === 'dormitory' && assignments[room.id]?.some(slot => slot?.operatorName === name))?.level ?? 0;
  const resourceState: BaseResourceState = {
    officeLevel,
    czernyDormitoryLevel: dormLevelFor('Czerny'),
    irisDormitoryLevel: dormLevelFor('Iris'),
    // Wang's Expedience weighs Factories against Power Plants + Trading
    // Posts, so it needs the layout the player actually built.
    ...layoutCounts,
    dormitoryOperatorCount: earlyDormitoryOperatorCount,
    suiOperatorsInNonDormFacilities: earlySuiHeadcountNonDorm,
    suiOperatorFacilityCount: earlySuiFacilityCount,
    teamRainbowOperatorsInCC,
    // Assumes full Morale at the start of a freshly-placed 24h cycle --
    // this calculator computes a steady-state snapshot rather than a true
    // minute-by-minute simulation, so morale-threshold skills (Dusk,
    // Ling) are evaluated at this single starting condition rather than
    // tracking how morale actually depletes over the day.
    selfMorale: 24,
    lingFractionAbove12,
    duskFractionAbove12,
    virtuosaRoomOperatorCount,
  };
  const resourcePools = computeResourcePools(resourceState, activeSkillKeys);
  const resourceBonuses = consumerBonuses(resourceState, resourcePools);

  let facilitiesWithSuiOperator = 0;
  let facilitiesWithEliteOperator = 0;
  for (const f of FACILITIES) {
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    if (f.kind !== 'dormitory' && (slots.some((s) => rosters.SUI.has(s.operatorName)) || f.kind === 'trainingRoom' && f.level > 0 && resolvedTrainingTarget.operatorName && rosters.SUI.has(resolvedTrainingTarget.operatorName))) facilitiesWithSuiOperator += 1;
    if (slots.some((s) => ELITE_OPERATOR.has(s.operatorName)) || f.kind === 'trainingRoom' && f.level > 0 && resolvedTrainingTarget.operatorName && ELITE_OPERATOR.has(resolvedTrainingTarget.operatorName)) facilitiesWithEliteOperator += 1;
  }

  const officeSlotsForPrelim = (assignments['office'] || []).filter((s): s is SlotAssignment => s !== null);
  let prelimOfficeSpecialHr = 0;
  let officeReceptionRoomBonus = 0;
  const prelimOfficeGeneric: (string | null)[] = [];
  for (const slot of officeSlotsForPrelim) {
    for (const sk of skillsFor(slot, 'Office')) {
      const handler = OFFICE_SPECIAL_SKILLS[keyOf(slot.operatorName, sk)];
      if (handler) {
        const result = handler({
          manualValue: slot.manualValue,
          dormitoryCount: dormitoryCountForCC,
          totalDormitoryLevels,
          officeLevel,
          facilitiesWithEliteOperator,
          silverAshReignfrostInControlCenter,
          resourceBonuses,
          ursusSpecialtyBeverageTotal: 0, // Control Center processing (where this is actually generated) hasn't run yet at this point -- only feeds Saileach's threshold check, not Blitz's own final HR speed
        });
        if (result.hrSpeed) prelimOfficeSpecialHr += result.hrSpeed;
        if (result.receptionRoomClueSpeed) officeReceptionRoomBonus += result.receptionRoomClueSpeed;
      } else {
        prelimOfficeGeneric.push(sk.description);
      }
    }
  }
  const officeHrSpeedPercent = (calcOffice(prelimOfficeGeneric).speed + prelimOfficeSpecialHr) * 100;

  // Control Center's cross-facility effects, computed once here since
  // every other facility's calculation needs it.
  const ccDescriptions = ccSlots.flatMap((s) =>
    skillsFor(s, 'Control Center')
      .filter((sk) => !(keyOf(s.operatorName, sk) in CONTROL_CENTER_SPECIAL_SKILLS))
      .map((sk) => sk.description)
  );
  let ccEffects: ControlCenterEffects = calcControlCenterEffects(ccDescriptions);
  // Who actually won the highest-only Clue Collection pool. calcControlCenterEffects
  // returns the value but not the source, and the Reception Room's breakdown was
  // labelling it "(Control Center) (generic)" -- true, but useless when Civilight
  // Eterna's +15% and Wiš'adel's +5% are both in play and only one of them is the
  // one being reported. Tracked over the same generic skills the pool is built
  // from; a special-cased candidate overwrites it below, where the source is known.
  let clueCollectionSource: { operatorName: string; skillName: string | null } | null = null;
  for (const slot of ccSlots) {
    for (const sk of skillsFor(slot, 'Control Center')) {
      if (keyOf(slot.operatorName, sk) in CONTROL_CENTER_SPECIAL_SKILLS) continue;
      if (Math.abs(clueCollectionBonusFrom(sk.description)) === Math.abs(ccEffects.clueCollectionBonus)
          && ccEffects.clueCollectionBonus !== 0 && !clueCollectionSource) {
        clueCollectionSource = { operatorName: slot.operatorName, skillName: sk.name };
      }
    }
  }
  const wisAdelBannerOfBabelActive = ccSlots.some(
    (s) => hasSkill(s, 'Control Center', "Wiš'adel|Banner of Babel")
  );
  const bannerOfBabelBonus = wisAdelBannerOfBabelActive ? (civilightEternaInCC ? 0.2 : 0.1) : 0;
  const chongyueSolitaryLightActive = ccSlots.some(
    (s) => hasSkill(s, 'Control Center', 'Chongyue|Solitary Light')
  );
  const chongyueSolitaryLightBonus = chongyueSolitaryLightActive
    ? 0.05 + (resourceBonuses['Chongyue|Solitary Light|morale_recovery_bonus'] ?? 0)
    : 0;
  // The base "each CC operator provides +0.05 relief" portion,
  // unconditional on who they are -- kept separate from the full
  // ccMoraleRelief below, since that bundles in bannerOfBabelBonus and
  // chongyueSolitaryLightBonus, which are specifically cross-facility
  // effects for every OTHER facility (see the comment above where
  // they're computed), not meant to apply back to Control Center's own
  // display.
  const ccBaseMoraleRelief = calcControlCenterMoraleRelief(ccSlots.length);
  const ccActiveSkillNames = ccSlots.flatMap(s => skillsFor(s, 'Control Center').map(sk => (sk.name ?? '').split('Replaces')[0].trim()));
  const mlynarActive = ccActiveSkillNames.includes('Business Is Business');
  const ccMoraleRelief = ccBaseMoraleRelief + crossFacilityMoraleRelief('factory', bannerOfBabelBonus, chongyueSolitaryLightBonus, mlynarActive, ccActiveSkillNames);

  let ccDormitoryAllOperatorsRelief = 0; // highest-only among "all Operators in Dormitories" effects (Kestrel, Nymph, Reed the Flame Shadow)
  let ccDormitoryEliteOperatorsRelief = 0; // highest-only among "all Elite Operators in Dormitories" effects (Raidian) -- a separate type, doesn't compete with the above
  let officeHrSpeedBonusFromCC = 0;
  let trainingSpeedBonusFromCC = 0; // highest-only among Ascalon/Blaze the Igniting Spark/Hoshiguma the Breacher, all confirmed "strongest effect of this type"
  let factoryPreciousMetalBonusFromCC = 0;
  let receptionRoomClueSpeedFromCC = 0;
  const receptionRoomClueSpeedSources: { operatorName: string; skillName: string | null; amount: number }[] = [];
  const perTradingPostBonus = new Map<string, number>();
  const perTradingPostOrderLimitBonus = new Map<string, number>();
  const perFactoryProductivityBonus = new Map<string, number>();
  // Who each of those per-Factory amounts came from. The map above is a bare
  // total, which is fine for the arithmetic but leaves the Factory's "?" panel
  // unable to name Viviana, Flametail or Justice Knight -- and an unexplained
  // gap between the panel and the tile is exactly how a wrong number hides.
  const perFactoryProductivitySources = new Map<string, { operatorName: string; skillName: string | null; amount: number }[]>();
  function addPerFactoryProductivity(facilityId: string, amount: number, operatorName: string, skillName: string | null) {
    perFactoryProductivityBonus.set(facilityId, (perFactoryProductivityBonus.get(facilityId) || 0) + amount);
    perFactoryProductivitySources.set(facilityId, [
      ...(perFactoryProductivitySources.get(facilityId) || []),
      { operatorName, skillName, amount },
    ]);
  }
  // Justice Knight's "Beep beep, activate!" cross-facility bonus, tracked
  // earlier -- was computed in powerPlantSpecialSkills.ts but never
  // actually applied anywhere until now.
  if (justiceKnightActiveInAnyPowerPlant && wildManeFactoryId) {
    addPerFactoryProductivity(wildManeFactoryId, 0.05, 'Justice Knight', '"Beep beep, activate!"');
  }
  // Per-skill attribution for the Control Center's own breakdown panel. The
  // aggregates in ccEffects say what the room produces but not who produced it,
  // and without a panel the Control Center had nowhere to show any of this --
  // which is why its skills' notes were being printed onto the facility tile
  // instead, filling the card with paragraphs.
  const ccBreakdownLines: FacilityBreakdownLine[] = [];
  let totalFelvine = 0;
  let totalUrsusBeverage = 0;
  const ccSelfMorale: Record<string, number> = {};

  for (const slot of ccSlots) {
    for (const sk of skillsFor(slot, 'Control Center')) {
      const handler = CONTROL_CENTER_SPECIAL_SKILLS[keyOf(slot.operatorName, sk)];
      if (!handler) continue;
      const result = handler({
        rosters,
        manualValue: slot.manualValue,
        ccOperatorNames,
        // Wang's Expedience compares Factories against Power Plants +
        // Trading Posts, which is the player's own layout now.
        ...layoutCounts,
        operatorFaction: (name) => operatorByName.get(name)?.faction || null,
        tradingPostFactionCounts,
        reineInReceptionRoom,
        operatorInAnyTradingPost,
        blacksteelWorldwideCountInFactories,
        blacksteelWorldwideFactoryCounts,
        pinusSylvestrisFactoryAssignments,
        abyssalHunterFactoryCounts,
        abyssalHunterTotalInFactories,
        factoriesWithKnight,
        powerPlantOperatorCount,
        robotPowerPlantCount,
        officeHrSpeedPercent,
        civilightEternaInCC,
        resourcePools,
        resourceBonuses,
        activeSkillKeys,
        abyssalHuntersInNonDormFacilities,
        abyssalHuntersRestingInDormitories,
        abyssalHuntersRestingAtFullMorale,
        eliteLevel: slot.eliteLevel,
        allPlacedNames,
      });
      if (result.ccMoraleBonus) ccEffects = { ...ccEffects, ccMoraleBonus: ccEffects.ccMoraleBonus + result.ccMoraleBonus };
      if (result.tradingPostBonusCandidate && Math.abs(result.tradingPostBonusCandidate) > Math.abs(ccEffects.tradingPostBonus)) {
        ccEffects = { ...ccEffects, tradingPostBonus: result.tradingPostBonusCandidate };
      }
      if (result.factoryBonusCandidate && Math.abs(result.factoryBonusCandidate) > Math.abs(ccEffects.factoryBonus)) {
        ccEffects = { ...ccEffects, factoryBonus: result.factoryBonusCandidate };
      }
      if (result.clueCollectionBonusCandidate && Math.abs(result.clueCollectionBonusCandidate) > Math.abs(ccEffects.clueCollectionBonus)) {
        ccEffects = { ...ccEffects, clueCollectionBonus: result.clueCollectionBonusCandidate };
        clueCollectionSource = { operatorName: slot.operatorName, skillName: sk.name };
      }
      if (result.dormitoryMoraleRelief) ccDormitoryAllOperatorsRelief = Math.max(ccDormitoryAllOperatorsRelief, result.dormitoryMoraleRelief);
      if (result.dormitoryEliteOperatorsRelief) ccDormitoryEliteOperatorsRelief = Math.max(ccDormitoryEliteOperatorsRelief, result.dormitoryEliteOperatorsRelief);
      if (result.officeHrSpeedBonus) officeHrSpeedBonusFromCC += result.officeHrSpeedBonus;
      if (result.trainingSpeedBonus) trainingSpeedBonusFromCC = Math.max(trainingSpeedBonusFromCC, result.trainingSpeedBonus);
      if (result.factoryPreciousMetalBonusFromCC) factoryPreciousMetalBonusFromCC += result.factoryPreciousMetalBonusFromCC;
      if (result.receptionRoomClueSpeedFromCC) {
        receptionRoomClueSpeedFromCC += result.receptionRoomClueSpeedFromCC;
        receptionRoomClueSpeedSources.push({ operatorName: slot.operatorName, skillName: sk.name, amount: result.receptionRoomClueSpeedFromCC });
      }
      if (result.perTradingPostOrderEfficiency) {
        for (const { facilityId, amount } of result.perTradingPostOrderEfficiency) {
          perTradingPostBonus.set(facilityId, (perTradingPostBonus.get(facilityId) || 0) + amount);
        }
      }
      if (result.perTradingPostOrderLimit) {
        for (const { facilityId, amount } of result.perTradingPostOrderLimit) {
          perTradingPostOrderLimitBonus.set(facilityId, (perTradingPostOrderLimitBonus.get(facilityId) || 0) + amount);
        }
      }
      if (result.perFactoryProductivity) {
        for (const { facilityId, amount } of result.perFactoryProductivity) {
          addPerFactoryProductivity(facilityId, amount, slot.operatorName, sk.name);
        }
      }
      // One line per skill, carrying whatever it contributed. Morale is the
      // Control Center's own output; everything else it produces lands in other
      // facilities, so those are reported as 0 here with the note saying where
      // to look, rather than being silently absent.
      {
        const landsElsewhere = [
          result.tradingPostBonusCandidate !== undefined && 'Trading Post order efficiency',
          result.factoryBonusCandidate !== undefined && 'Factory productivity',
          result.clueCollectionBonusCandidate !== undefined && 'Reception Room clue speed',
          result.receptionRoomClueSpeedFromCC !== undefined && 'Reception Room clue speed',
          result.perFactoryProductivity?.length && 'a specific Factory',
          result.perTradingPostOrderEfficiency?.length && 'a specific Trading Post',
          result.perTradingPostOrderLimit?.length && 'a specific Trading Post order limit',
          result.officeHrSpeedBonus !== undefined && 'Office HR speed',
          result.factoryPreciousMetalBonusFromCC !== undefined && 'Factory Precious Metal productivity',
          result.dormitoryMoraleRelief !== undefined && 'Dormitory morale',
          result.trainingSpeedBonus !== undefined && 'Training Room speed',
        ].filter(Boolean) as string[];
        const morale = result.ccMoraleBonus ?? 0;
        if (morale !== 0 || landsElsewhere.length > 0 || result.note) {
          ccBreakdownLines.push({
            operatorName: slot.operatorName,
            skillName: sk.name,
            rawValue: morale,
            included: morale !== 0,
            reason: morale !== 0
              ? 'Morale per hour for everyone in the Control Center -- these stack rather than competing.'
              : landsElsewhere.length > 0
                ? `Contributes nothing to this room; it lands in ${landsElsewhere.join(', ')}.`
                : 'No numeric effect on this room.',
            note: result.note,
          });
        }
      }
      if (result.felvine) totalFelvine += result.felvine;
      if (result.ursusSpecialtyBeverage) totalUrsusBeverage += result.ursusSpecialtyBeverage;
      if (result.selfMorale) {
        ccSelfMorale[slot.operatorName] = (ccSelfMorale[slot.operatorName] || 0) + result.selfMorale;
      }
      if (result.targetedMoraleEffect) {
        const { targetName, amount } = result.targetedMoraleEffect;
        ccSelfMorale[targetName] = (ccSelfMorale[targetName] || 0) + amount;
      }
      if (result.targetedMoraleEffects) {
        for (const { targetName, amount } of result.targetedMoraleEffects) {
          ccSelfMorale[targetName] = (ccSelfMorale[targetName] || 0) + amount;
        }
      }
    }
  }
  const dormitoryCount = FACILITIES.filter((f) => f.kind === 'dormitory' && f.level > 0).length;
  const dormitoryOperatorNames = new Set<string>();
  for (const f of FACILITIES) {
    if (f.kind !== 'dormitory') continue;
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    slots.forEach((s) => dormitoryOperatorNames.add(s.operatorName));
  }
  function dormitoryHasOperator(name: string): boolean {
    return dormitoryOperatorNames.has(name);
  }

  const dormitoryRecoveryByFacility: Record<string, { name: string; base: number; bonus: number }[]> = {};
  for (const f of FACILITIES) {
    if (f.kind !== 'dormitory') continue;
    const slots = (assignments[f.id] || []).filter((s): s is SlotAssignment => s !== null);
    const roomNames = slots.map((s2) => s2.operatorName);
    const moraleByOperator = Object.fromEntries(slots.map(s => [s.operatorName, s.morale ?? 0]));
    // This specific Dormitory's own base recovery rate -- depends on ITS
    // level and ITS ambience (player-set, or defaulted to fully-furnished
    // for that level if never touched), not a single base-wide constant.
    const thisRoomBaseRecovery = calcDormitoryRecovery(f.level, dormitoryAmbience[f.id] ?? defaultDormitoryAmbience(f.level));

    // First pass: what does each operator's own skill contribute --
    // to themselves, to everyone (self included), to everyone else, and
    // to one specific other operator (single-target skills).
    const perSlotResults = slots.map((s) => {
      let selfBonus = 0;
      let allOperatorsBonus = 0;
      let allOthersBonus = 0;
      let singleTargetBonus = 0;
      let exclusiveRecovery: number | undefined;
      let conditionalGroupBonus: { below: number; amount: number } | undefined;
      let distributedBonus: { recipients: string[]; amount: number } | undefined;
      // Leftmost OTHER operator in the room (confirmed tie-break, since
      // every operator is assumed to start at full Morale when placed --
      // everyone's tied for lowest, so the leftmost one wins) -- UNLESS
      // this operator has a confirmed preferred target who's actually
      // present in the room, which takes precedence over the tiebreak
      // entirely (e.g. Schwarz always targets Ceylon if she's there).
      const preferredTarget = DORMITORY_PREFERRED_TARGET[s.operatorName];
      const targetIfSelected =
        (preferredTarget && roomNames.includes(preferredTarget) && moraleByOperator[preferredTarget] < 24 ? preferredTarget : null) ??
        roomNames.filter(n => n !== s.operatorName && moraleByOperator[n] < 24).sort((a, b) => moraleByOperator[a] - moraleByOperator[b])[0] ??
        null;
      for (const sk of skillsFor(s, 'Dormitory')) {
        const handler = DORMITORY_SPECIAL_SKILLS[keyOf(s.operatorName, sk)];
        if (!handler) {
          const text = sk.description ?? '';
          const value = Number(text.match(/(?:restores?|recover(?:s|y))[^+]*[+]?(\d+(?:\.\d+)?)/i)?.[1] ?? 0);
          if (/all (?:other )?operators/i.test(text)) allOperatorsBonus += value; else selfBonus += value;
          continue;
        }
        const result = handler({
          rosters,
          manualValue: s.manualValue,
          sameRoomOperatorNames: roomNames,
          moraleByOperator,
          filledCountThisRoom: slots.length,
          // The player sets each Dormitory's own level now, so read this
          // room's rather than assuming every Dormitory is maxed.
          dormitoryLevel: f.level,
          officeLevel,
          targetIfSelected,
          wanderingMedicCountBaseWide,
          suiCountBaseWide,
          soundlessResonanceTotal: resourcePools.soundlessResonance,
          powerPlantCount: layoutCounts.powerPlantCount, // Lumen's Glimmering Glow scales off it
        });
        if (result.exclusiveRecovery !== undefined) exclusiveRecovery = result.exclusiveRecovery;
        if (result.conditionalGroupBonus) conditionalGroupBonus = result.conditionalGroupBonus;
        if (result.distributedBonus) distributedBonus = result.distributedBonus;
        selfBonus += result.selfMoraleRecovery || 0;
        allOperatorsBonus += result.allOperatorsBonus || 0;
        allOthersBonus += result.allOthersBonus || 0;
        singleTargetBonus += result.singleTargetBonus || 0;
      }
      return { name: s.operatorName, selfBonus, allOperatorsBonus, allOthersBonus, singleTargetBonus, targetIfSelected, exclusiveRecovery, conditionalGroupBonus, distributedBonus };
    });

    dormitoryRecoveryByFacility[f.id] = dormitoryRecoveryRates(perSlotResults, thisRoomBaseRecovery, rosters, moraleByOperator, slots.some(s => hasSkill(s, 'Dormitory', 'Morgan|No.1 Practice Partner')), ccDormitoryAllOperatorsRelief, ccDormitoryEliteOperatorsRelief);
  }

  const builtFactoryProducts = FACILITIES.filter(f => f.kind === 'factory' && f.level > 0).map(f => factoryProducts[f.id] ?? null);
  const distinctFactoryProductCount = new Set(builtFactoryProducts.filter(Boolean)).size;
  const baseGoldLineCount = pureGoldProductionLineCount(builtFactoryProducts);
  const kiraraGoldLineBonus = activeSkillKeys.has('Kirara|Order Flow Visualization α')
    ? Math.floor(baseGoldLineCount / 4) * 2
    : activeSkillKeys.has('Kirara|Order Flow Visualization β')
    ? Math.floor(baseGoldLineCount / 2) * 2
    : 0;
  const pozemkaGoldLineBonus = activeSkillKeys.has('Pozëmka|Zeruertza Resident')
    ? Math.min(4, allPlacedNames.filter((n) => DURIN.has(n)).length)
    : 0;
  const effectiveGoldLineCount = baseGoldLineCount + kiraraGoldLineBonus + pozemkaGoldLineBonus;
  const ulpianusInBase = allPlacedNames.includes('Ulpianus');
  const rooms = Object.fromEntries(FACILITIES.map(f => [f.id, productivityFor(f, ccEffects, ccMoraleRelief)]));


  // Base-wide aggregates, computed across every facility, not just the
  // currently-open one. Tracked as Green/Red pairs: Green is the
  // REALISTIC daily average given the player's actual chosen login
  // interval -- if a Trading Post or Factory hits full capacity (or
  // its operators run dry) before the player is due back, it sits idle
  // doing nothing until the next check-in, wasting that time. Red is
  // the IDEAL daily average assuming the player always collects the
  // instant a room caps out, so it's never idle -- always >= Green,
  // and exactly equal to it whenever loginInterval is short enough
  // that the room never actually caps before they return anyway.
  let dailyExpGreen = 0;
  let dailyExpRed = 0;
  let dailyGoldMadeGreen = 0; // Factory (Precious Metals) production -- not yet sold
  let dailyGoldMadeRed = 0;
  let dailyGoldSoldGreen = 0; // Trading Post's random gold spawns -- this is what actually becomes LMD
  let dailyGoldFromProvisoGreen = 0; // Proviso's own slice of the gold above -- isolated for display, not a separate pool
  let dailyGoldFromProvisoRed = 0;
  let dailyGoldSoldRed = 0;
  let dailyExtraLmdFromOrdersGreen = 0;
  let dailyExtraLmdFromOrdersRed = 0;
  let dailyLmdFromPepeGreen = 0; // Pepe's Special Exclusive Orders -- a completely separate mechanic, no gold bar at all, fixed 270min/order regardless of any efficiency modifier
  let dailyLmdFromPepeRed = 0;

  // Each room's own share of the Red (never idle) totals above, per day, so a
  // chronological simulation can apply its own storage and Morale cut-offs.
  const roomDailyOutput: Record<string, RoomDailyOutput> = {};
  for (const f of FACILITIES) {
    if (f.capacity <= 0) continue;
    // An unmanned room, or one whose every worker is exhausted, cannot turn a
    // base-wide bonus into output on its own.
    if (!workingCount((assignments[f.id] ?? []).filter((s): s is SlotAssignment => !!s))) continue;
    const { productivity, deadTime, fullTime } = rooms[f.id];
    const roomOutput = { exp: 0, goldMade: 0, goldSold: 0, extraLmd: 0, pepeLmd: 0 };
    roomDailyOutput[f.id] = roomOutput;
    // capHours: whichever comes first -- running out of storage
    // capacity (fullTime) or running out of operator energy (deadTime)
    // -- is when this room actually stops producing until someone
    // collects/reassigns it. null means neither applies (never stops).
    const capHours = fullTime !== null && deadTime !== null ? Math.min(fullTime, deadTime) : fullTime !== null ? fullTime : deadTime;
    const cyclesPerDay = 24 / loginInterval;
    // Realistic: each login cycle only produces for min(capHours,
    // loginInterval) hours -- if the room caps before the player is
    // due back, the rest of that cycle is wasted. Ideal: always
    // exactly 24 (== 24/24), since perfect on-time collection means
    // the room is never actually idle.
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
      const roomSlots = assignments[f.id] || [];
      const pepeInsightfulActive = roomSlots.some(
        (s) => hasSkill(s, 'Trading Post', 'Pepe|Insightful')
      );
      const uOfficialHere = roomSlots.some(
        (s) => hasSkill(s, 'Trading Post', 'U-Official|Naive Negotiator')
      );
      const provisoBonus = roomSlots.some((s) => hasSkill(s, 'Trading Post', 'Proviso|Damages for Breach β'))
        ? 2
        : roomSlots.some((s) => hasSkill(s, 'Trading Post', 'Proviso|Damages for Breach α'))
        ? 1
        : 0;
      const tequilaLmdBonus = roomSlots.some((s) => hasSkill(s, 'Trading Post', 'Tequila|Investment β'))
        ? 500
        : roomSlots.some((s) => hasSkill(s, 'Trading Post', 'Tequila|Investment α'))
        ? 250
        : 0;
      const goldTier = goldOrderTier(roomSlots.flatMap(s => s ? skillsFor(s, 'Trading Post').map(sk => ({ operatorName: s.operatorName, skillName: sk.name ?? '' })) : []));
      const realisticHours = realisticFraction * 24;
      const idealHours = idealFraction * 24;
      if (pepeInsightfulActive) {
        dailyLmdFromPepeGreen += (realisticHours * 60 / 270) * 1000;
        dailyLmdFromPepeRed += (idealHours * 60 / 270) * 1000;
        roomOutput.pepeLmd += (idealHours * 60 / 270) * 1000;
      } else if (roomSlots.some(s => hasSkill(s, 'Trading Post', 'Closure|Special Orders'))) {
        // Fixed 2-gold/1200-LMD, 144-minute orders; not Defaulted.
        const tradesPerHour = effectiveProductivity / 2.4;
        dailyGoldSoldGreen += 2 * tradesPerHour * realisticHours;
        dailyGoldSoldRed += 2 * tradesPerHour * idealHours;
        roomOutput.goldSold += 2 * tradesPerHour * idealHours;
        dailyExtraLmdFromOrdersGreen += 200 * tradesPerHour * realisticHours;
        dailyExtraLmdFromOrdersRed += 200 * tradesPerHour * idealHours;
        roomOutput.extraLmd += 200 * tradesPerHour * idealHours;
      } else if (uOfficialHere) {
        const perHour = calcTradingPostGoldPerHourStandardized(effectiveProductivity, 2, f.level);
        dailyGoldSoldGreen += perHour * realisticHours;
        dailyGoldSoldRed += perHour * idealHours;
        roomOutput.goldSold += perHour * idealHours;
      } else {
        // Always the same combined call -- Tailoring's distribution tier,
        // Proviso's gold bonus, and Tequila's LMD bonus all apply
        // together regardless of which subset is actually present
        // (0/0/'base' for any that aren't), instead of a branching chain
        // that could silently drop one dimension when another is active.
        const { goldPerHour, extraLmdPerHour } = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, provisoBonus, tequilaLmdBonus, goldTier, f.level);
        dailyGoldSoldGreen += goldPerHour * realisticHours;
        dailyGoldSoldRed += goldPerHour * idealHours;
        roomOutput.goldSold += goldPerHour * idealHours;
        dailyExtraLmdFromOrdersGreen += extraLmdPerHour * realisticHours;
        dailyExtraLmdFromOrdersRed += extraLmdPerHour * idealHours;
        roomOutput.extraLmd += extraLmdPerHour * idealHours;
        // Isolate Proviso's own slice for display -- same real call, her
        // bonus zeroed out, difference is exactly her own contribution.
        // Doesn't change any actual totals above, purely for the display
        // breakdown.
        if (provisoBonus > 0) {
          const withoutProviso = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, 0, tequilaLmdBonus, goldTier, f.level);
          const provisoGoldPerHour = goldPerHour - withoutProviso.goldPerHour;
          dailyGoldFromProvisoGreen += provisoGoldPerHour * realisticHours;
          dailyGoldFromProvisoRed += provisoGoldPerHour * idealHours;
        }
      }
    }
  }
  // LMD only comes from gold actually SOLD (Trading Post), not gold merely
  // produced (Factory) -- Factory output isn't automatically sold.
  const dailyGoldWorthGreen = dailyGoldSoldGreen * 500 + dailyExtraLmdFromOrdersGreen + dailyLmdFromPepeGreen;
  const dailyGoldWorthRed = dailyGoldSoldRed * 500 + dailyExtraLmdFromOrdersRed + dailyLmdFromPepeRed;


  return { rooms, roomDailyOutput, productivityFor, operatorByName, totalMonsterMeal, resourcePools, ccEffects, ccMoraleRelief, totalFelvine, dormitoryOperatorNames, dormitoryRecoveryByFacility, dailyExpGreen, dailyExpRed, dailyGoldMadeGreen, dailyGoldMadeRed, dailyGoldSoldGreen, dailyGoldFromProvisoGreen, dailyGoldFromProvisoRed, dailyGoldSoldRed, dailyExtraLmdFromOrdersGreen, dailyExtraLmdFromOrdersRed, dailyGoldWorthGreen, dailyGoldWorthRed };
}
