/**
 * Evaluate one operator's base skill from the table against a few stated facts, for tests that hold a skill's
 * number directly (the handler tests did this with a hand-built context). Counts and conditions come from the
 * facts given; anything not stated is zero or false.
 */
import { getAllOperators } from '../../lib/operators/operators';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import { skillEffectEntry, type SkillCondition, type SkillCountSource } from '../../lib/base/baseSkillEffects';
import { evaluateSkill, type SkillContribution, type SkillScope } from '../../lib/base/skillEvaluation';
import { nonDefaultRecruitSlots } from '../../lib/base/baseResources';
import type { BaseRosters, BaseRosterName } from '../../lib/base/baseGroupRosters';
import type { FactoryProduct } from '../../lib/base/baseTypes';

export interface SkillFacts {
  rosters?: BaseRosters;
  /** Operators in the room, the skill's owner included. */
  roomNames?: string[];
  ccNames?: string[];
  placedNames?: string[];
  product?: FactoryProduct | null;
  target?: string | null;
  levels?: { room?: number; receptionRoom?: number; trainingRoom?: number; office?: number };
  resources?: Record<string, number>;
  /** Any count by its source, over the ones derived from the names above. */
  counts?: Partial<Record<SkillCountSource, number>>;
  holds?: (condition: SkillCondition) => boolean | undefined;
}

const operators = getAllOperators();
export function skillOf(operatorName: string, skillName: string) {
  const op = operators.find((o) => o.name === operatorName);
  const skill = op?.baseSkills?.find((s) => cleanSkillName(s.name) === skillName);
  if (!skill) throw new Error(`${operatorName} has no base skill ${skillName}`);
  const entry = skillEffectEntry(skill);
  if (!entry) throw new Error(`${operatorName} / ${skillName} (${skill.buffId}) has no table entry`);
  return { skill, entry };
}

export function scopeFrom(operatorName: string, facts: SkillFacts): SkillScope {
  const roomNames = facts.roomNames ?? [operatorName];
  const roster = (key: string) => facts.rosters?.[key as BaseRosterName] ?? new Set<string>();
  const count = (source: SkillCountSource): number => {
    if (facts.counts?.[source] !== undefined) return facts.counts[source]!;
    const at = source.indexOf(':');
    const head = at < 0 ? source : source.slice(0, at), rest = at < 0 ? '' : source.slice(at + 1);
    switch (head) {
      case 'room.operators': return roomNames.length;
      case 'room.others': return Math.max(0, roomNames.length - 1);
      case 'room.roster': case 'tp.roster': case 'factory.roster': return roomNames.filter((n) => roster(rest).has(n)).length;
      case 'room.rosterOthers': return roomNames.filter((n) => n !== operatorName && roster(rest).has(n)).length;
      case 'cc.roster': return (facts.ccNames ?? []).filter((n) => roster(rest).has(n)).length;
      case 'cc.rosterOthers': return (facts.ccNames ?? []).filter((n) => n !== operatorName && roster(rest).has(n)).length;
      case 'base.roster': return (facts.placedNames ?? []).filter((n) => roster(rest).has(n)).length;
      case 'level.room': return facts.levels?.room ?? 0;
      case 'level.receptionRoom': return facts.levels?.receptionRoom ?? 0;
      case 'level.trainingRoom': return facts.levels?.trainingRoom ?? 0;
      case 'office.extraSlots': return nonDefaultRecruitSlots(facts.levels?.office ?? 0);
      case 'resource': return facts.resources?.[rest] ?? 0;
      default: return 0;
    }
  };
  const holds = (c: SkillCondition): boolean => {
    const given = facts.holds?.(c);
    if (given !== undefined) return given;
    switch (c.type) {
      case 'roomHas': return [c.name, ...(c.forms ?? [])].some((n) => roomNames.includes(n));
      case 'roomHasRoster': return roomNames.some((n) => n !== operatorName && roster(c.roster).has(n));
      case 'alone': return roomNames.length === 1;
      case 'baseHas': return (facts.placedNames ?? []).includes(c.name);
      case 'ccHas': return (facts.ccNames ?? []).includes(c.name);
      case 'targetIs': return !!facts.target && [c.name, ...(c.forms ?? [])].includes(facts.target);
      case 'targetInRoster': return !!facts.target && roster(c.roster).has(facts.target);
      case 'product': return (facts.product ?? null) === c.product;
      case 'countAtLeast': return count(c.count) >= c.value;
      case 'countAtMost': return count(c.count) <= c.value;
      case 'recipientMoraleBelow': return true;
      default: return false;
    }
  };
  return { operatorName, roomNames, product: facts.product ?? null, target: facts.target, count, holds, active: () => false };
}

/** The skill's contribution under the facts. */
export function evalSkill(operatorName: string, skillName: string, facts: SkillFacts = {}): SkillContribution {
  const { entry } = skillOf(operatorName, skillName);
  return evaluateSkill(entry, scopeFrom(operatorName, facts));
}
