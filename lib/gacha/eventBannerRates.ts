import { HeadhuntingBanner } from './headhuntingBanners';

export interface FeaturedOperatorRate {
  name: string;
  rarity: 6 | 5 | 4;
  // null when this banner's mechanic isn't one of the simple fixed-
  // split types handled below (Limited's rate-up six-stars, Standard,
  // Orienteering, Kernel Locating, and Celebration are all either
  // player-selection mechanics or depend on the full off-banner pool
  // size, which isn't known from a single banner's own data) -- shown
  // without a percentage rather than a guessed one.
  percent: number | null;
}

/**
 * Featured operators and their pull percentages, matching the splits
 * documented in the Gacha page's own tutorial:
 * - Limited: 2 true-featured six-stars at 35% each; featured five-star(s)
 *   share 50%; featured four-star(s) share 50%. Rate-up six-stars are
 *   left unpercentaged (see FeaturedOperatorRate's comment above).
 * - Featured: six-star(s) share 50%; five-star(s) share 50%;
 *   four-star(s) share 50%.
 * - Kernel: six-stars share 50%; five-stars share 50%.
 * - Joint Operation: six-stars and five-stars are each split evenly
 *   across the full 100% (e.g. 4 six-stars -> 25% each).
 * - Everything else (Standard, Orienteering, Kernel Locating,
 *   Celebration): names only, no fixed percentage to show.
 */
export function getFeaturedOperatorRates(banner: HeadhuntingBanner): FeaturedOperatorRate[] {
  const sixStars = banner.six_stars || [];
  const rateUps = banner.rate_up_six_stars || [];
  const fiveStars = banner.five_stars || [];
  const fourStars = banner.four_stars || [];
  const result: FeaturedOperatorRate[] = [];

  switch (banner.pull_type) {
    case 'limited':
      sixStars.slice(0, 2).forEach((name) => result.push({ name, rarity: 6, percent: 35 }));
      rateUps.forEach((name) => result.push({ name, rarity: 6, percent: null }));
      fiveStars.forEach((name) => result.push({ name, rarity: 5, percent: 50 / Math.max(1, fiveStars.length) }));
      fourStars.forEach((name) => result.push({ name, rarity: 4, percent: 50 / Math.max(1, fourStars.length) }));
      return result;

    case 'featured':
      sixStars.forEach((name) => result.push({ name, rarity: 6, percent: 50 / Math.max(1, sixStars.length) }));
      fiveStars.forEach((name) => result.push({ name, rarity: 5, percent: 50 / Math.max(1, fiveStars.length) }));
      fourStars.forEach((name) => result.push({ name, rarity: 4, percent: 50 / Math.max(1, fourStars.length) }));
      return result;

    case 'kernel':
      sixStars.forEach((name) => result.push({ name, rarity: 6, percent: 50 / Math.max(1, sixStars.length) }));
      fiveStars.forEach((name) => result.push({ name, rarity: 5, percent: 50 / Math.max(1, fiveStars.length) }));
      return result;

    case 'joint':
      sixStars.forEach((name) => result.push({ name, rarity: 6, percent: 100 / Math.max(1, sixStars.length) }));
      fiveStars.forEach((name) => result.push({ name, rarity: 5, percent: 100 / Math.max(1, fiveStars.length) }));
      return result;

    default:
      sixStars.forEach((name) => result.push({ name, rarity: 6, percent: null }));
      fiveStars.forEach((name) => result.push({ name, rarity: 5, percent: null }));
      fourStars.forEach((name) => result.push({ name, rarity: 4, percent: null }));
      return result;
  }
}