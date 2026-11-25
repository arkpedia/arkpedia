import { getGlobalRecruitmentOperators } from '@/lib/gacha/recruitmentPool';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { RecruitableOperator } from '@/lib/gacha/recruitmentCalc';
import { toGameOperator } from './logic';
import { buildRecruitmentQuestions } from './recruitmentLogic';

export function getRecruitmentGameData() {
  const recruitment = getGlobalRecruitmentOperators();
  const pool: RecruitableOperator[] = recruitment.map(({ name, rarity, tags, position, class: className }) =>
    ({ name, rarity, tags, position, class: className, isFuture: false }));
  return { operators: recruitment.map((operator) => ({ ...toGameOperator(operator), icon: getOperatorIconPath(operator) })), questions: buildRecruitmentQuestions(pool) };
}
