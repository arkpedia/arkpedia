import { moduleUnlock } from '@/lib/planner/plannerLogic';

/** Promotion resets the level; only retain levels already within Elite 2. */
export function withMasteryPrerequisites<T extends { elite: number; level: number; skillLevel: number }>(state: T): T {
  return { ...state, elite: 2, level: state.elite === 2 ? state.level : 1, skillLevel: 7 };
}

export function withModulePrerequisites<T extends { elite: number; level: number }>(state: T, rarity: number): T {
  const unlock = moduleUnlock(rarity);
  if (!unlock) return state;
  return { ...state, elite: unlock.elite, level: Math.max(unlock.level, state.elite === unlock.elite ? state.level : 1) };
}

export function withSkillRankPrerequisites<T extends { elite: number; level: number; skillLevel: number }>(state: T, rank: number): T {
  const promote = rank > 4 && state.elite === 0;
  return { ...state, elite: promote ? 1 : state.elite, level: promote ? 1 : state.level, skillLevel: rank };
}
