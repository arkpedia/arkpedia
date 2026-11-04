import type { BaseSkill } from '../../operators/operatorTypes';

/**
 * Parameterized base skills: what a skill does as typed effects, from the game's buff family (its buff id
 * without the trailing number) and the numbers in its text, so the calculator and the optimizer read values
 * rather than parse sentences. Families move here one at a time, each only once the typed value equals what the
 * calculator read from the text before (test-skill-effects). Skills of other families keep their handler or
 * text rules. scripts/audits/base-skill-table.ts lists every skill by family.
 */
export type SkillEffect = { kind: 'droneRecharge'; value: number };

/** A buff id's family: "power_rec_spd[010]" -> "power_rec_spd". */
export const buffFamily = (buffId: string | null | undefined) => (buffId ?? '').replace(/\[\d+\]$/, '');

const percents = (text: string) => [...text.matchAll(/([+-]\d+(?:\.\d+)?)%/g)].map(m => Number(m[1]) / 100);

/** Families with a typed form: from a skill's text numbers to its effects, or null when the text does not have
 *  the shape the family promises (then the skill keeps its text rules). */
const FAMILIES: Record<string, (skill: BaseSkill) => SkillEffect[] | null> = {
  // "increases the drone recovery rate by +10%"
  power_rec_spd: skill => { const p = percents(skill.description ?? ''); return p.length === 1 ? [{ kind: 'droneRecharge', value: p[0] }] : null; },
};

const remembered = new WeakMap<BaseSkill, SkillEffect[] | null>();
/** A skill's typed effects, or null when its family has no typed form yet. */
export function typedEffects(skill: BaseSkill): SkillEffect[] | null {
  if (remembered.has(skill)) return remembered.get(skill)!;
  const family = FAMILIES[buffFamily(skill.buffId)];
  const effects = family ? family(skill) : null;
  remembered.set(skill, effects);
  return effects;
}

/** The families typed so far. */
export const TYPED_FAMILIES = Object.keys(FAMILIES);
