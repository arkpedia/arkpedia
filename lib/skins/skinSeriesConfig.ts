import type { Skin } from './skinTypes';

// The order the series dropdown lists them in, and the spelling it prefers. It is a
// hint, not the list: the options come from the records (skinSeriesOptions below), so a
// series the importer writes tomorrow is filterable without a redeploy. The importer's
// SKIN_SERIES map in scripts/sync/catalogue-model.mjs writes exactly these spellings,
// and a test holds the two equal.
export const ALL_SERIES: string[] = [
  'Test Collection',
  'EPOQUE',
  'Made by 0011',
  '0011 Tempest',
  '0011 Yun',
  'MARTHE',
  'Coral Coast',
  'Witch Feast',
  'Cambrian',
  'Icefield Messenger',
  'Vitafield',
  'Pioneer',
  'Striker',
  'Bloodline of Combat',
  'Rhodes Kitchen',
  'Dreambind Castle',
  'Whistlewind',
  'Ambience Synesthesia',
  'Shining Steps',
  'Achievement Star',
  'Iteration Provident',
  'Unveiling of Devotion',
  'Misaligned Sightseer',
  'Storyboard Breaker',
  'Crossover',
];

/** What two spellings of one series share: "AMBIENCE SYNESTHESIA" and "Ambience
 * Synesthesia", "0011/Yun" and "0011 Yun". The filter compares these, not the text. */
export function seriesKey(series: string | null | undefined): string {
  return (series ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

/**
 * The series dropdown, built from the records rather than from ALL_SERIES.
 *
 * Matching the records against a hard-coded list is what left three outfits with no
 * option at all: the importer wrote "AMBIENCE SYNESTHESIA" and a hand edit wrote
 * "0011/Yun", neither of which the list contained. Here every series a record carries
 * is an option, spellings that differ only in case or punctuation are one option under
 * ALL_SERIES's spelling, and ALL_SERIES only decides the order.
 */
export function skinSeriesOptions(skins: readonly Pick<Skin, 'series'>[]): string[] {
  const options = new Map<string, string>();
  for (const skin of skins) {
    const key = seriesKey(skin.series);
    if (key && !options.has(key)) options.set(key, ALL_SERIES.find((series) => seriesKey(series) === key) ?? skin.series);
  }
  const rank = (series: string) => { const at = ALL_SERIES.indexOf(series); return at < 0 ? ALL_SERIES.length : at; };
  return [...options.values()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
