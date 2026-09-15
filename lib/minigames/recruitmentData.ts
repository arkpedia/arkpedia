import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { parseDate } from '@/lib/operators/operatorReleaseDates';
import { Operator } from '@/lib/operators/operatorTypes';
import { RecruitableOperator } from '@/lib/gacha/recruitmentCalc';
import type { GameOperator } from './logic';
import { buildRecruitmentQuestions } from './recruitmentLogic';


function releasedOperators(now = new Date()): Operator[] {
  return getAllOperators().filter((operator) => {
    const release = parseDate(operator.characterInfo?.['Release Date'] || '');
    return !operator.isFuture && Boolean(release && release <= now);
  });
}
function toGameOperator(operator: Operator): GameOperator {
  return {
    name: operator.name,
    aliases: [...new Set(Object.values(operator.otherLanguages || {}).filter((value) => value && value !== 'N/A'))],
  };
}

export function getRecruitmentGameData(now = new Date()) {
  const recruitment = releasedOperators(now).filter((operator) => {
    const obtain = operator.howToObtain;
    return typeof obtain === 'string' ? /\brecruitment\b/i.test(obtain) : obtain?.Recruitment === 'Yes';
  });
  const pool: RecruitableOperator[] = recruitment.map(({ name, rarity, tags, position, class: className }) =>
    ({ name, rarity, tags, position, class: className, isFuture: false }));
  return { operators: recruitment.map((operator) => ({ ...toGameOperator(operator), icon: getOperatorIconPath(operator) })), questions: buildRecruitmentQuestions(pool) };
}
