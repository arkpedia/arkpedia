/**
 * Names and labels the credit pages (/artists, /voice-actors) share between the data
 * builder (lib/operators/creditDatabase.ts) and the page, which runs in the browser too,
 * so nothing here reads a file.
 */

/**
 * A credit that names nobody: the voice tables carry "-" where a pack has no actor on
 * record (Miss.Christine's Japanese and Mandarin, Rhodes Island Recon, Terra Research
 * Commission), and the /voice-actors page drew it as a person called "-". Dashes, dots,
 * question marks and blanks, and the words a source writes for "not known".
 */
const PLACEHOLDER = /^(?:[\s\-‐‑‒–—―_.·・?？*/]*|unknown|uncredited|not credited|none|n\/?a|tba|tbd|tbc|null|undefined|anonymous|various|未知|不明|无|佚名)$/i;

export function isPlaceholderCredit(name: string | null | undefined): boolean {
  return PLACEHOLDER.test((name ?? '').normalize('NFKC').trim());
}

/** The label an operator's own artwork is credited under, its promotions', and an
 *  original designer's; anything else an artist is credited for is an outfit's name. */
export const BASE_ART_CREDITS = ['Operator artwork', 'Elite 1', 'Elite 2'] as const;
export const ORIGINAL_DESIGN_CREDIT = 'Original design';

export type ArtCreditKind = 'art' | 'outfit' | 'design';
export function artCreditKind(credit: string): ArtCreditKind {
  if ((BASE_ART_CREDITS as readonly string[]).includes(credit)) return 'art';
  return credit === ORIGINAL_DESIGN_CREDIT ? 'design' : 'outfit';
}

/** The short form a tile has room for: "Operator artwork" is the base art, the promotions
 *  are E1 and E2, and an outfit keeps its name. */
export function shortArtCredit(credit: string): string {
  if (credit === 'Operator artwork') return 'Base';
  if (credit === 'Elite 1') return 'E1';
  if (credit === 'Elite 2') return 'E2';
  if (credit === ORIGINAL_DESIGN_CREDIT) return 'Design';
  return credit;
}

/**
 * The letter group a name sorts under: A-Z for Latin script (accents folded, so "Émilie"
 * is E), # for a digit or a symbol, and one group each for kana, Han characters and
 * Hangul, since most artists are credited in Japanese or Chinese.
 */
export type LetterGroup = string;
export const SCRIPT_GROUPS = [
  { key: 'kana', label: 'Kana', test: /^[぀-ヿㇰ-ㇿｦ-ﾟ]/ },
  { key: 'han', label: 'Han', test: /^[㐀-䶿一-鿿豈-﫿々〇]/ },
  { key: 'hangul', label: 'Hangul', test: /^[ᄀ-ᇿ㄰-㆏가-힯]/ },
] as const;

export function letterGroup(name: string): LetterGroup {
  const first = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().charAt(0);
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  for (const group of SCRIPT_GROUPS) if (group.test.test(first)) return group.key;
  return '#';
}

/** The order the groups are shown in, and their headings. */
export function letterGroupRank(group: LetterGroup): number {
  if (group.length === 1 && group >= 'A' && group <= 'Z') return group.charCodeAt(0) - 65;
  if (group === '#') return 26;
  const i = SCRIPT_GROUPS.findIndex(g => g.key === group);
  return i < 0 ? 40 : 27 + i;
}

export function letterGroupLabel(group: LetterGroup): string {
  return SCRIPT_GROUPS.find(g => g.key === group)?.label ?? group;
}
