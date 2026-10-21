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

/**
 * A source credit can name several people in one string, and the sources disagree on how:
 * the voice tables carry "Stephen Spencer & Georgia Cudby" as one actor, the outfit records
 * "幻象黑兔 , Mag42" and "百慕大飞鱼, Mag42", the operator records "Lowro & Studio Montagne",
 * the outfit importer joins the game's drawer list with " / ", and the base-art parser
 * (operatorArtworkCredits.ts) joins its names with ", " and keeps notes such as
 * '(credited as "Ubisoft" in-game)' on a name. Each person gets their own card, so the
 * credit pages split the string into its people here.
 */

/** Real names that contain a separator, kept whole. None so far; a name joined with "&"
 *  that is one studio or circle goes here once someone has checked it is one name. */
export const JOINT_CREDIT_NAMES: readonly string[] = [];

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

/** "&amp;" and its kin, as a scraped page wrote them; a double-encoded "&amp;amp;" too. */
export function decodeCreditEntities(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(ENTITY, (whole, entity: string) => {
      const e = entity.toLowerCase();
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e] ?? whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** The notes a name can carry about how it was credited; the person is the name before it.
 *  The names inside a note ("additional design by Kumatangent") are not credited from it. */
const CREDIT_NOTE = /\s*\((?:credited as|additional (?:design|art)|with additional (?:design|art))\b[^)]*\)/gi;

/** " & ", ", ", "、", "; " and " / ", in ASCII or full width. "&" and "/" only between
 *  spaces, so an unspaced "A&B" reaches the guard test instead of being split unseen. */
const SEPARATOR = /\s+[&＆]\s+|\s*[,，、;；]\s*|\s+[/／]\s+/;

/** The people one source credit names, each once, placeholders ("-") left out. */
export function creditedPeople(raw: string | null | undefined): string[] {
  const value = decodeCreditEntities(raw ?? '').replace(CREDIT_NOTE, '').replace(/\s+/g, ' ').trim();
  const parts = JOINT_CREDIT_NAMES.includes(value) ? [value] : value.split(SEPARATOR);
  return [...new Set(parts.map(part => part.trim()).filter(part => !isPlaceholderCredit(part)))];
}

/**
 * One spelling for names that differ only in case ("Ask" and "ASK" on Surtr's outfits). The
 * spelling the EN tables use (skin_table drawerList, charword_table cvName), checked
 * 2026-10-22: Ask 6, ASK 0; hou 3, Hou 0; Infukun 26, infukun 0; Skade 64, skade 0;
 * u介 5, U介 0. A pair not listed here takes the spelling credited on more operators (the
 * credit-names test fails until it is listed, so every merge is a reviewed one).
 */
export const CREDIT_NAME_SPELLINGS: Readonly<Record<string, string>> = {
  ask: 'Ask',
  hou: 'hou',
  infukun: 'Infukun',
  skade: 'Skade',
  'u介': 'u介',
};

/** The key two spellings of one name share: case only, never spaces or punctuation
 *  ("Ama Lee" and "AmaLee" stay two cards). */
export function creditNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

/** The spelling a name is shown under, given how many operators credit each spelling. */
export function canonicalCreditSpelling(spellings: ReadonlyMap<string, number>): string {
  const listed = CREDIT_NAME_SPELLINGS[creditNameKey([...spellings.keys()][0])];
  if (listed) return listed;
  return [...spellings].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
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
