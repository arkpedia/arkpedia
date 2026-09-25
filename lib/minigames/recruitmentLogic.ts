import { getEffectiveTags, RecruitableOperator } from '@/lib/gacha/recruitmentCalc';
import type { GameOperator } from './logic';

/** `rarity` is the star count (1-6), shown on every revealed answer: rarity is what the
 *  tags are for, so a reveal without it hid the point of the round. */
export interface RecruitmentGameOperator extends GameOperator { icon: string; rarity: number }
export interface RecruitmentQuestion { id: string; tags: string[]; answers: string[] }

/** Exhaustive pairs and triplets, counting the FULL pool, including Robots/Starters.
 * No guarantee/rarity-floor filter is used: four matches must never become three by
 * dropping an inconvenient low-rarity answer. Top Operator is required for six-stars. */
export function buildRecruitmentQuestions(operators: RecruitableOperator[]): RecruitmentQuestion[] {
  const unique = [...new Map(operators.map((op) => [op.name, op])).values()];
  const indexed = unique.map((op) => ({ op, tags: new Set(getEffectiveTags(op)) }));
  const tags = [...new Set(indexed.flatMap((entry) => [...entry.tags]))].sort();
  const questions: RecruitmentQuestion[] = [];
  function add(selected: string[]) {
    const answers = indexed.filter(({ op, tags: effective }) =>
      selected.every((tag) => effective.has(tag)) && (op.rarity !== 6 || selected.includes('Top Operator'))
    ).map(({ op }) => op.name).sort();
    if (answers.length >= 1 && answers.length <= 3) questions.push({ id: selected.join('|'), tags: selected, answers });
  }
  for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
    add([tags[i], tags[j]]);
    for (let k = j + 1; k < tags.length; k++) add([tags[i], tags[j], tags[k]]);
  }
  return questions;
}

