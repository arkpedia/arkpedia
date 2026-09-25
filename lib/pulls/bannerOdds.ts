/** Server-only catalogue. Exchange rosters are tied to pool IDs, never inferred from age. */
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { getGachaIconPools } from '@/lib/gacha/gachaIconPools';
import { buildEligiblePool } from '@/lib/gacha/gachaOperatorEligibility';
import { deriveReleaseDatesFromBanners } from '@/lib/operators/operatorReleaseDates';
import { getAllOperators } from '@/lib/operators/operators';
import type { HowToObtainInfo } from '@/lib/operators/operatorTypes';
import type { UpcomingBanner } from './pulls';
import type { BannerOdds, OddsOperator } from './probability';
import { pullArtworkUrl } from './artwork';

/** Operators by character id, never by name: the gift of both limited banners below
 *  opens on Global under a community English name that the official one replaces on
 *  launch day, and a name kept here would then match no one on the banner. */
export const LIMITED_RULES: Record<string, { bonus: string; source: string; returning300: string[]; returning200: string[] }> = {
  LIMITED_73_0_1: {
    // Kal'tsit - Esperanta
    bonus: 'char_1052_kalts2', source: 'https://ak.hypergryph.com/news/2825',
    // Exusiai the New Covenant, Lappland the Decadenza, Wiš'adel, Virtuosa, Muelsyse, Texas the Omertosa
    returning300: ['char_1041_angel2', 'char_1038_whitw2', 'char_1035_wisdel', 'char_245_cello', 'char_249_mlyss', 'char_1028_texas2'],
    // Specter the Unchained, Nearl the Radiant Knight, Skadi the Corrupting Heart, Rosmontis, W
    returning200: ['char_1023_ghost2', 'char_1014_nearl2', 'char_1012_skadi2', 'char_391_rosmon', 'char_113_cqbw'],
  },
  LIMITED_76_0_1: {
    // Angelina the Mellow Wish
    bonus: 'char_1015_aglna2', source: 'https://ak.hypergryph.com/news/6247.html',
    // Hoshiguma the Breacher, Pepe, Eyjafjalla the Hvít Aska
    returning300: ['char_1044_hsgma2', 'char_4058_pepe', 'char_1016_agoat2'],
    // Gavial the Invincible, Ch'en the Holungday
    returning200: ['char_1026_gvial2', 'char_1013_chen2'],
  },
};
type LimitedRules = (typeof LIMITED_RULES)[string];

/** A verified rule with every character id put to today's operator name, or the ids no
 *  operator record answers to. One unresolved id -- a record not imported yet, or held
 *  back in quarantine -- used to vanish silently: the odds renormalised without that
 *  operator and the 300-pull gift read "undefined". So the rule is applied whole or not
 *  at all, and when not, the banner is left unverified like any banner without one. */
export function resolveLimitedRules(verified: LimitedRules, nameOf: ReadonlyMap<string, string>):
  { resolved: { source: string; bonus: string; returning300: string[]; returning200: string[] } } | { missing: string[] } {
  const ids = [verified.bonus, ...verified.returning300, ...verified.returning200];
  const missing = ids.filter(id => !nameOf.has(id));
  if (missing.length) return { missing };
  const names = (list: string[]) => list.map(id => nameOf.get(id)!);
  return { resolved: { source: verified.source, bonus: nameOf.get(verified.bonus)!, returning300: names(verified.returning300), returning200: names(verified.returning200) } };
}

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
  const nameOf = new Map<string, string>();
  for (const op of getAllOperators()) {
    if (op.internalName) nameOf.set(op.internalName, op.name);
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
    const verified = LIMITED_RULES[banner.poolId] && resolveLimitedRules(LIMITED_RULES[banner.poolId], nameOf);
    if (verified && 'missing' in verified) {
      // Said in the build and content-export logs; the page just shows no odds for it.
      console.warn(`Pull odds: ${banner.name} (${banner.poolId}) is left unverified, because its limited rules name ${verified.missing.join(', ')} and no operator record has that id.`);
    }
    const limited = verified && 'resolved' in verified ? verified.resolved : null;
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
