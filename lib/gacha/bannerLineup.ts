import type { HeadhuntingBanner } from './headhuntingBanners';

export interface BannerOperator {
  name: string;
  rarity: 6 | 5 | 4;
}
export const RETURNING_LIMITED_NOTE = 'Increased chance within the off-banner 6★ pool.';

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
