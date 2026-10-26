import { toRomaji } from 'wanakana';
import { pinyin } from 'pinyin-pro';
import { creditPeople } from '../../lib/operators/creditDatabase';

/*
 * The romanized names an artist or voice actor answers to in the site search
 * (lib/search/siteSearchIndex.ts), worked out when the index is written
 * (scripts/build/build-site-search.ts), so the browser downloads aliases and no romanizer.
 * This file is build-only: nothing under lib/, components/ or pages/ may import it
 * (scripts/tests/test-credit-search.ts holds that).
 *
 * Only readings the script itself determines:
 *   kana    Hepburn, by wanakana: "カワグチ" is "kawaguchi".
 *   Hangul  Revised Romanization, syllable by syllable (romanizeHangul).
 *   Hanzi   pinyin, by pinyin-pro, with and without spaces: "赵爽" is "zhao shuang" and
 *           "zhaoshuang". Latin letters in the name stay as they are ("三目YYB").
 * Japanese kanji have no such reading: 坂本真绫 is "Sakamoto Maaya", not the pinyin of its
 * characters, and only a dictionary or the data can say so. So a Han name that is Japanese
 * gets no alias here, and stays uncovered until the data links it to a romanized spelling
 * (the voice builder already does, by operator and language, once the EN tables credit the
 * operator: scripts/lib/voice-pack-metadata.mjs actorAliases). Which Han names are Japanese:
 *   - a voice actor credited only in a Japanese (or Korean) pack: the data says so;
 *   - a name with kana in it (竜崎いち): part of it is kanji, so no whole reading exists;
 *   - an artist listed in JAPANESE_HAN_ARTISTS, or whose name uses a character simplified
 *     Chinese does not (々, 黒, 塩): artists carry no language, so this list is reviewed.
 */

/** Artists credited in Han characters whose names are Japanese, so pinyin would be a wrong
 *  reading. Reviewed by hand, 2026-10-22; a new one is listed here. */
export const JAPANESE_HAN_ARTISTS: readonly string[] = ['黒星紅白', '釜飯轟々丸', '色塩', '松尾省吾'];

/** Characters only Japanese writes this way (simplified Chinese 黑 盐 龙..., or no Chinese use
 *  at all, 々): a Han artist name using one is Japanese, and must be in the list above. */
export const JAPANESE_ONLY_HAN = /[々〆ヶ黒塩竜沢桜恵広斎辺渋県駅鉄売円図]/;

// Katakana's middle dot (・) is punctuation, not kana: M・A・O is a Latin name.
const KANA = /[぀-ゟ゠-ヺー-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const HANGUL = /[가-힣]/;

export type CreditScript = 'latin' | 'kana' | 'han' | 'hangul' | 'kana+han' | 'other';

/** Which script a name is written in, for the coverage report and the rules above. */
export function creditScript(name: string): CreditScript {
  const kana = KANA.test(name), han = HAN.test(name);
  if (HANGUL.test(name)) return 'hangul';
  if (kana && han) return 'kana+han';
  if (kana) return 'kana';
  if (han) return 'han';
  return /\p{L}/u.test(name) ? 'latin' : 'other';
}

/* Revised Romanization, per syllable: initial, medial and final from the syllable's code
   point. Sound changes across syllables (assimilation) are not applied: it is a search
   alias, and the plain spelling is what a reader types first. */
const RR_INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RR_MEDIAL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const RR_FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

export function romanizeHangul(text: string): string {
  return [...text].map((char) => {
    const code = char.codePointAt(0)! - 0xac00;
    if (code < 0 || code > 11171) return char;
    return RR_INITIAL[Math.floor(code / 588)] + RR_MEDIAL[Math.floor((code % 588) / 28)] + RR_FINAL[code % 28];
  }).join('');
}

/** Hepburn with its long vowels written out ("tarou", "nuudoru") and as most people type
 *  them ("taro", "nudoru"). */
function kanaReadings(name: string): string[] {
  const full = toRomaji(name).replace(/\s+/g, ' ').trim();
  const short = full.replace(/ou/g, 'o').replace(/([aiueo])\1/g, '$1');
  return [full, short];
}

/** pinyin of the Han runs, the rest kept: spaced by syllable, and run together. */
function hanReadings(name: string): string[] {
  const parts = pinyin(name, { toneType: 'none', type: 'array', nonZh: 'consecutive', v: true })
    .map((part) => part.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter(Boolean);
  const spaced = parts.join(' ');
  return [spaced, parts.join('')];
}

export interface CreditNameSource {
  name: string;
  /** The language packs a voice actor is credited in ("Japanese"); none for an artist. */
  languages?: readonly string[];
  kind: 'artist' | 'voice-actor';
}

/** Whether a Han name reads as Japanese by the rules at the top of this file. */
export function isJapaneseHanName(person: CreditNameSource): boolean {
  if (KANA.test(person.name)) return true;
  if (person.kind === 'voice-actor') {
    const languages = person.languages ?? [];
    return languages.length > 0 && languages.every((language) => language === 'Japanese' || language === 'Korean');
  }
  return JAPANESE_HAN_ARTISTS.includes(person.name) || JAPANESE_ONLY_HAN.test(person.name);
}

/** The romanized names one person answers to, besides the name itself; none when the name
 *  is already Latin or its reading cannot be known from the script. */
export function creditNameAliases(person: CreditNameSource): string[] {
  const { name } = person;
  const script = creditScript(name);
  let readings: string[] = [];
  if (script === 'kana') readings = kanaReadings(name);
  else if (script === 'hangul') readings = [romanizeHangul(name)];
  else if (script === 'han' && !isJapaneseHanName(person)) readings = hanReadings(name);
  const seen = new Set([name.toLowerCase()]);
  return readings.filter((reading) => {
    const key = reading.toLowerCase();
    if (!reading || seen.has(key) || !/[a-z]/i.test(reading)) return false;
    seen.add(key);
    return true;
  });
}

export interface RomanizationCoverage { script: CreditScript; names: number; romanized: number }

/** How many names of each script have a romanized alias, for the build's log and the PR. */
export function romanizationCoverage(people: readonly (CreditNameSource & { aliases: readonly string[] })[]): RomanizationCoverage[] {
  const rows = new Map<CreditScript, RomanizationCoverage>();
  for (const person of people) {
    const script = creditScript(person.name);
    const row = rows.get(script) ?? { script, names: 0, romanized: 0 };
    row.names += 1;
    if (script === 'latin' || person.aliases.length) row.romanized += 1;
    rows.set(script, row);
  }
  return [...rows.values()].sort((a, b) => b.names - a.names);
}

/** A person as the site search's rows take them (lib/search/siteSearchIndex.ts
 *  SiteSearchPerson, which this matches by shape: the payload-budgets refresh stage imports
 *  this file, and lib/search/ is not among what a refresh runs, the production refresh pipeline). */
interface SearchPerson {
  kind: 'artist' | 'voice-actor';
  name: string;
  operators: number;
  languages?: string[];
  aliases?: string[];
}

/** Every person the credit pages list, as the site search's rows take them: the name the
 *  page shows, a count of operators (never the list: the index is downloaded whole), a voice
 *  actor's languages by how many operators they voice in each, and the romanized names. */
export function siteSearchPeople(): SearchPerson[] {
  return (['artists', 'voice-actors'] as const).flatMap((page) => creditPeople(page).map((person) => {
    const kind = page === 'artists' ? 'artist' as const : 'voice-actor' as const;
    const counts = new Map<string, number>();
    if (kind === 'voice-actor') for (const op of person.operators) for (const language of op.credits) counts.set(language, (counts.get(language) ?? 0) + 1);
    const languages = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([language]) => language);
    const base: SearchPerson = { kind, name: person.name, operators: person.operators.length, ...(languages.length ? { languages } : {}) };
    const aliases = creditNameAliases(base);
    return aliases.length ? { ...base, aliases } : base;
  }));
}
