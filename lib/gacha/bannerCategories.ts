import type { BannerType } from './gachaTypes';
import type { HeadhuntingBanner } from './headhuntingBanners';
import { getMechanicType } from './realGachaBanners';
import { upcomingBanners } from './upcomingBanners';

// Navigation groups do not determine odds, pity, guarantees or tutorial rules.
export type DisplayCategory = Exclude<BannerType, 'crossover'> | 'other' | 'upcoming';
export const CATEGORY_LABELS: Record<DisplayCategory, string> = {
  upcoming: 'Upcoming', featured: 'Featured', limited: 'Limited', standard: 'Standard',
  kernel: 'Kernel', kernelLocating: 'Kernel Locating', joint: 'Joint Operation',
  orienteering: 'Orienteering', celebration: 'Celebration', trio: 'The Front That Was', other: 'Other (unclassified)',
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS) as DisplayCategory[];

export function displayCategory(banner: HeadhuntingBanner): DisplayCategory {
  const mechanic = getMechanicType(banner);
  return mechanic === 'crossover' ? 'limited' : mechanic || 'other';
}

export function groupSimulatorBanners(banners: readonly HeadhuntingBanner[], now: number) {
  const grouped = Object.fromEntries(CATEGORIES.map(category => [category, [] as HeadhuntingBanner[]])) as Record<DisplayCategory, HeadhuntingBanner[]>;
  for (const banner of banners) grouped[displayCategory(banner)].push(banner);
  grouped.upcoming = upcomingBanners(banners, now);
  return grouped;
}
