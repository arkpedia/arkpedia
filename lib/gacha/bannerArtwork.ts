import type { BannerOperator } from './bannerLineup';

export interface BannerArtworkOperator extends BannerOperator {
  art: string | null;
  elite: 0 | 2 | null;
  shop: boolean;
}
