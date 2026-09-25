import { isReleasedAt, type ReleaseMarker } from '@/lib/operators/operatorAvailability';
import { normalizeForSearch } from '@/lib/search/searchNormalize';

export interface GameOperator { name: string; aliases: string[] }
export type PaletteMode = 'base' | 'elite2';
export interface PaletteArtwork { image: string; colors: string[] }
/** `release` decides at render whether the operator is playable yet; releases exported
 * before it existed carry only operators already released then. */
export interface PaletteOperator extends GameOperator { rarity: number | null; class: string | null; base: PaletteArtwork | null; elite2: PaletteArtwork | null; release?: ReleaseMarker }
/** The palettes of the operators released on Global at `now` (the page's request clock). */
export function playablePalettes(operators: readonly PaletteOperator[], now: number): PaletteOperator[] {
  return operators.filter((operator) => isReleasedAt(operator.release, now));
}
export interface Progress { found: string[]; wrong: string[]; status: 'playing' | 'won' | 'lost' | 'revealed' }
export const MAX_MISTAKES = 5;
export const newProgress = (): Progress => ({ found: [], wrong: [], status: 'playing' });

export function normalizeAnswer(value: string): string {
  return normalizeForSearch(value).replace(/[^\p{L}\p{N}]/gu, '');
}
export function resolveOperator(input: string, operators: GameOperator[]): GameOperator | null {
  const key = normalizeAnswer(input);
  if (!key) return null;
  const canonical = operators.find((operator) => normalizeAnswer(operator.name) === key);
  if (canonical) return canonical;
  const matches = operators.filter((operator) => operator.aliases.some((alias) => normalizeAnswer(alias) === key));
  return matches.length === 1 ? matches[0] : null;
}

/** Correct recruitment answers accumulate; repeating any answer never spends a guess. */
export function submitAnswer(progress: Progress, name: string, answers: string[]): Progress {
  if (progress.status !== 'playing' || progress.found.includes(name) || progress.wrong.includes(name)) return progress;
  if (answers.includes(name)) {
    const found = [...progress.found, name];
    return { ...progress, found, status: answers.every((answer) => found.includes(answer)) ? 'won' : 'playing' };
  }
  const wrong = [...progress.wrong, name];
  return { ...progress, wrong, status: wrong.length >= MAX_MISTAKES ? 'lost' : 'playing' };
}

export function pickNext<T>(items: T[], recent: string[], key: (item: T) => string): T | null {
  if (!items.length) return null;
  const fresh = items.filter((item) => !recent.includes(key(item)));
  const notLast = items.filter((item) => key(item) !== recent[recent.length - 1]);
  const pool = fresh.length ? fresh : notLast.length ? notLast : items;
  return pool[Math.floor(Math.random() * pool.length)];
}
