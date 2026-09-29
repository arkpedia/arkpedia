import type { EnemySummary } from './enemyTypes';

const twinKey = (row: Pick<EnemySummary, 'name' | 'index'>) => `${row.name}\u0000${row.index ?? ''}`;

/**
 * The rows /enemies lists: every enemy the game's handbook lists, and every one it hides
 * (`hidden`, the game's hideInHandbook) that is not a copy of one it lists.
 *
 * Most hidden rows are a harder copy of a listed entry, with its name and its code and
 * other stats -- Manfred at 150,000 HP in Integrated Strategies beside the 40,000 of
 * chapter 10, OpFor: Armor at 1.2m beside 600k -- and listing both would show the same
 * creature twice. The grid used to leave out every hidden row, which also dropped the ones
 * nothing duplicates: 'Misery', Blade of Silence, Mirage, Delusion, 'Body of Sui' and 22
 * more rows were on no list at all. A hidden row is left out only when a listed row has
 * its name and its code (scripts/tests/test-enemy-listing.ts).
 */
export function listedEnemies<T extends Pick<EnemySummary, 'name' | 'index' | 'hidden'>>(rows: readonly T[]): T[] {
  const listed = new Set(rows.filter((row) => !row.hidden).map(twinKey));
  return rows.filter((row) => !row.hidden || !listed.has(twinKey(row)));
}
