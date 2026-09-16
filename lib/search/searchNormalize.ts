/**
 * Normalizes a string for search matching -- strips accents/diacritics,
 * a handful of non-decomposable special Latin letters, and punctuation,
 * then lowercases the result. Lets a user type a plain-ASCII search
 * query ("wisadel", "pozemka", "mlynar", "chen") and still match
 * operator names that use the real special characters ("Wiš'adel",
 * "Pozëmka", "Młynar", "Ch'en") -- while typing the accented form
 * itself still works too, since both sides of the comparison go
 * through the same normalization.
 *
 * Two separate problems are handled here, not just one:
 *
 * 1. Decomposable diacritics (š, ë, í, á, etc.) -- these are a base
 *    Latin letter plus a separate combining accent mark under the
 *    hood, so Unicode's own NFD normalization can split them apart,
 *    and stripping the combining-mark range afterward removes the
 *    accent cleanly.
 *
 * 2. Non-decomposable special letters (ł, ø, ß, æ, œ, and their
 *    uppercase forms) -- these are NOT accent+base-letter pairs, they're
 *    entirely distinct Unicode characters with no decomposition at
 *    all. NFD normalization does nothing to them (verified directly:
 *    'ł'.normalize('NFD') returns 'ł' completely unchanged). These need
 *    an explicit lookup table instead.
 *
 * Confirmed against this project's own known cases: Wiš'adel, Pozëmka,
 * Młynar (all three specifically reported as hard to search), plus
 * Ch'en and Kal'tsit for the apostrophe-stripping behavior.
 */

// Characters with no Unicode decomposition -- must be mapped manually.
// Covers Polish (ł), Scandinavian (ø), German (ß), and French (æ/œ)
// letters, since those are the most common non-decomposable Latin
// special characters likely to show up in other operator names too.
const NON_DECOMPOSABLE_MAP: Record<string, string> = {
  'ł': 'l', 'Ł': 'L',
  'ø': 'o', 'Ø': 'O',
  'đ': 'd', 'Đ': 'D',
  'ß': 'ss',
  'æ': 'ae', 'Æ': 'AE',
  'œ': 'oe', 'Œ': 'OE',
};

/** Strips diacritics, the non-decomposable special letters above, and
 * common punctuation (apostrophes, periods, hyphens), then lowercases
 * the result. Apply this to BOTH the user's search query and the
 * target string (operator name, etc.) before comparing -- normalizing
 * only one side won't match. */
export function normalizeForSearch(str: string): string {
  let result = str;
  for (const [special, plain] of Object.entries(NON_DECOMPOSABLE_MAP)) {
    result = result.split(special).join(plain);
  }
  // NFD decomposes an accented character into its base letter plus a
  // separate combining mark; stripping the combining-marks Unicode
  // range afterward removes just the accent, leaving the base letter.
  result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  result = result.replace(/['\u2018\u2019\u02bc.\-]/g, '');
  return result.toLowerCase();
}

/** Convenience wrapper for the common case: does `haystack` contain
 * `needle`, ignoring diacritics/special characters/punctuation/case?
 * e.g. matchesSearch("Wiš'adel", "wisadel") -> true */
export function matchesSearch(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return normalizeForSearch(haystack).includes(normalizeForSearch(needle));
}

/** Ranks how well `haystack` matches `needle` for sorting search
 * results -- lower is better. 0 = starts with the query, 1 = contains
 * it elsewhere, 2 = no match at all. Use as a sort key ahead of
 * whatever the list's normal ordering is, so e.g. typing "an" surfaces
 * operators whose name actually STARTS with "An" (Angelina, Andreana)
 * before ones that merely contain "an" in the middle (Franka,
 * Manticore) -- otherwise a short/common name (the operator literally
 * named "W" is the confirmed case that motivated this) gets buried
 * under every name that happens to contain that letter anywhere. Same
 * normalization as matchesSearch, so ranking stays consistent with
 * whatever actually passed the filter. */
export function searchRelevance(haystack: string, needle: string): number {
  const normNeedle = normalizeForSearch(needle);
  if (!normNeedle) return 0;
  const normHay = normalizeForSearch(haystack);
  if (normHay.startsWith(normNeedle)) return 0;
  if (normHay.includes(normNeedle)) return 1;
  return 2;
}