import { normalizeForSearch } from '@/lib/search/searchNormalize';
import { KIND_LABELS, type EnemyContent, type EnemySummary } from './enemyTypes';

/**
 * The /enemies search box. It matched an enemy's name and code only; it now also finds an
 * enemy by where it appears and by everything the filter chips choose from, so a reader
 * can type what they would otherwise click:
 *
 *   - a chapter, however it is written: "chapter 01", "chapter 1", "ch1", "ch 01", "ep 1"
 *     are all EP 01, and never EP 10 to EP 16;
 *   - any content by its code ("PA", "IS3", "CC#1") or by its name ("People, A People",
 *     "Burning Run", "Kazimierz"), or its kind ("annihilation");
 *   - rank, race, location, attack pattern and damage type ("boss" or "leader", "sarkaz", "flying",
 *     "melee and ranged", "no damage"), "other" being the enemies with no race, as the
 *     Race chips call them.
 *
 * The query is read whole first: an enemy matches when its name contains it (as before),
 * its code starts with it, one of its values has it as words, or it appears in a content
 * whose code is it or whose name has it as words. Only when no enemy matches the whole
 * query is it read word by word, every word having to match something ("flying sarkaz",
 * "ch 1 boss"). Read word by word first, "People A People" would also find Here A People
 * Sows, whose name has "a" and "people" too.
 *
 * A query that is exactly a content's code or a chip's value is taken as that: names,
 * values and content names then match it as whole words only. "PA" is People, A People
 * and not every name or event with a word starting "pa" (Partial Necrosis, Crowbar
 * Patrolman); "sarkaz" is the race, not also everything in Sarkaz's Furnaceside Fables.
 * Word by word, a content's name matches only whole words, for the same reason.
 * scripts/tests/test-enemy-search.ts holds every content and chip to this.
 */

type Searchable = Pick<EnemySummary, 'name' | 'index' | 'rank' | 'race' | 'movement' | 'attack_position' | 'damage_type' | 'appears_in'>;
type Content = Pick<EnemyContent, 'id' | 'kind' | 'label' | 'name'>;

/** Lowercase, accents and apostrophes gone, every other mark a space. */
export function plain(text: string): string {
  return normalizeForSearch(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** plain, with a chapter written any way as `ep<n>` and a short code's number joined to
 *  it: "Chapter 01" and "ch 1" are "ep1", "CC#1" is "cc1", "IS 3" is "is3". */
export function codeForm(text: string): string {
  return plain(text)
    .replace(/\b(?:chapter|chap|ch|episode|ep) ?0*(\d{1,2})\b/g, 'ep$1')
    .replace(/\b([a-z]{1,4}) (\d{1,2})\b/g, '$1$2');
}

// Words that say nothing alone: read word by word, "a" would match every Arts Creation.
const FILLER = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'to', 'for', 'with', 'at', 'by', 'from']);

const words = (text: string) => text.split(' ').filter(Boolean);
/** `needle` as whole words of `hay`, its last word allowed to be the start of one: what a
 *  reader has typed so far of a name. */
const startsWords = (hay: string, needle: string) => hay.startsWith(needle) || hay.includes(` ${needle}`);
/** `needle` as whole words of `hay`. */
const hasWords = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

/** An enemy's values, as the filter chips name them. The rank tabs call a Boss "Leader",
 *  as the game does, so a Boss answers to both. */
function values(enemy: Searchable): string[] {
  return [enemy.rank, enemy.rank === 'Boss' ? 'Leader' : null, enemy.race || 'Other', enemy.movement, enemy.attack_position, ...(enemy.damage_type || [])]
    .filter((value): value is string => Boolean(value)).map(plain);
}

/** The two readings of a query over `rows`: whole, and word by word. */
export function readQuery(query: string, contents: readonly Content[], rows: readonly Searchable[]) {
  const q = plain(query);
  const qc = codeForm(query);
  const catalogue = contents.map((content) => ({
    id: content.id,
    label: content.label ? codeForm(content.label) : null,
    name: plain(content.name),
    kind: plain(KIND_LABELS[content.kind] ?? ''),
  }));
  // A content's code, or a value some enemy has (the chips offer exactly these).
  const exact = catalogue.some((content) => content.label === qc) || rows.some((enemy) => values(enemy).includes(q));
  const inText = exact ? hasWords : startsWords;

  const wholeContents = new Set(catalogue
    .filter((content) => content.label === qc || inText(content.name, q) || inText(content.kind, q))
    .map((content) => content.id));
  const whole = (enemy: Searchable) => Boolean(q) && (
    (exact ? hasWords(plain(enemy.name), q) : plain(enemy.name).includes(q))
    || (enemy.index ? codeForm(enemy.index).startsWith(qc) : false)
    || values(enemy).some((value) => inText(value, q))
    || (enemy.appears_in || []).some((id) => wholeContents.has(id)));

  const terms = words(qc).filter((word) => !FILLER.has(word));
  const termContents = terms.map((term) => new Set(catalogue
    .filter((content) => content.label === term
      || words(content.name).includes(term)
      || words(content.kind).some((word) => word.startsWith(term)))
    .map((content) => content.id)));
  const byTerms = (enemy: Searchable) => terms.length > 0 && terms.every((term, i) =>
    words(plain(enemy.name)).some((word) => word.startsWith(term))
    || (enemy.index ? codeForm(enemy.index).startsWith(term) : false)
    || values(enemy).some((value) => words(value).some((word) => word.startsWith(term)))
    || (enemy.appears_in || []).some((id) => termContents[i].has(id)));

  /** The enemy's own name or code is what matched, not only where it appears: these lead
   *  the results, so "misery" puts 'Misery', Blade of Silence ahead of the 116 others in
   *  Vector Breakthrough #2: Trial from Misery. */
  const own = (enemy: Searchable) => Boolean(q) && ((exact ? hasWords(plain(enemy.name), q) : plain(enemy.name).includes(q))
    || (enemy.index ? codeForm(enemy.index).startsWith(qc) : false)
    || (terms.length > 1 && terms.every((term) => words(plain(enemy.name)).some((word) => word.startsWith(term)))));

  return { whole, byTerms, own };
}

/** The rows matching `query` -- read whole if any row matches it whole, else word by
 *  word -- and which of them matched by their own name or code, to lead the results. */
export function searchEnemies<T extends Searchable>(rows: readonly T[], query: string, contents: readonly Content[]): { rows: T[]; own: (enemy: T) => boolean } {
  if (!plain(query)) return { rows: [...rows], own: () => false };
  const { whole, byTerms, own } = readQuery(query, contents, rows);
  const matched = rows.filter(whole);
  return { rows: matched.length ? matched : rows.filter(byTerms), own };
}
