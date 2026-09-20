/** Server-only catalogue. Exchange rosters are tied to pool IDs, never inferred from age. */
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBanners';
import { getGachaIconPools } from '@/lib/gacha/gachaIconPools';
import { buildEligiblePool } from '@/lib/gacha/gachaOperatorEligibility';
import { deriveReleaseDatesFromBanners } from '@/lib/operators/operatorReleaseDates';
import { getAllOperators } from '@/lib/operators/operators';
import type { HowToObtainInfo } from '@/lib/operators/operatorTypes';
import type { UpcomingBanner } from './pulls';
import type { BannerOdds, OddsOperator } from './probability';
import { pullArtworkUrl } from './artwork';

export const LIMITED_RULES: Record<string, { bonus: string; source: string; returning300: string[]; returning200: string[] }> = {
  LIMITED_73_0_1: {
    bonus: "Kal'tsit - Esperanta", source: 'https://ak.hypergryph.com/news/2825',
    returning300: ['Exusiai the New Covenant', 'Lappland the Decadenza', "Wiš'adel", 'Virtuosa', 'Muelsyse', 'Texas the Omertosa'],
    returning200: ['Specter the Unchained', 'Nearl the Radiant Knight', 'Skadi the Corrupting Heart', 'Rosmontis', 'W'],
  },
  LIMITED_76_0_1: {
    bonus: 'Angelina the Mellow Wish', source: 'https://ak.hypergryph.com/news/6247.html',
    returning300: ['Hoshiguma the Breacher', 'Pepe', 'Eyjafjalla the Hvít Aska'],
    returning200: ['Gavial the Invincible', "Ch'en the Holungday"],
  },
};
const CROSSOVER_SOURCES: Record<string, string> = {
  LINKAGE_74_0_1: 'https://ak.hypergryph.com/news/7377.html',
  LINKAGE_74_0_3: 'https://ak.hypergryph.com/news/9699',
};
export function getBannerOdds(schedule: UpcomingBanner[]): Record<string, BannerOdds> {
  const banners = getAllHeadhuntingBanners();
  const pools = getGachaIconPools();
  const release = deriveReleaseDatesFromBanners(banners);
  const kernel: Record<string, string> = {};
  const obtain: Record<string, HowToObtainInfo> = {};
  for (const op of getAllOperators()) {
    release[op.name] = op.characterInfo?.['Release Date'] || release[op.name];
    const date = op.characterInfo?.['Kernel Addition Date'];
    if (date) kernel[op.name] = date;
    if (op.howToObtain && typeof op.howToObtain === 'object') obtain[op.name] = op.howToObtain;
  }
  // Current schedule corrections take precedence over stale scraped debut dates.
  const debut = new Map<string, string>();
  for (const banner of schedule) {
    if (banner.rerun) continue;
    const raw = banners.find(b => b.name === banner.name);
    if (!raw || !['featured', 'limited'].includes(raw.pull_type)) continue;
    for (const name of [...raw.six_stars, ...raw.five_stars]) {
      const historical = banners.some(b => b !== raw && [...b.six_stars, ...b.five_stars].includes(name) && b.cn_date && raw.cn_date && b.cn_date < raw.cn_date);
      if (!historical) debut.set(name, banner.start);
    }
  }
  for (const [name, date] of debut) release[name] = date;
  const result: Record<string, BannerOdds> = {};
  for (const banner of schedule) {
    const raw = banners.find(b => b.name === banner.name);
    if (!raw || !banner.poolId) continue;
    const limited = LIMITED_RULES[banner.poolId];
    const crossover = CROSSOVER_SOURCES[banner.poolId];
    const type = limited ? 'limited' : crossover ? 'crossover' : raw.pull_type === 'featured' && banner.ruleType === 'SINGLE' ? 'single' : banner.poolId === 'SPECIAL_73_0_3' ? 'orienteering' : null;
    if (!type || !raw.six_stars.length || !raw.five_stars.length) continue; // unknown special rules need verification
    const ordinarySix = buildEligiblePool(pools.six, obtain, release, kernel, new Date(`${banner.start}T00:00:00`), false, new Set(raw.six_stars)).map(op => op.name);
    const operators: OddsOperator[] = [];
    const add = (name: string, rarity: 5 | 6, share: number, kind: OddsOperator['kind'], spark?: number) => {
      const icon = (rarity === 6 ? pools.six : pools.five).find(op => op.name === name)?.icon;
      operators.push({ name, rarity, share, kind, icon: icon ? pullArtworkUrl(icon) : null, ...(spark ? { spark } : {}) });
    };
    raw.six_stars.forEach(name => add(name, 6, (limited ? .7 : type === 'orienteering' ? 1 : .5) / raw.six_stars.length, 'featured', limited ? 300 : undefined));
    raw.five_stars.forEach(name => add(name, 5, (type === 'orienteering' ? .6 : .5) / raw.five_stars.length, 'featured', limited ? 75 : undefined));
    if (limited) {
      const returning = [...limited.returning300, ...limited.returning200];
      // Ordinary operators and the verified returning limited roster share the remaining 30%.
      const weight = (name: string) => raw.rate_up_six_stars?.includes(name) ? 5 : 1;
      const denominator = ordinarySix.filter(name => !returning.includes(name)).length + returning.reduce((sum, name) => sum + weight(name), 0);
      returning.forEach(name => add(name, 6, .3 * weight(name) / denominator, 'returning', limited.returning200.includes(name) ? 200 : 300));
    }
    result[banner.name] = {
      id: banner.poolId, type, operators,
      sources: [limited?.source || crossover || (type === 'orienteering' ? 'https://ak.hypergryph.com/news/3046' : 'https://ak.hypergryph.com/news/2023033352')],
      ...(limited ? { bonus: limited.bonus, ordinarySix } : {}),
    };
  }
  return result;
}
