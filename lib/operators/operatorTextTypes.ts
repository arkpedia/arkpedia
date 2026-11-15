import type { Operator as GameOperator, OperatorModule as GameModule, BaseSkillKeyword } from './operatorTypes';

/** Website presentation metadata; the shared importer schema stays game-only. */
export interface OperatorModule extends GameModule {
  translationCredit?: string;
}
export interface Operator extends GameOperator {
  translationCredit?: string;
  translationCredits?: Partial<Record<'review' | 'trait' | 'skills' | 'talents' | 'potential' | 'modules' | 'baseSkills' | 'tags', string>>;
  combatKeywords?: BaseSkillKeyword[];
  operatorTextVersion?: 1 | 2;
  modules?: OperatorModule[];
}
