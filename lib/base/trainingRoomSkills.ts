import type { BaseSkill } from '../operators/operatorTypes';
import type { BaseRosters } from './baseGroupRosters';

export const TRAINING_CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'] as const;
export interface TrainingTarget {
  operatorName?: string;
  class: string;
  branch: string;
  mastery: number;
  /** The next mastery was STARTED with a prepared Irene/Logos reduction. */
  timeReductionActive: boolean;
  instantTrainingReady: boolean;
}
export interface TrainingContext {
  target: TrainingTarget;
  allPlacedNames: string[];
  rosters: BaseRosters;
  worldlyPlight: number;
}
export interface TrainingSkillResult { speed: number; morale: number; timeMultiplier: number; note?: string }

export function canTrainMastery(operator: { rarity?: number | null }): boolean {
  return typeof operator.rarity === 'number' && operator.rarity >= 4;
}

/** Named trainees use current roster traits, even when a preset cached older ones. */
export function resolveTrainingTarget(target: TrainingTarget, operators: readonly { name: string; rarity?: number | null; class?: string | null; branch?: string | null }[]): TrainingTarget {
  const trainee = operators.find(op => op.name === target.operatorName);
  if (!trainee) return target;
  // Old presets must not place operators without mastery into the trainee slot.
  if (trainee.rarity !== undefined && !canTrainMastery(trainee)) return { ...target, operatorName: '', timeReductionActive: false, instantTrainingReady: false };
  const className = trainee.class ?? target.class;
  const branch = trainee.branch ?? target.branch;
  return className === target.class && branch === target.branch ? target : { ...target, class: className, branch };
}

/** Active skills only: the slot-chain resolver must run before this function. */
export function trainingSkillContribution(operatorName: string, skill: BaseSkill, ctx: TrainingContext): TrainingSkillResult {
  const text = skill.description ?? '';
  const name = (skill.name ?? '').split('Replaces')[0].trim();
  const result: TrainingSkillResult = { speed: 0, morale: 0, timeMultiplier: 1 };
  const count = (members: ReadonlySet<string>, cap: number) => Math.min(cap, new Set(ctx.allPlacedNames.filter(n => members.has(n))).size);
  if (name === 'Tactic Guidance: Defense') result.speed = 0.1 * count(ctx.rosters.R6_DEFENDING, 4);
  else if (name === 'Tactic Guidance: Offense') result.speed = 0.1 * count(ctx.rosters.R6_ATTACKING, 4);
  else if (name === 'Snowpriest Candidate') result.speed = 0.1 * count(ctx.rosters.SAMI, 3);
  else if (name === 'Knight Training' || name === 'Noble Creed') result.speed = 0.05 * count(ctx.rosters.KNIGHTS, name === 'Knight Training' ? 5 : 8);
  else if (name === 'Siracusan Revelry') result.speed = 0.05 * Math.min(7, new Set(ctx.allPlacedNames.filter(n => ctx.rosters.SIRACUSA.has(n))).size);
  else if (operatorName === 'Ulpianus' && name.includes('Methods Should Be Effective')) { result.speed = 0.1 * count(ctx.rosters.ABYSSAL_HUNTERS, 5); result.morale = 1; }
  else if (name === 'Sharing the Joy') { result.speed = 0.01 * ctx.worldlyPlight; result.morale = 1; }
  else if (name === 'Think Before Acting') {
    result.timeMultiplier = ctx.target.instantTrainingReady && ctx.target.class === 'Guard' && ctx.target.mastery === 1 ? 0 : 1;
    result.note = 'Consumes accumulated Martial Arts to finish a Guard M1 immediately when the counter is ready.';
  } else if (/next training time/i.test(text)) {
    result.note = 'The next mastery must start after this trainer has trained the same trainee for 5 consecutive hours. Leaving before it starts clears the prepared reduction.';
  } else {
    const classes = TRAINING_CLASSES.filter(c => new RegExp(`\\b${c}\\b`).test((/training speed/i.test(text) ? text.split(/;|\bif\b/i)[0] : text)));
    if (classes.length && !classes.includes(ctx.target.class as typeof TRAINING_CLASSES[number])) return result;
    const stage = text.match(/Specialization Level\s*(\d)/i);
    const stageMatches = !stage || Number(stage[1]) === ctx.target.mastery;
    const branch = text.match(/Job Branch is\s+([^,;.]+?)(?:\s*,|\s+training speed|\s*;|\s*$)/i)?.[1]?.trim();
    const branchMatches = !branch || branch.toLowerCase() === ctx.target.branch.toLowerCase();
    if (/morale consumed/i.test(text) && !/training speed/i.test(text)) {
      result.morale = stageMatches ? Number(text.match(/(?:increased by\s*)?([+-]\d+(?:\.\d+)?)/)?.[1] ?? 0) : 0;
    } else if (/training speed/i.test(text)) {
      const percentages = [...text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(m => Number(m[1]) / 100);
      if (percentages.length > 1) result.speed = percentages[0] + (stageMatches && branchMatches ? percentages[1] : 0);
      else if (stageMatches && branchMatches) result.speed = percentages[0] ?? 0;
      if (/morale consumed/i.test(text) && stageMatches) result.morale = Number(text.match(/morale consumed per hour\s*([+-]\d+(?:\.\d+)?)/i)?.[1] ?? 0);
    }
  }
  return result;
}

export function trainingResult(operatorName: string, skills: BaseSkill[], ctx: TrainingContext, controlCenterBonus: number) {
  const contributions = skills.map(skill => ({ skill, ...trainingSkillContribution(operatorName, skill, ctx) }));
  // building_data.trainingData.basicSpeedBuff: every trainer supplies +5%.
  const speed = 1.05 + controlCenterBonus + contributions.reduce((sum, value) => sum + value.speed, 0);
  const timeMultiplier = Math.min(ctx.target.timeReductionActive ? 0.5 : 1, ...contributions.map(value => value.timeMultiplier));
  return { speed, morale: contributions.reduce((sum, value) => sum + value.morale, 0), hours: 8 * ctx.target.mastery * timeMultiplier / speed, contributions };
}
