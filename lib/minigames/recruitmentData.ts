import { getGlobalRecruitmentOperators } from '@/lib/gacha/recruitmentPool';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { Operator } from '@/lib/operators/operatorTypes';
import { RecruitableOperator } from '@/lib/gacha/recruitmentCalc';
import type { GameOperator } from './logic';
import { buildRecruitmentQuestions, type RecruitmentGameOperator } from './recruitmentLogic';


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
  const operators: RecruitmentGameOperator[] = recruitment.map((operator) => {
    if (!operator.rarity) throw new Error(`recruitment guesser: ${operator.name} has no rarity`);
    return { ...toGameOperator(operator), icon: getOperatorIconPath(operator), rarity: operator.rarity };
  });
  return { operators, questions: buildRecruitmentQuestions(pool) };
}
