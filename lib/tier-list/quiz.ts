/**
 * A tier list shared as a quiz: the reader gets the maker's rows, empty, and a pool of
 * exactly the items the maker placed, and is marked on how many they put in the tier the
 * maker did. The order inside a tier is not part of the answer.
 */
import type { TierItem } from './catalogue';
import type { TierListState } from './state';

/** The maker's answer: each item's row, by row id. */
export type QuizSolution = Readonly<Record<string, string>>;

export function solutionOf(state: TierListState): QuizSolution {
  return Object.fromEntries(state.rows.flatMap((row) => row.items.map((id) => [id, row.id])));
}

/** The quiz's pool: the solution's items that are in no row yet, in catalogue order. The
 *  maker's filters play no part: the pool is what they ranked, nothing more. */
export function quizPool(items: readonly TierItem[], state: TierListState, solution: QuizSolution): TierItem[] {
  const placed = new Set(state.rows.flatMap((row) => row.items));
  return items.filter((item) => item.id in solution && !placed.has(item.id));
}

export interface QuizScore {
  /** Items the quiz asks about (the solution's, less any the catalogue no longer has). */
  total: number;
  correct: number;
  /** Whole percent, 0 to 100. */
  percent: number;
  right: ReadonlySet<string>;
  /** Placed in another tier than the maker's. An item still in the pool is neither. */
  wrong: ReadonlySet<string>;
}

export function scoreQuiz(state: TierListState, solution: QuizSolution, known: (id: string) => boolean): QuizScore {
  const asked = Object.keys(solution).filter(known);
  const right = new Set<string>();
  const wrong = new Set<string>();
  for (const row of state.rows) for (const id of row.items) if (id in solution && known(id)) (solution[id] === row.id ? right : wrong).add(id);
  return { total: asked.length, correct: right.size, percent: asked.length ? Math.round((right.size / asked.length) * 100) : 0, right, wrong };
}
