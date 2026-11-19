import type { Operator } from '../../lib/operators/operatorTypes';
import { operatorAlterFamilies } from '../../lib/operators/operatorAliases';
import { normalizeForSearch } from '../../lib/search/searchNormalize';
import { hanReadings, kanaReadings, romanizeHangul } from './credit-romanization';

type OperatorNames = Pick<Operator, 'name' | 'internalName' | 'aliases' | 'otherLanguages'> & { alternate?: string | null };

// These names are documented in the operator profiles and archive files. Keep
// search names keyed by stable operator ID so codename localization preserves them.
const BIOGRAPHICAL_NAMES: Readonly<Record<string, readonly string[]>> = {
  char_194_leto: ['Rosalind Tatyanovna Larina'], // Profile
  char_261_sddrag: ['Loughshinny', 'Loughshinny Dublinn'], // Necrass, Archive File 4
  char_291_aglina: ['Angelina Ajimu'], // Profile
  char_377_gdglow: ['Susie Glitter'], // Archive File 1
  char_416_zumama: ['Zumama'], // Archive File 1
  char_421_crow: ['Rafaela Silva'], // Archive File 2
  char_450_necras: ['Eblana Dublinn'], // Profile
  char_484_robrta: ['Roberta Baker'], // Archive File 4
  char_486_takila: ['Ernesto Salas'], // Profile
  char_488_buildr: ['Ann-Maier Andieross'], // Archive File 1
  char_498_inside: ['Richele Colombo'], // Archive File 1
  char_1019_siege2: ['Alexandrina Vina Victoria'], // Archive File 2
  char_1023_ghost2: ['Laurentina'], // Profile
  char_4015_spuria: ['Serpilia'], // Profile
  char_4032_provs: ['Deszcz'], // Profile
  char_4036_forcer: ['Ezell Pastore'], // Archive File 1
  char_4042_lumen: ['Jordi Fontanarossa'], // Archive File 1
  char_4051_akkord: ['Tonia Klang'], // Profile
  char_4106_bryota: ['Enis Visser'], // Profile
  char_4119_wanqin: ['He Sheng'], // Profile
  char_4155_talr: ['Luchino de Montano'], // Profile
  char_4225_tanya: ['Tonya'], // Profile
  char_4244_tocka: ['Fyodor Vladimirovich'], // Profile
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

function biographyNames(operator: OperatorNames): readonly string[] {
  return BIOGRAPHICAL_NAMES[operator.internalName ?? ''] ?? [];
}

function characterAliases(operators: readonly OperatorNames[]): Map<string, string[]> {
  const aliases = new Map(operators.map(operator => [operator.name, [...biographyNames(operator)]]));
  for (const [base, ...alters] of operatorAlterFamilies(operators)) {
    const names = [...new Set([base, ...alters].flatMap(biographyNames))];
    aliases.set(base.name, names);
    // Numbered names count the original as 1. Each successive alter
    // adds another "alter", so the shorthand resolves to one form.
    const labels = [base.name, ...(base.aliases ?? []), ...names];
    alters.forEach((alter, index) => {
      const number = index + 2;
      const repeated = ' alter'.repeat(index + 1);
      aliases.set(alter.name, [...names, ...labels.flatMap(label => [
        label + number,
        label + ' ' + number,
        label + repeated,
        ...(index ? [label + ' alter ' + (index + 1)] : []),
      ])]);
    });
  }
  return aliases;
}

/** Names in the records and their Latin spellings. The indexes carry the results. */
export function buildOperatorNameAliases(operators: OperatorNames[]): Record<string, string[]> {
  const identities = characterAliases(operators);
  return Object.fromEntries(operators.map(operator => {
    const localized = Object.entries(operator.otherLanguages ?? {})
      .filter(([, name]) => typeof name === 'string' && name.trim() !== '');
    const otherNames = [
      ...(operator.aliases ?? []),
      ...(identities.get(operator.name) ?? []),
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
