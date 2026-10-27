import type { BaseSkillKeyword, Operator, OperatorModule } from '@/lib/operators/operatorTypes';
import type { StatValues } from '@/lib/operators/operatorStats';
import { getSkillList } from '@/lib/operators/operatorTypes';
import { baseSkillDisplayName, getBaseSkillIconPath, getSkillIconPath, talentDisplayName } from '@/lib/operators/operatorIconPaths';
import { traitPhases, type TraitPhase } from '@/lib/operators/operatorTrait';
import { getBaseStats } from '@/lib/operators/operatorStats';
import type { Owned } from '@/lib/planner/roster';

export type OperatorPreviewSource = Pick<Operator, 'name' | 'rarity' | 'class' | 'branch' | 'position' | 'tags' | 'trait' | 'stats' | 'talents' | 'skills' | 'modules' | 'baseSkills'>;

/** Public reference data only. Account builds stay in the reader's browser. */
export function operatorPreviewSource(operator: Operator): OperatorPreviewSource {
  const { name, rarity, class: className, branch, position, tags, trait, stats, talents, baseSkills } = operator;
  return { name, rarity, class: className, branch, position, tags, trait, stats, talents, baseSkills,
    skills: getSkillList(operator).map(({ name, icon, recoveryType, activationType, duration, levels }) => ({ name, icon, recoveryType, activationType, duration, levels })),
    modules: operator.modules?.map(({ name, type, stages }) => ({ name, type,
      stages: stages.map(({ stage, attributesIncreased, effectLabel, effectText }) => ({ stage, attributesIncreased, effectLabel, effectText })),
    })),
  };
}

function unlockedAt(stage: string | null, build: Owned): boolean {
  const elite = Number(stage?.match(/(?:Elite\s*|E)([012])/i)?.[1] ?? 0);
  const level = Number(stage?.match(/(?:Lv\.?|Level)\s*(\d+)/i)?.[1] ?? 1);
  return build.elite > elite || (build.elite === elite && build.level >= level);
}

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
export function buildGachaOperatorPreview(operator: OperatorPreviewSource, build?: Owned): GachaOperatorPreview {
  const phase = build ? operator.stats?.phases.find(phase => phase.elite === build.elite) : operator.stats?.phases.at(-1);
  const upgradeModules = operator.modules?.filter(module => module.type === 'Upgrade') ?? [];

  return {
    name: operator.name,
    rarity: operator.rarity,
    className: operator.class,
    branch: operator.branch,
    position: operator.position,
    tags: operator.tags ?? [],
    traitPhases: traitPhases(operator.trait).filter(row => !build || unlockedAt(row.stage, build)),
    stats: phase ? {
      elite: phase.elite,
      level: build ? Math.max(phase.minLevel, Math.min(phase.maxLevel, build.level)) : phase.maxLevel,
      values: build ? getBaseStats(phase, build.level) : phase.max,
      trust: operator.stats?.trust ?? { hp: 0, atk: 0, def: 0 },
    } : null,
    talents: (operator.talents ?? []).map((talent) => {
      const rows = talent.rows.filter(entry => !build || (unlockedAt(entry.stage, build)
        && (!entry.potential || (build.potential !== undefined && Number(entry.potential.match(/\d+/)?.[0] ?? 99) <= build.potential))));
      const row = build ? [...rows].reverse().find(entry => entry.description)
        : [...rows].reverse().find((entry) => !entry.potential && entry.description)
          ?? [...rows].reverse().find((entry) => entry.description);
      return { name: talentDisplayName(talent.name) || 'Talent', stage: row?.stage ?? null, description: row?.description ?? '' };
    }).filter((talent) => talent.description),
    skills: getSkillList(operator).filter((_, index) => !build || index <= build.elite).map((skill, index) => {
      const mastery = build?.masteries[index] ?? 0;
      const level = build ? skill.levels.find(entry => mastery ? entry.mastery === mastery : !entry.mastery && entry.level === build.skillLevel)
        : [...skill.levels].reverse().find((entry) => entry.mastery === 3)
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
    modules: (operator.modules ?? []).filter(module => !build || module.type === 'Original' || build.modules?.[upgradeModules.indexOf(module)] !== undefined).map((module) => ({
      name: module.name || (module.type === 'Original' ? 'Original' : 'Module'),
      type: module.type,
      stages: (build && module.type === 'Upgrade' ? module.stages.slice(0, (build.modules?.[upgradeModules.indexOf(module)] ?? -1) + 1) : module.stages).map((stage) => ({
        stage: stage.stage || 'Stage 1',
        attributes: stage.attributesIncreased,
        label: stage.effectLabel,
        effect: stage.effectText,
      })),
    })),
    baseSkills: (operator.baseSkills ?? []).filter(skill => !build || (skill.phase !== undefined
      ? build.elite > skill.phase || (build.elite === skill.phase && build.level >= (skill.level ?? 1))
      : unlockedAt(skill.eliteLevel, build))).map((skill, index) => ({
      name: baseSkillDisplayName(skill) || `Base Skill ${index + 1}`,
      icon: getBaseSkillIconPath(operator.name, skill),
      facility: skill.facility,
      unlock: skill.eliteLevel,
      description: skill.description ?? '',
      keywords: skill.keywords ?? [],
    })).filter((skill) => skill.description),
  };
}
