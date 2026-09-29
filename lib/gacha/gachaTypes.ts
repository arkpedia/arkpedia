export type Rarity = 6 | 5 | 4 | 3;

export type BannerType =
  | 'featured'
  | 'limited'
  | 'standard'
  | 'kernel'
  | 'kernelLocating'
  | 'joint'
  | 'orienteering'
  | 'celebration'
  | 'crossover'
  | 'trio';

export interface GachaItem {
  name: string;
  icon: string | null; // path under /public, or null if no icon found
}

export interface PulledItem extends GachaItem {
  rarity: Rarity;
  isFeatured: boolean;
  isRateUp?: boolean; // Limited banners: the 3 "off-banner rate-up" 6-stars, distinct from the 2 true featured ones
  isBonus?: boolean; // e.g. the 300-pull limited guarantee grant
  featuredGuaranteeEvent?: 'reset' | 'guarantee'; // Featured banner only: 'reset' if this natural pull reset the 150-counter for next time, 'guarantee' if the 150-pull hard pity is what delivered this pull
  crossoverFiveStarGuarantee?: boolean; // Crossover banner only: true if this pull is the guaranteed completion of the pair (the other featured 5-star, delivered right after the first one was obtained)
}

export interface BannerConfig {
  type: BannerType;
  label: string;
  description: string;
  // Meaning depends on banner type (see gachaEngine.ts for exactly how
  // many of each are used per type).
  sixStarFeatured: GachaItem[];
  fiveStarFeatured: GachaItem[];
  otherSixStarPool: GachaItem[];
  otherFiveStarPool: GachaItem[];
  // Limited banners only: the "off-banner rate-up" six-stars -- 3 older
  // limited 6-stars from the same series that share a boosted 5x-weighted
  // portion of the remaining 30% pool, distinct from sixStarFeatured
  // (the first 2, at 35% each) and from otherSixStarPool (everyone else,
  // sharing at 1x weight).
  rateUpSixStars?: GachaItem[];
  // Of the two Limited-featured six-stars, only ONE is genuinely
  // Limited-exclusive forever -- the other's howToObtain says Standard
  // Headhunting despite co-debuting, meaning it eventually joins the
  // standard pool. The 300-pull guarantee must only ever grant the true
  // Limited one, never the one that returns to standard.
  limitedExclusiveSixStar?: GachaItem;
  fourStarFeatured?: GachaItem[]; // if set, these share 50% of the 4-star pool; everyone else shares the other 50%
  fourStarPool: GachaItem[]; // "everyone else" when fourStarFeatured is set, otherwise the full 4-star pool
  threeStarPool: GachaItem[];
}

export interface GachaState {
  pullCount: number; // total pulls this session (this banner)
  softPitySince6: number; // pulls since last 6-star (drives the 50+ soft pity ramp)
  // The "at least one 5-star-or-better in your first 10 pulls" guarantee
  // is a ONE-TIME safety net, not a recurring pity -- once it fires
  // (naturally or forced at pull 10), it never triggers again for the
  // rest of this banner session. A 6-star counts too, since it's "at
  // least" a 5-star.
  firstTenGuaranteeUsed: boolean;
  pullsSinceFeatured6Star: number; // Featured banner: pulls since the featured 6-star was last obtained
  featuredGuaranteeUsed: boolean; // Featured banner: the 150-pull guarantee is a ONE-TIME safety net per session, never recurs once fired -- confirmed correct
  limitedObtained: boolean; // Limited banner: whether the limited 6-star has been obtained at least once (natural pull or the 300-pull bonus) -- informational, does NOT gate the guarantee below
  limitedGuaranteeGranted: boolean; // Limited banner: whether the 300-pull bonus COPY has specifically been granted -- independent of limitedObtained, since a natural pull before 300 should NOT skip the bonus copy
  // Crossover rules, as each crossover's announcement states them (ak.hypergryph.com/news/1457,
  // 7377, 9699): the featured 6-star is guaranteed within every 120 pulls, the count starting
  // over each time it is obtained -- it recurs, unlike Featured's one-time 150; if no rate-up
  // 5-star came in the first 50 pulls, the next 5-star is a rate-up one; and with two rate-up
  // 5-stars, the next 5-star after the first of them is the other, once.
  pullsSinceCrossover6Star: number;
  crossoverFiveStarSeen: boolean; // a rate-up 5-star has been obtained, so the 50-pull rule no longer applies
  crossoverFiveStarObtainedName: string | null;
  crossoverFiveStarPairCompleted: boolean; // ONE-TIME, same family as firstTenGuaranteeUsed/featuredGuaranteeUsed -- once the pair has been completed, obtaining either one again later must NOT re-lock the next 5-star roll to the other one a second time
  obtainedCounts: Record<string, number>; // per-operator name -> how many times obtained this session
  history: PulledItem[];
}

export function createInitialState(): GachaState {
  return {
    pullCount: 0,
    softPitySince6: 0,
    firstTenGuaranteeUsed: false,
    pullsSinceFeatured6Star: 0,
    featuredGuaranteeUsed: false,
    limitedObtained: false,
    limitedGuaranteeGranted: false,
    pullsSinceCrossover6Star: 0,
    crossoverFiveStarSeen: false,
    crossoverFiveStarObtainedName: null,
    crossoverFiveStarPairCompleted: false,
    obtainedCounts: {},
    history: [],
  };
}