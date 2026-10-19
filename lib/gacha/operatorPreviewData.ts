import type { BaseSkillKeyword, Operator, OperatorModule } from '@/lib/operators/operatorTypes';
import type { StatValues } from '@/lib/operators/operatorStats';
import { getSkillList } from '@/lib/operators/operatorTypes';
import { baseSkillDisplayName, getBaseSkillIconPath, getSkillIconPath, talentDisplayName } from '@/lib/operators/operatorIconPaths';
import { traitPhases, type TraitPhase } from '@/lib/operators/operatorTrait';

export interface GachaOperatorPreview {
  name: string;
  rarity: number | null;
  className: string | null;
  branch: string | null;
  position: string | null;
  tags: string[];
  /** Every promotion's trait where it changes (traitPhases), not the last one alone. Named apart
   *  from the string `trait` it replaces, so a page loaded before a deploy reads no trait from a
   *  newer response instead of rendering this list as text. */
  traitPhases: TraitPhase[];
  stats: { elite: number; level: number; values: StatValues; trust: { hp: number; atk: number; def: number } } | null;
  talents: { name: string; stage: string | null; description: string }[];
  skills: { name: string; icon: string | null; rank: string; recovery: string | null; activation: string | null; initialSp: number | string | null; spCost: number | string | null; duration: number | string | null; description: string }[];
  modules: { name: string; type: OperatorModule['type']; stages: { stage: string; attributes: string | null; label: string | null; effect: string | null }[] }[];
  baseSkills: { name: string; icon: string | null; facility: string | null; unlock: string | null; description: string; keywords: BaseSkillKeyword[] }[];
}

/** Keep the pop-up small: fetch the selected operator only, and send its final
 * available progression rather than full level tables or material costs. */
export function buildGachaOperatorPreview(operator: Operator): GachaOperatorPreview {
  const phase = operator.stats?.phases.at(-1);

  return {
    name: operator.name,
    rarity: operator.rarity,
    className: operator.class,
    branch: operator.branch,
    position: operator.position,
    tags: operator.tags ?? [],
    traitPhases: traitPhases(operator.trait),
    stats: phase ? {
      elite: phase.elite,
      level: phase.maxLevel,
      values: phase.max,
      trust: operator.stats?.trust ?? { hp: 0, atk: 0, def: 0 },
    } : null,
    talents: (operator.talents ?? []).map((talent) => {
      const row = [...talent.rows].reverse().find((entry) => !entry.potential && entry.description)
        ?? [...talent.rows].reverse().find((entry) => entry.description);
      return { name: talentDisplayName(talent.name) || 'Talent', stage: row?.stage ?? null, description: row?.description ?? '' };
    }).filter((talent) => talent.description),
    skills: getSkillList(operator).map((skill, index) => {
      const level = [...skill.levels].reverse().find((entry) => entry.mastery === 3)
        ?? [...skill.levels].reverse().find((entry) => entry.description);
      return {
        name: skill.name || `Skill ${index + 1}`,
        icon: skill.icon || getSkillIconPath(operator.name, skill.name),
        rank: level?.mastery ? `M${level.mastery}` : level?.level ? `Lv ${level.level}` : '',
        recovery: skill.recoveryType,
        activation: skill.activationType,
        initialSp: level?.initialSp ?? null,
        spCost: level?.spCost ?? null,
        duration: level?.duration ?? null,
        description: level?.description ?? '',
      };
    }),
    modules: (operator.modules ?? []).map((module) => ({
      name: module.name || (module.type === 'Original' ? 'Original' : 'Module'),
      type: module.type,
      stages: module.stages.map((stage) => ({
        stage: stage.stage || 'Stage 1',
        attributes: stage.attributesIncreased,
        label: stage.effectLabel,
        effect: stage.effectText,
      })),
    })),
    baseSkills: (operator.baseSkills ?? []).map((skill, index) => ({
      name: baseSkillDisplayName(skill) || `Base Skill ${index + 1}`,
      icon: getBaseSkillIconPath(operator.name, skill),
      facility: skill.facility,
      unlock: skill.eliteLevel,
      description: skill.description ?? '',
      keywords: skill.keywords ?? [],
    })).filter((skill) => skill.description),
  };
}
