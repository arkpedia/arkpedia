import { getGlobalRecruitmentOperators } from '@/lib/gacha/recruitmentPool';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { Operator } from '@/lib/operators/operatorTypes';
import { RecruitableOperator } from '@/lib/gacha/recruitmentCalc';
import type { GameOperator } from './logic';
import { buildRecruitmentQuestions } from './recruitmentLogic';


function toGameOperator(operator: Operator): GameOperator {
  return {
    name: operator.name,
    aliases: [...new Set(Object.values(operator.otherLanguages || {}).filter((value) => value && value !== 'N/A'))],
  };
}

export function getRecruitmentGameData() {
  const recruitment = getGlobalRecruitmentOperators();
  const pool: RecruitableOperator[] = recruitment.map(({ name, rarity, tags, position, class: className }) =>
    ({ name, rarity, tags, position, class: className, isFuture: false }));
  return { operators: recruitment.map((operator) => ({ ...toGameOperator(operator), icon: getOperatorIconPath(operator) })), questions: buildRecruitmentQuestions(pool) };
}
