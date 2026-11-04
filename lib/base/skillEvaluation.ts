/**
 * One base skill, evaluated: its table entry (lib/base/baseSkillEffects.ts) against what the calculator knows
 * about the operator's room and the base (`SkillScope`), as the numbers the room sums. The data shapes are
 * computed here; a `custom` entry comes back with its handler name and parameters for the room to run at the
 * right stage (lib/base/customSkillHandlers.ts), since those read what the rest of the room provides.
 */
import type { BaseSkillEffectEntry, SkillCondition, SkillCountSource, SkillEffect } from './baseSkillEffects';
import { countedValue } from './baseSkillEffects';
import type { FactoryProduct } from './baseTypes';

export interface SkillScope {
  operatorName: string;
  /** The working operators in the room the skill is evaluated for (the operator's own, or a Control Center
   *  effect's target room), in slot order. */
  roomNames: readonly string[];
  /** The Factory's product, where the room is a Factory. */
  product: FactoryProduct | null;
  /** A single-target Dormitory skill's chosen roommate. */
  target?: string | null;
  count(source: SkillCountSource): number;
  holds(condition: SkillCondition): boolean;
  /** Whether a skill (by buff id) is active in the operator's room. */
  active(buffId: string): boolean;
}

export interface SkillContribution {
  entry: BaseSkillEffectEntry;
  productivity: number; capacity: number; orderEfficiency: number; orderLimit: number; droneRate: number; clueSpeed: number; hrSpeed: number;
  /** Morale consumed per hour: the operator's own, everyone's in the room, and named co-workers'. */
  selfMorale: number; roomMorale: number; targetMorale: { name: string; amount: number }[];
  recovery: { self: number; all: number; others: number; single: number; exclusive?: number; distributed?: number; conditionalGroup?: { below: number; amount: number } };
  cc: { morale: number; factory: number; orderEfficiency: number; clue: number; training: number; dormRecovery: number; dormEliteRecovery: number; otherRoomsRecovery: number; hrSpeed: number; preciousMetal: number; receptionClue: number };
  /** For the scope's target room (a Control Center effect evaluated per Trading Post or Factory). */
  perTradingPostOrderEfficiency: number; perTradingPostOrderLimit: number; perFactoryProductivity: number;
  /** Order limit for the Trading Post a named operator works in. */
  tradingPostOfOperator: { name: string; amount: number }[];
  /** Productivity for the Factory a named operator works in. */
  factoryOfOperator: { name: string; amount: number }[];
  powerPlantCount: number;
  /** Base-wide resource generation by pool, and the conversions this skill performs (value 1). */
  resources: Record<string, number>;
  overridesOthers: boolean; exemptFromOverride: boolean;
  custom?: { handler: string; params: Record<string, number> };
  /** The counted and conditional parts, spelled out for the breakdown panel. */
  formula?: string;
}

const RESOURCE_CONVERSIONS = new Set(['perceptionFromMeasure', 'perceptionFromDreamland', 'perceptionFromMemoryFragments', 'soundlessResonanceFromPerception', 'chainOfThoughtFromPerception', 'witchcraftCrystalFromWorldlyPlight']);

export function emptyContribution(entry: BaseSkillEffectEntry): SkillContribution {
  return {
    entry, productivity: 0, capacity: 0, orderEfficiency: 0, orderLimit: 0, droneRate: 0, clueSpeed: 0, hrSpeed: 0,
    selfMorale: 0, roomMorale: 0, targetMorale: [],
    recovery: { self: 0, all: 0, others: 0, single: 0 },
    cc: { morale: 0, factory: 0, orderEfficiency: 0, clue: 0, training: 0, dormRecovery: 0, dormEliteRecovery: 0, otherRoomsRecovery: 0, hrSpeed: 0, preciousMetal: 0, receptionClue: 0 },
    perTradingPostOrderEfficiency: 0, perTradingPostOrderLimit: 0, perFactoryProductivity: 0,
    tradingPostOfOperator: [], factoryOfOperator: [], powerPlantCount: 0, resources: {},
    overridesOthers: !!entry.interaction?.overridesOthers, exemptFromOverride: !!entry.interaction?.exemptFromOverride,
    ...(entry.custom ? { custom: { handler: entry.custom.handler, params: entry.custom.params ?? {} } } : {}),
  };
}

const describeCount = (source: SkillCountSource) => source.replace(/^(room|base|cc|tp|factory|reception|level|office|resource|otherPowerPlants|powerPlants|tradingPosts|factories)\./, '').replace(/:/, ' ');
const pct = (n: number) => `${(n * 100).toFixed(n * 100 % 1 ? 2 : 0)}%`;
const RATE_KINDS = new Set<SkillEffect['kind']>(['productivity', 'orderEfficiency', 'droneRate', 'clueSpeed', 'hrSpeed', 'ccFactoryProductivity', 'ccOrderEfficiency', 'ccClueSpeed', 'perTradingPostOrderEfficiency', 'perFactoryProductivity', 'ccHrSpeed', 'ccReceptionClueSpeed']);

/** The entry's data shapes against the scope. */
export function evaluateSkill(entry: BaseSkillEffectEntry, scope: SkillScope): SkillContribution {
  const out = emptyContribution(entry);
  const formulas: string[] = [];
  for (const effect of entry.effects) {
    if (effect.product && scope.product !== effect.product) continue;
    if (effect.when && !holdsFor(effect.when, scope, out)) continue;
    if (effect.suppressedBy && scope.active(effect.suppressedBy.buffId) && (!effect.suppressedBy.when || scope.holds(effect.suppressedBy.when))) continue;
    const count = effect.per ? scope.count(effect.per.count) : 0;
    const value = countedValue(effect, count);
    if (effect.per || effect.when) {
      const shown = RATE_KINDS.has(effect.kind) ? pct : (n: number) => `${n}`;
      formulas.push(effect.per
        ? `${shown(effect.value)} + ${shown(effect.per.amount)} × ${describeCount(effect.per.count)}(${count}${effect.per.step && effect.per.step > 1 ? ` ÷ ${effect.per.step}` : ''}${effect.per.maxCount !== undefined ? `, at most ${effect.per.maxCount}` : ''})${effect.cap !== undefined ? `, at most ${shown(effect.cap)}` : ''} = ${shown(value)}`
        : `${shown(value)} (${describeCondition(effect.when!)})`);
    }
    add(out, effect, value, scope);
  }
  if (formulas.length) out.formula = formulas.join('; ');
  return out;
}

function holdsFor(condition: SkillCondition, scope: SkillScope, out: SkillContribution): boolean {
  // A group recovery's recipient condition is carried to the room, which knows each recipient's Morale.
  if (condition.type === 'recipientMoraleBelow') return true;
  return scope.holds(condition);
}

function add(out: SkillContribution, effect: SkillEffect, value: number, scope: SkillScope) {
  switch (effect.kind) {
    case 'productivity': out.productivity += value; break;
    case 'capacity': out.capacity += value; break;
    case 'orderEfficiency': out.orderEfficiency += value; break;
    case 'orderLimit': out.orderLimit += value; break;
    case 'droneRate': out.droneRate += value; break;
    case 'clueSpeed': out.clueSpeed += value; break;
    case 'hrSpeed': out.hrSpeed += value; break;
    case 'selfMorale': out.selfMorale += value; break;
    case 'roomMorale': out.roomMorale += value; break;
    case 'targetMorale':
      if (effect.name === '*others') for (const name of scope.roomNames) { if (name !== scope.operatorName) out.targetMorale.push({ name, amount: value }); }
      else if (effect.name) out.targetMorale.push({ name: effect.name, amount: value });
      break;
    case 'recoverySelf': out.recovery.self += value; break;
    case 'recoveryAll':
      if (effect.when?.type === 'recipientMoraleBelow') out.recovery.conditionalGroup = { below: effect.when.value, amount: (out.recovery.conditionalGroup?.amount ?? 0) + value };
      else out.recovery.all += value;
      break;
    case 'recoveryOthers': out.recovery.others += value; break;
    case 'recoverySingle': out.recovery.single += value; break;
    case 'recoveryExclusive': out.recovery.exclusive = (out.recovery.exclusive ?? 0) + value; break;
    case 'recoveryDistributed': out.recovery.distributed = (out.recovery.distributed ?? 0) + value; break;
    case 'ccMorale': out.cc.morale += value; break;
    case 'ccFactoryProductivity': out.cc.factory += value; break;
    case 'ccOrderEfficiency': out.cc.orderEfficiency += value; break;
    case 'ccClueSpeed': out.cc.clue += value; break;
    case 'ccTrainingSpeed': out.cc.training += value; break;
    case 'ccDormRecovery': out.cc.dormRecovery += value; break;
    case 'ccDormEliteRecovery': out.cc.dormEliteRecovery += value; break;
    case 'ccOtherRoomsRecovery': out.cc.otherRoomsRecovery += value; break;
    case 'ccHrSpeed': out.cc.hrSpeed += value; break;
    case 'ccPreciousMetalProductivity': out.cc.preciousMetal += value; break;
    case 'ccReceptionClueSpeed': out.cc.receptionClue += value; break;
    case 'perTradingPostOrderEfficiency': out.perTradingPostOrderEfficiency += value; break;
    case 'perTradingPostOrderLimit':
      if (effect.name) out.tradingPostOfOperator.push({ name: effect.name, amount: value });
      else out.perTradingPostOrderLimit += value;
      break;
    case 'perFactoryProductivity': out.perFactoryProductivity += value; break;
    case 'factoryOfOperator': if (effect.name) out.factoryOfOperator.push({ name: effect.name, amount: value }); break;
    case 'powerPlantCount': out.powerPlantCount += value; break;
    case 'resource':
      if (effect.name) out.resources[effect.name] = (out.resources[effect.name] ?? 0) + (RESOURCE_CONVERSIONS.has(effect.name) ? 1 : value);
      break;
    // Training Room and Workshop numbers are read by their own rule modules.
    case 'trainingSpeed': case 'trainingMorale': case 'byproductChance': case 'recipeMorale': case 'recycleEfficiency': break;
  }
}

export function describeCondition(condition: SkillCondition): string {
  switch (condition.type) {
    case 'roomHas': return `with ${condition.name} in the room`;
    case 'roomHasRoster': return `with a ${rosterLabel(condition.roster)} operator in the room`;
    case 'alone': return 'alone in the room';
    case 'baseHas': return `with ${condition.name} in the base`;
    case 'ccHas': return `with ${condition.name} in the Control Center`;
    case 'inTradingPost': return `with ${condition.name} in a Trading Post`;
    case 'inFactory': return `with ${condition.name} in a Factory`;
    case 'inPowerPlant': return `with ${condition.name} in a Power Plant`;
    case 'inDormitory': return `with ${condition.name} in a Dormitory`;
    case 'inReceptionRoom': return `with ${condition.name} in the Reception Room`;
    case 'trainerIs': return `with ${condition.name} as the trainer`;
    case 'clueExchange': return 'in Clue Exchange';
    case 'officeHrBelow': return `Office HR speed under ${condition.value}%`;
    case 'influenceAtLeastTerritory': return 'Influence at least Territory';
    case 'territoryAboveInfluence': return 'Territory above Influence';
    case 'countAtLeast': return `${describeCount(condition.count)} at least ${condition.value}`;
    case 'countAtMost': return `${describeCount(condition.count)} at most ${condition.value}`;
    case 'targetIs': return `target is ${condition.name}`;
    case 'targetInRoster': return `target is a ${rosterLabel(condition.roster)} operator`;
    case 'recipientMoraleBelow': return `recipient below ${condition.value} Morale`;
    case 'product': return `making ${condition.product}`;
    case 'masteryLevel': return `training to Specialization ${condition.value}`;
    case 'traineeBranch': return `trainee branch ${condition.name}`;
  }
}
const rosterLabel = (roster: string) => roster.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
