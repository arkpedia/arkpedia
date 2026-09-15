import { Operator } from './operatorTypes';

const RARITY_WORDS: Record<number, string> = {
  6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one',
};

/**
 * Returns the correct icon path for an operator, checking whichever
 * folder it actually belongs to (by rarity, or the future-operators
 * folder for unreleased placeholders). Pure function, no Node APIs --
 * safe to call from client-rendered components as well as server-side code.
 * Encode the filename for Next image optimization, retaining accents and apostrophes.
 */
export function getOperatorIconPath(op: Pick<Operator, 'name' | 'rarity' | 'isFuture'>): string {
  if (op.isFuture) return `/future_operator_icons/${encodeURIComponent(`${op.name}.webp`)}`;
  const word = (op.rarity && RARITY_WORDS[op.rarity]) || 'six';
  const safeName = op.name.replace(/[\\/*?:"<>|]/g, '').trim();
  return `/${word}-star-icons/${encodeURIComponent(`${safeName} - Base.webp`)}`;
}
