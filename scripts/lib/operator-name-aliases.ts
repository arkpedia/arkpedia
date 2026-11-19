import type { Operator } from '../../lib/operators/operatorTypes';
import { normalizeForSearch } from '../../lib/search/searchNormalize';
import { hanReadings, kanaReadings, romanizeHangul } from './credit-romanization';

type OperatorNames = Pick<Operator, 'name' | 'internalName' | 'aliases' | 'otherLanguages'>;

// The public operator file gives this name in addition to the codename Тоска.
const BIOGRAPHICAL_NAMES: Readonly<Record<string, readonly string[]>> = {
  char_4244_tocka: ['Fyodor Vladimirovich'],
};

const RUSSIAN_LETTERS: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function readings(name: string, language: string): string[] {
  if (/\p{Script=Cyrillic}/u.test(name)) {
    const lower = name.normalize('NFC').toLowerCase();
    const transliterate = (text: string) => text.replace(/[а-яё]/g, letter => RUSSIAN_LETTERS[letter]);
    return [transliterate(lower), transliterate(lower.replace(/([ие])я(?=$|[^\p{L}])/gu, '$1a'))];
  }
  // Use the language of the record to disambiguate Hanzi from Japanese kanji.
  if (language.includes('Chinese') && /\p{Script=Han}/u.test(name)) return hanReadings(name);
  if (/\p{Script=Hangul}/u.test(name)) return [romanizeHangul(name.normalize('NFKC'))];
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name) && !/\p{Script=Han}/u.test(name)) return kanaReadings(name.normalize('NFKC'));
  return [];
}

/** Names in the records and their Latin spellings. The indexes carry the results. */
export function buildOperatorNameAliases(operators: OperatorNames[]): Record<string, string[]> {
  return Object.fromEntries(operators.map(operator => {
    const localized = Object.entries(operator.otherLanguages ?? {})
      .filter(([, name]) => typeof name === 'string' && name.trim() !== '');
    const otherNames = [
      ...(operator.aliases ?? []),
      ...(BIOGRAPHICAL_NAMES[operator.internalName ?? ''] ?? []),
    ];
    const seen = new Set([normalizeForSearch(operator.name)]);
    const aliases = [
      ...readings(operator.name, ''),
      ...otherNames.flatMap(name => [name, ...readings(name, '')]),
      ...localized.flatMap(([language, name]) => [name, ...readings(name, language)]),
    ].map(name => name.trim()).filter(name => {
      const key = normalizeForSearch(name);
      if (!key || !/[\p{L}\p{N}]/u.test(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [operator.name, aliases];
  }));
}
