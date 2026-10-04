import type { HeadhuntingBanner } from './headhuntingBanners';

export interface BannerOperator {
  name: string;
  rarity: 6 | 5 | 4;
}
export const RETURNING_LIMITED_NOTE = 'Increased chance within the off-banner 6★ pool.';
const LINEUP_PENDING = 'Lineup to be confirmed.';

/** What a banner whose lineup is pending says in its place: the rate-ups the official CN
 *  announcement names, in its Chinese (an operator not out yet has no record, so no English
 *  name), else that the lineup is to be confirmed. Takes the banner so no display forgets them. */
export function lineupPendingNote(banner: Pick<HeadhuntingBanner, 'announcedLineup'>): string {
  const announced = banner.announcedLineup;
  if (!announced) return LINEUP_PENDING;
  const groups = [
    announced.six.length ? `${announced.six.join(', ')} (6★)` : '',
    announced.rateUpSix.length ? `${announced.rateUpSix.join(', ')} (6★, increased chance)` : '',
    announced.five.length ? `${announced.five.join(', ')} (5★)` : '',
  ].filter(Boolean);
  return groups.length ? `Announced rate-up: ${groups.join(' · ')}. ${LINEUP_PENDING}` : LINEUP_PENDING;
}

/** A banner published before anyone has named its lineup: a pool the game client or
 * a recurring schedule announced, with no wiki row for its window yet. Its lineup
 * arrays are empty rather than known to be empty, so it says so instead of listing
 * no one. */
export function isLineupPending(banner: Pick<HeadhuntingBanner, 'lineupSource'>): boolean {
  return banner.lineupSource === 'pending';
}

/** Secondary rate-ups are returning limited operators, not the banner's
 * featured 6-stars. Keep the data's distinction in every lineup display. */
export function getBannerLineup(banner: Pick<HeadhuntingBanner, 'six_stars' | 'five_stars' | 'four_stars' | 'rate_up_six_stars' | 'pull_type'>): { featured: BannerOperator[]; returning: BannerOperator[] } {
  const featured: BannerOperator[] = [
    ...[...new Set(banner.six_stars || [])].map(name => ({ name, rarity: 6 as const })),
    ...[...new Set(banner.five_stars || [])].map(name => ({ name, rarity: 5 as const })),
    ...[...new Set(banner.four_stars || [])].map(name => ({ name, rarity: 4 as const })),
  ];
  const names = new Set(featured.map(operator => operator.name));
  const returning = banner.pull_type === 'limited'
    ? [...new Set(banner.rate_up_six_stars || [])].filter(name => !names.has(name)).map(name => ({ name, rarity: 6 as const }))
    : [];
  return { featured, returning };
}
