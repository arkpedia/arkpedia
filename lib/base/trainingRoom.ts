/**
 * The Training Room: the trainee (`TrainingTarget`) and the trainer's skills from the table
 * (lib/base/baseSkillEffects.ts), evaluated by the calculator against the trainee's class, branch and
 * mastery, summed here into a speed, a Morale cost and the hours a mastery takes.
 */
import type { SkillContribution } from './skillEvaluation';

export const TRAINING_CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'] as const;
/** The game's class codes, as the table's training `targets` name them. */
export const TRAINING_CLASS_CODES: Record<string, string> = { Vanguard: 'PIONEER', Guard: 'WARRIOR', Defender: 'TANK', Sniper: 'SNIPER', Caster: 'CASTER', Medic: 'MEDIC', Supporter: 'SUPPORT', Specialist: 'SPECIAL' };

export interface TrainingTarget {
  operatorName?: string;
  class: string;
  branch: string;
  mastery: number;
  /** The next mastery was STARTED with a prepared Irene/Logos reduction. */
  timeReductionActive: boolean;
  instantTrainingReady: boolean;
}
export interface TrainingOutcome { speed: number; morale: number; hours: number; timeMultiplier: number }

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

/** The trainer's evaluated skills as the room's numbers. building_data.trainingData.basicSpeedBuff: every trainer
 *  supplies +5%; the Control Center's strongest training bonus adds to that. */
export function trainingOutcome(contributions: readonly SkillContribution[], target: TrainingTarget, controlCenterBonus: number): TrainingOutcome {
  const speed = 1.05 + controlCenterBonus + contributions.reduce((sum, c) => sum + c.trainingSpeed, 0);
  const timeMultiplier = Math.min(target.timeReductionActive ? 0.5 : 1, ...contributions.map(c => c.trainingTimeFactor));
  return { speed, morale: contributions.reduce((sum, c) => sum + c.trainingMorale, 0), hours: 8 * target.mastery * timeMultiplier / speed, timeMultiplier };
}
