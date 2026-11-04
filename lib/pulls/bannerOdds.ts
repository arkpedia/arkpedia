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

/**
 * Which banners' odds were verified against their official announcement, and what that
 * announcement says: data/pull-odds-rules.json, a game record like the banner list, so a
 * new banner's rules go out with the next content release and need no redeploy. A limited,
 * crossover or Orienteering pool the file does not name gets no odds, and the release's
 * odds-rules stage lists it in the daily 'Content quarantined' issue when confirmed
 * rules cannot be imported automatically (scripts/content/check-pull-odds.ts). Kernel and Standard
 * banners have no model here at all, verified or not.
 *
 *   limited:      a pool's 300-pull gift and its returning roster at each exchange cost.
 *                 Operators by character id, never by name: the gift of both limited
 *                 banners opened on Global under a community English name that the
 *                 official one replaced on launch day, and a name kept here would then
 *                 match no one on the banner.
 *   crossover:    the rules probability.ts models -- the featured 6★ within every 120
 *                 pulls, resetting when obtained; a rate-up 5★ as the next 5★ if none came
 *                 in the first 50 pulls; and, with two rate-up 5★, the next 5★ after the
 *                 first of them is the other, once.
 *   orienteering: choose three 6★ and three 5★; the chosen 6★ share 100%, the chosen 5★
 *                 60%.
 */
import rules from '@/data/pull-odds-rules.json';

interface VerifiedPool { name: string; source: string }
export interface OddsRules {
  version: 1;
  limited: Record<string, VerifiedPool & { bonus: string; returning300: string[]; returning200: string[] }>;
  crossover: Record<string, VerifiedPool>;
  orienteering: Record<string, VerifiedPool>;
}
export const ODDS_RULES = rules as OddsRules;
export const LIMITED_RULES = ODDS_RULES.limited;
type LimitedRules = Omit<(typeof LIMITED_RULES)[string], 'name'>;

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

const CROSSOVER_SOURCES = Object.fromEntries(Object.entries(ODDS_RULES.crossover).map(([id, pool]) => [id, pool.source]));
const ORIENTEERING_SOURCES = Object.fromEntries(Object.entries(ODDS_RULES.orienteering).map(([id, pool]) => [id, pool.source]));
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
    const type = limited ? 'limited' : crossover ? 'crossover' : raw.pull_type === 'featured' && banner.ruleType === 'SINGLE' ? 'single' : ORIENTEERING_SOURCES[banner.poolId] ? 'orienteering' : null;
    if (!type || !raw.six_stars.length || !raw.five_stars.length) continue; // unknown special rules need verification
    // The schedule's Global days, at the server reset (04:00 UTC-7) that opens and closes them:
    // the instants a Kernel Addition Date is read at (kernelMoveInstant).
    const run = { start: new Date(`${banner.start}T11:00:00Z`), end: new Date(`${banner.end}T11:00:00Z`) };
    const ordinarySix = buildEligiblePool(pools.six, obtain, release, kernel, run, false, new Set(raw.six_stars)).map(op => op.name);
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
      sources: [limited?.source || crossover || ORIENTEERING_SOURCES[banner.poolId] || 'https://ak.hypergryph.com/news/2023033352'],
      ...(limited ? { bonus: limited.bonus, ordinarySix } : {}),
    };
  }
  return result;
}

/** The verified rules a pool needs before the planner gives it odds, by its id: LIMITED_*
 *  limited, LINKAGE_* crossover (P3 Reload's is pull_type "limited" but LINKAGE_), and a
 *  SPECIAL_* pool named Orienteering. Any other pool (Kernel, Standard, a Joint banner) has
 *  no model to verify rules for. */
export function rulesKindFor(poolId: string | null | undefined, name: string): keyof Omit<OddsRules, 'version'> | null {
  if (!poolId) return null;
  if (poolId.startsWith('LIMITED_')) return 'limited';
  if (poolId.startsWith('LINKAGE_')) return 'crossover';
  if (poolId.startsWith('SPECIAL_') && /orienteering/i.test(name)) return 'orienteering';
  return null;
}

/**
 * The scheduled banners the planner shows without odds for want of verified rules, each
 * with why: its pool is not in data/pull-odds-rules.json, or its limited rules name a
 * character id no operator record has (resolveLimitedRules). A verified pool without odds
 * for another reason -- its lineup not listed yet -- is not one of these: the lineup
 * arrives with the data, and the completeness stage holds a banner that lacks one.
 */
export function unverifiedBanners(schedule: readonly UpcomingBanner[], odds: Readonly<Record<string, BannerOdds>>): { banner: UpcomingBanner; kind: keyof Omit<OddsRules, 'version'>; reason: string }[] {
  const nameOf = new Map(getAllOperators().filter(op => op.internalName).map(op => [op.internalName!, op.name]));
  return schedule.flatMap(banner => {
    const kind = rulesKindFor(banner.poolId, banner.name);
    if (!kind || odds[banner.name]) return [];
    const verified = ODDS_RULES[kind][banner.poolId!];
    if (!verified) {
      return [{ banner, kind, reason: `${banner.name}: the pull planner shows this ${kind} banner without odds until confirmed supported rules are imported under "${kind}" in data/pull-odds-rules.json (arkpedia-data, source/data/pull-odds-rules.json); incomplete or changed mechanics need review` }];
    }
    const resolved = kind === 'limited' ? resolveLimitedRules(verified as OddsRules['limited'][string], nameOf) : null;
    if (resolved && 'missing' in resolved) {
      return [{ banner, kind, reason: `${banner.name}: its rules in data/pull-odds-rules.json name ${resolved.missing.join(', ')}, which no operator record has, so the pull planner shows it without odds` }];
    }
    return [];
  });
}
