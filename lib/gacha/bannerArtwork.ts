import type { BannerOperator } from './bannerLineup';
import type { HeadhuntingBanner } from './headhuntingBanners';

export interface BannerArtworkOperator extends BannerOperator {
  art: string | null;
  elite: 0 | 2 | null;
  shop: boolean;
}

/** The dates distinguish this Global run from similarly numbered regional pools. */
export function isGlobalPool180(banner: HeadhuntingBanner): boolean {
  return banner.name === 'Standard Pool #180 (Global)' && banner.global_date === '2026/11/20–2026/12/04';
}

export function officialBannerArtwork(banner: HeadhuntingBanner): string | null {
  // The source host blocks cross-site image loads in Chromium. Use the bundled copy
  // until the normal asset mirror carries this artwork.
  // https://arknights.wiki.gg/wiki/File:EN_Standard_Pool_180_banner.png
  return banner.banner_image || (isGlobalPool180(banner) ? '/gacha-art/standard-pool-180-global.webp' : null);
}
