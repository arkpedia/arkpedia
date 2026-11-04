/**
 * What one base skill contributes on its own, read from the skill table (lib/base/baseSkillEffects.ts) where its
 * entry is flat, else from its description text through the calculator's patterns (lib/base/baseProductivity.ts).
 * `source` 'text' forces the text path: scripts/tests/test-base-skill-parity.ts runs the calculator both ways and
 * holds every room's numbers equal. Every reader here is for the plain part of a skill; a skill with a handler
 * never reaches them.
 */
import type { BaseSkill } from '@/lib/operators/operatorTypes';
import type { FactoryProduct } from './baseTypes';
import { skillEffectEntry, type BaseSkillEffectEntry, type SkillEffect } from './baseSkillEffects';
import {
  factoryYellowContribution, tradingPostYellowContribution, calcCapacity, calcOrderLimit, calcClueSpeed, calcOffice, calcDroneRate,
  calcMorale, calcControlCenterEffects, clueCollectionBonusFrom,
} from './baseProductivity';

export type SkillSource = 'text' | 'table';
export type ReadableSkill = Pick<BaseSkill, 'buffId' | 'description'>;

/** The flat table entry of a skill, when the table path reads it. */
function flat(skill: ReadableSkill, source: SkillSource): BaseSkillEffectEntry | undefined {
  if (source === 'text') return undefined;
  const entry = skillEffectEntry(skill);
  return entry?.shape === 'flat' ? entry : undefined;
}
const sum = (entry: BaseSkillEffectEntry, pick: (effect: SkillEffect) => boolean) => entry.effects.reduce((n, e) => n + (pick(e) ? e.value : 0), 0);
const text = (skill: ReadableSkill) => skill.description ?? null;

/** Factory productivity for the product being made (0 for a skill gated on another product). */
export function productivityOf(skill: ReadableSkill, product: FactoryProduct | null, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'productivity' && (!e.product || e.product === product)) : factoryYellowContribution(text(skill), product);
}
export function orderEfficiencyOf(skill: ReadableSkill, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'orderEfficiency') : tradingPostYellowContribution(text(skill));
}
export function capacityOf(skill: ReadableSkill, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'capacity' && !e.product) : calcCapacity([text(skill)], 3).adjustment;
}
export function orderLimitOf(skill: ReadableSkill, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'orderLimit') : calcOrderLimit([text(skill)], 3).adjustment;
}
export function clueSpeedOf(skill: ReadableSkill, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'clueSpeed') : calcClueSpeed([text(skill)]);
}
export function hrSpeedOf(skill: ReadableSkill, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'hrSpeed') : calcOffice([text(skill)]).speed;
}
export function droneRateOf(skill: ReadableSkill, source: SkillSource): number {
  const entry = flat(skill, source);
  return entry ? sum(entry, (e) => e.kind === 'droneRate') : calcDroneRate([text(skill)]);
}
/** Morale consumed per hour: the operator's own (`self`), and everyone's in the room (`all`). */
export function moraleOf(skill: ReadableSkill, source: SkillSource): { self: number; all: number } {
  const entry = flat(skill, source);
  if (entry) return { self: sum(entry, (e) => e.kind === 'selfMorale' && !e.product), all: sum(entry, (e) => e.kind === 'roomMorale') };
  const m = calcMorale(1, [{ operatorName: 'x', description: text(skill) }]);
  return { self: m.selfYellow.x ?? 0, all: m.allOperatorsYellow };
}
/** A Control Center skill's candidates for the highest-only pools and its stacking own-room Morale. */
export function controlCenterOf(skill: ReadableSkill, source: SkillSource): { orderEfficiency: number; factory: number; clue: number; ccMorale: number } {
  const entry = flat(skill, source);
  if (entry) return { orderEfficiency: sum(entry, (e) => e.kind === 'ccOrderEfficiency'), factory: sum(entry, (e) => e.kind === 'ccFactoryProductivity'), clue: sum(entry, (e) => e.kind === 'ccClueSpeed'), ccMorale: sum(entry, (e) => e.kind === 'ccMorale') };
  const t = text(skill);
  const r = calcControlCenterEffects([t]);
  return { orderEfficiency: r.tradingPostBonus, factory: r.factoryBonus, clue: clueCollectionBonusFrom(t), ccMorale: r.ccMoraleBonus };
}
/** A Dormitory skill without a handler: recovery for the operator (`self`) and for everyone in the room (`all`). */
export function dormitoryRecoveryOf(skill: ReadableSkill, source: SkillSource): { self: number; all: number } {
  const entry = flat(skill, source);
  if (entry) return { self: sum(entry, (e) => e.kind === 'recoverySelf'), all: sum(entry, (e) => e.kind === 'recoveryAll') };
  const t = skill.description ?? '';
  const value = Number(t.match(/(?:restores?|recover(?:s|y))[^+]*[+]?(\d+(?:\.\d+)?)/i)?.[1] ?? 0);
  return /all (?:other )?operators/i.test(t) ? { self: 0, all: value } : { self: value, all: 0 };
}
