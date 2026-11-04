/**
 * What a skill needs before its number holds, as the base expert's tie-break order ranks it
 * (docs/development/base-design-notes.md): a skill that works alone comes before one that needs roommates,
 * before one that needs its room's level, before one that needs people or levels in other facilities, before
 * one that needs Control Center operators. The search breaks ties between equal scores by this, lowest first.
 */
import type { BaseSkill } from '@/lib/operators/operatorTypes';
import { skillEffectEntry, type BaseSkillEffectEntry, type SkillCondition, type SkillCountSource } from './baseSkillEffects';
import { activeBaseSkills } from './activeBaseSkills';
import type { BaseSkillSlots } from './baseSkillSlots';

export type DependencyClass = 'alone' | 'sameRoom' | 'facilityLevel' | 'otherFacility' | 'controlCenter';
export const DEPENDENCY_ORDER: readonly DependencyClass[] = ['alone', 'sameRoom', 'facilityLevel', 'otherFacility', 'controlCenter'];
export const dependencyRank = (c: DependencyClass) => DEPENDENCY_ORDER.indexOf(c);

function ofCount(source: SkillCountSource): DependencyClass {
  const head = source.split(':')[0];
  if (head.startsWith('room.')) return 'sameRoom';
  if (head === 'level.room') return 'facilityLevel';
  if (head.startsWith('cc.')) return 'controlCenter';
  return 'otherFacility';
}
function ofCondition(c: SkillCondition): DependencyClass {
  switch (c.type) {
    case 'roomHas': case 'roomHasRoster': case 'alone': return 'sameRoom';
    case 'ccHas': return 'controlCenter';
    case 'countAtLeast': case 'countAtMost': return ofCount(c.count);
    case 'all': return c.of.map(ofCondition).sort((a, b) => dependencyRank(b) - dependencyRank(a))[0] ?? 'alone';
    case 'product': case 'masteryLevel': case 'traineeBranch': case 'instantTrainingReady': case 'recipeFamily': case 'recipeCostIs': case 'recipeCostAtLeast': case 'targetIs': case 'targetInRoster': case 'recipientMoraleBelow': return 'alone';
    default: return 'otherFacility';
  }
}
/** Custom handlers by what they read: the room's window or staff, the base, or the Control Center. */
const CUSTOM_CLASS: Record<string, DependencyClass> = {
  ramp: 'alone', afterHours: 'alone', totterBlurryVision: 'alone', totterBlizzardOutside: 'alone',
  bubble: 'sameRoom', vermeil: 'sameRoom', waaiFu: 'sameRoom', snowsant: 'sameRoom', perOthersOrderLimit: 'sameRoom', jayeStreetEconomics: 'alone', jayeBasicNeeds: 'alone',
  tideObservation: 'otherFacility', abyssalGroupHunting: 'otherFacility', moraleGated: 'alone', mlynar: 'controlCenter',
  causality: 'alone', karma: 'alone', explosionArts: 'alone',
};

/** The most a skill's effects depend on: the highest class among its counts, conditions and handler. */
export function dependencyClassOf(entry: Pick<BaseSkillEffectEntry, 'effects' | 'custom'>): DependencyClass {
  const classes: DependencyClass[] = [];
  for (const e of entry.effects) {
    if (e.per) classes.push(ofCount(e.per.count));
    if (e.when) classes.push(ofCondition(e.when));
    if (e.suppressedBy) classes.push('sameRoom');
  }
  if (entry.custom) classes.push(CUSTOM_CLASS[entry.custom.handler] ?? 'otherFacility');
  return classes.sort((a, b) => dependencyRank(b) - dependencyRank(a))[0] ?? 'alone';
}

/** How much an operator's skills for a room depend on others: the rank of the highest class among them (0 alone). */
export function operatorDependency(op: Parameters<typeof activeBaseSkills>[0], roomLabel: string, eliteLevel: Parameters<typeof activeBaseSkills>[2], skillSlots?: BaseSkillSlots, level?: number): number {
  return Math.max(0, ...activeBaseSkills(op, roomLabel, eliteLevel, skillSlots, level).map((sk: BaseSkill) => { const entry = skillEffectEntry(sk); return entry ? dependencyRank(entry.dependency ?? dependencyClassOf(entry)) : 0; }));
}
