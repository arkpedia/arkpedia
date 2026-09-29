import { isLineupPending } from './bannerLineup';
import { BannerConfig, GachaItem, GachaState, PulledItem, Rarity } from './gachaTypes';
import type { HeadhuntingBanner } from './headhuntingBanners';

export const BASE_RATES = { six: 0.02, five: 0.08, four: 0.5, three: 0.4 };

/** Returns the actual four rarity rates at a given pull number (1-indexed,
 * matching softPitySince6 + 1 the way rollRarity uses it) -- same formula,
 * exported so the UI can show the real ramp curve without duplicating it. */
export function ratesAtPull(pullNumber: number): { six: number; five: number; four: number; three: number } {
  let six = BASE_RATES.six;
  if (pullNumber > 50) {
    six = Math.min(1, BASE_RATES.six + 0.02 * (pullNumber - 50));
  }
  const remaining = 1 - six;
  const ratioBase = BASE_RATES.five + BASE_RATES.four + BASE_RATES.three;
  return {
    six,
    five: remaining * (BASE_RATES.five / ratioBase),
    four: remaining * (BASE_RATES.four / ratioBase),
    three: remaining * (BASE_RATES.three / ratioBase),
  };
}

function pickWeighted<T>(items: { item: T; weight: number }[], rand: number): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = rand * total;
  for (const { item, weight } of items) {
    if (r < weight) return item;
    r -= weight;
  }
  return items[items.length - 1].item;
}

/** What a pull lands on when a rarity has no one to give: a banner whose lineup is
 * not known yet, or whose only listed operator the eligibility rules removed. The
 * page does not offer pulls then (simulatorPullable), so this only keeps a stray call
 * from throwing on `undefined.name`. */
const UNKNOWN_OPERATOR: GachaItem = { name: 'Unknown Operator', icon: null };

function pickFromPool(pool: GachaItem[], rand: number): GachaItem {
  if (pool.length === 0) return UNKNOWN_OPERATOR;
  const idx = Math.min(pool.length - 1, Math.floor(rand * pool.length));
  return pool[idx];
}

type SixStarTag = 'featured' | 'rateUp' | 'other';
export type WeightedSixStar = { item: GachaItem; weight: number; tag: SixStarTag };

/** Weights that add up to 1, or an empty pool. Every rate the page shows as "% of
 * 6★" is read straight off these, so a lineup shorter than its banner type expects
 * must not leave the shares summing to less than 1. */
function normalise<T extends { weight: number }>(pool: T[]): T[] {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  return total > 0 ? pool.map((p) => ({ ...p, weight: p.weight / total })) : [];
}

/**
 * Featured slots at their stated share, and the rest of the pool sharing what is left.
 *
 * A slot's share belongs to the operator in it. A slot the lineup does not fill -- a
 * Standard banner out before its two rate-ups are named, a Celebration Kernel banner
 * with no 6★ rate-up at all, a kernel banner whose listed operator is not
 * kernel-eligible -- has no one to land on, so its share goes back to the rest of the
 * pool, in the rest's own proportions (a Limited banner's 5x rate-ups keep their 5x).
 * It does not go to the other featured operator: one rate-up on a Standard banner is
 * 25%, whether or not the second has been announced. With no rest to take it, the
 * featured operators that exist share the whole.
 *
 * `rest` weights are relative to each other only.
 */
function allocate(
  slots: { item: GachaItem | undefined; share: number }[],
  rest: { item: GachaItem; weight: number; tag: SixStarTag }[],
): WeightedSixStar[] {
  const featured = slots.flatMap(({ item, share }) => (item ? [{ item, weight: share, tag: 'featured' as const }] : []));
  const assigned = featured.reduce((sum, p) => sum + p.weight, 0);
  const restTotal = rest.reduce((sum, p) => sum + p.weight, 0);
  const remaining = Math.max(0, 1 - assigned);
  const shared = restTotal > 0 ? rest.map((p) => ({ ...p, weight: (p.weight / restTotal) * remaining })) : [];
  return normalise([...featured, ...shared]);
}

/** Every one of `items` at an equal share: the featured-only banner types. */
function evenly(items: GachaItem[]): WeightedSixStar[] {
  return normalise(items.filter(Boolean).map((item) => ({ item, weight: 1, tag: 'featured' as const })));
}

/**
 * Rolls the rarity for a single pull, given how many pulls it's been
 * since the last 6-star (drives soft pity from pull 51 onward) and
 * whether this pull is the one-time "first 10 pulls" guarantee firing.
 */
function rollRarity(softPitySince6: number, forcedFivePlus: boolean, rand: number): Rarity {
  const pullNumber = softPitySince6 + 1;
  let sixChance = BASE_RATES.six;
  if (pullNumber > 50) {
    sixChance = Math.min(1, BASE_RATES.six + 0.02 * (pullNumber - 50));
  }

  if (forcedFivePlus) {
    // At least a 5-star -- a 6-star also satisfies this, split by the
    // normal 6-star chance at this point in the pull sequence.
    return rand < sixChance ? 6 : 5;
  }

  const remaining = 1 - sixChance;
  const ratioBase = BASE_RATES.five + BASE_RATES.four + BASE_RATES.three; // 0.98
  const fiveChance = remaining * (BASE_RATES.five / ratioBase);
  const fourChance = remaining * (BASE_RATES.four / ratioBase);

  if (rand < sixChance) return 6;
  if (rand < sixChance + fiveChance) return 5;
  if (rand < sixChance + fiveChance + fourChance) return 4;
  return 3;
}

/** Builds the weighted six-star pool for a given banner, exactly as
 * pickSixStar uses it -- exported so the UI can compute "if you got a
 * 6-star, what's the chance it's this one" for each operator shown. */
export function sixStarWeightedPool(banner: BannerConfig): WeightedSixStar[] {
  const feat = banner.sixStarFeatured;
  const others = banner.otherSixStarPool.map((item) => ({ item, weight: 1, tag: 'other' as const }));
  const rateUp = banner.rateUpSixStars || [];

  switch (banner.type) {
    case 'featured':
    case 'crossover':
      return allocate([{ item: feat[0], share: 0.5 }], others);
    case 'limited':
      // The two featured at 35% each; the remaining 30% (plus any unfilled featured
      // slot) split 5:1 between the returning rate-ups and everyone else.
      return allocate(
        [{ item: feat[0], share: 0.35 }, { item: feat[1], share: 0.35 }],
        [...rateUp.map((item) => ({ item, weight: 5, tag: 'rateUp' as const })), ...others],
      );
    case 'standard':
    case 'kernel':
      return allocate([{ item: feat[0], share: 0.25 }, { item: feat[1], share: 0.25 }], others);
    case 'joint':
      return evenly(feat.slice(0, 4));
    case 'orienteering':
    case 'trio':
      return evenly(feat.slice(0, 3));
    case 'kernelLocating':
      return allocate(feat.map((item) => ({ item, share: 0.5 / Math.max(1, feat.length) })), others);
    case 'celebration':
    default:
      return evenly(feat);
  }
}

function pickSixStar(banner: BannerConfig, state: GachaState, rand: number): { item: GachaItem; isFeatured: boolean; isRateUp: boolean } {
  const feat = banner.sixStarFeatured;

  // A guarantee grants the featured operator, so there must be one to grant.
  if (banner.type === 'featured' && feat[0] && !state.featuredGuaranteeUsed && state.pullsSinceFeatured6Star >= 150) {
    return { item: feat[0], isFeatured: true, isRateUp: false };
  }
  if (banner.type === 'crossover' && feat[0] && state.pullsSinceCrossover6Star >= 120) {
    return { item: feat[0], isFeatured: true, isRateUp: false };
  }

  const pool = sixStarWeightedPool(banner);
  if (pool.length === 0) return { item: UNKNOWN_OPERATOR, isFeatured: false, isRateUp: false };
  const picked = pickWeighted(
    pool.map((p) => ({ item: p, weight: p.weight })),
    rand
  );
  return { item: picked.item, isFeatured: picked.tag === 'featured', isRateUp: picked.tag === 'rateUp' };
}

function pickFourStar(banner: BannerConfig, rand: number): { item: GachaItem; isFeatured: boolean } {
  const feat = banner.fourStarFeatured;
  if (feat && feat.length > 0) {
    if (rand < 0.5) return { item: pickFromPool(feat, rand / 0.5), isFeatured: true };
    return { item: pickFromPool(banner.fourStarPool, (rand - 0.5) / 0.5), isFeatured: false };
  }
  return { item: pickFromPool(banner.fourStarPool, rand), isFeatured: false };
}

/** Two groups sharing a rarity's chance: `featured` split evenly over `share`, and
 * `others` split evenly over the rest. When either group is empty the other takes
 * the whole, the same reading allocate() gives the six-stars. */
function split(featured: GachaItem[], share: number, others: GachaItem[]): { item: GachaItem; weight: number }[] {
  return normalise([
    ...featured.map((item) => ({ item, weight: share / featured.length })),
    ...others.map((item) => ({ item, weight: (1 - share) / others.length })),
  ]);
}

/** Same idea as sixStarWeightedPool, for five-stars -- exported so the
 * UI can show "if you got a 5-star, what's the chance it's this one"
 * for each featured operator too. */
export function fiveStarWeightedPool(banner: BannerConfig, crossoverObtainedName: string | null = null): { item: GachaItem; weight: number }[] {
  const feat = banner.fiveStarFeatured;
  const others = banner.otherFiveStarPool;

  switch (banner.type) {
    case 'featured':
    case 'limited':
    case 'celebration':
    case 'standard':
    case 'kernel':
    case 'kernelLocating':
      return split(feat, 0.5, others);
    case 'crossover': {
      // Two featured 5-stars that guarantee-complete each other: once
      // one is obtained, every subsequent 5-star roll is 100% the other
      // one -- no more randomness between the pair, no "others" mixing.
      if (crossoverObtainedName && feat.some((f) => f.name === crossoverObtainedName)) {
        const missing = feat.find((f) => f.name !== crossoverObtainedName);
        return missing ? [{ item: missing, weight: 1 }] : feat.map((o) => ({ item: o, weight: 1 / feat.length }));
      }
      // Before either featured one is obtained: the featured pair
      // shares 50% of the 5-star chance equally between them (whether
      // it's 1 or 2 of them), with the other 50% going to off-banner
      // 5-stars -- confirmed: they do NOT take 100% just because
      // there's no "others" mixing once you already have one.
      return split(feat.slice(0, 2), 0.5, others);
    }
    case 'joint':
      return split(feat.slice(0, 6), 1, []);
    case 'orienteering':
      // The 3 chosen share 60%; the 3 NOT chosen stay pullable too,
      // sharing the remaining 40% -- unlike six-stars, five-stars here
      // aren't all-or-nothing on the player's picks.
      return split(feat, 0.6, others);
    case 'trio':
      return split(feat.slice(0, 3), 1, []);
    default:
      return split(feat, 1, []);
  }
}

function pickFiveStar(banner: BannerConfig, state: GachaState, rand: number): { item: GachaItem; isFeatured: boolean } {
  const feat = banner.fiveStarFeatured;
  const isFeatured = (item: GachaItem) => feat.some((f) => f.name === item.name);

  switch (banner.type) {
    // A fixed count of featured five-stars, one of which every 5★ is. The count is
    // what the lineup holds, not what the banner type promises: a Joint banner
    // listed with five of its six would otherwise land on feat[5], undefined.
    case 'joint':
      return { item: pickFromPool(feat.slice(0, 6), rand), isFeatured: true };
    case 'trio':
    case 'kernelLocating':
      return { item: pickFromPool(feat.slice(0, 3), rand), isFeatured: true };
    default: {
      // No rate-up 5-star in the first 50 pulls: the next 5-star is one of them. The pair
      // rule never overlaps it, since it starts only once a rate-up 5-star has come.
      if (banner.type === 'crossover' && !state.crossoverFiveStarSeen && state.pullCount > 50 && feat.length) {
        return { item: pickFromPool(feat.slice(0, 2), rand), isFeatured: true };
      }
      const pool = fiveStarWeightedPool(banner, banner.type === 'crossover' ? state.crossoverFiveStarObtainedName : null);
      if (pool.length === 0) return { item: UNKNOWN_OPERATOR, isFeatured: false };
      const picked = pickWeighted(pool, rand);
      return { item: picked, isFeatured: isFeatured(picked) };
    }
  }
}

/** Whether the simulator offers pulls on a banner. Not while its lineup is
 * pending: the banner is announced but its rate-ups are not named, and a
 * simulation without them would show every operator at the wrong rate -- the
 * whole point of a banner is who it features. Not when no 6★ can drop at all
 * either. A banner whose featured list is merely short (a Celebration Kernel
 * banner lists no 6★ rate-up) is pullable: the unfilled slots' share goes to the
 * rest of the pool (allocate). */
export function simulatorPullable(source: Pick<HeadhuntingBanner, 'lineupSource'>, banner: BannerConfig): boolean {
  return !isLineupPending(source) && sixStarWeightedPool(banner).length > 0;
}

/**
 * Executes a single pull, returning new state (original left untouched)
 * plus the pulled item(s) -- normally one, but two if a hard-pity bonus
 * (e.g. the Limited banner's 300-pull guarantee) fires on the same pull.
 */
export function doSinglePull(banner: BannerConfig, prevState: GachaState): { state: GachaState; items: PulledItem[] } {
  const state: GachaState = { ...prevState, history: [...prevState.history] };
  const items: PulledItem[] = [];

  state.pullCount += 1;
  state.pullsSinceFeatured6Star += 1;
  state.pullsSinceCrossover6Star += 1;
  // One-time guarantee: only fires if it hasn't already been used, and
  // only within the first 10 pulls of this banner session.
  const forced = !state.firstTenGuaranteeUsed && state.pullCount === 10;

  // The 120th pull since a crossover's featured 6-star is that 6-star: the guarantee forces
  // the rarity too, not just who a 6-star rolled on or after it is. The roll is still drawn,
  // so every pull draws the same number of times.
  const crossoverDue = banner.type === 'crossover' && Boolean(banner.sixStarFeatured[0]) && state.pullsSinceCrossover6Star >= 120;
  const rarityRoll = Math.random();
  const rarity = crossoverDue ? 6 : rollRarity(state.softPitySince6, forced, rarityRoll);
  const limitedTarget = banner.limitedExclusiveSixStar || banner.sixStarFeatured[1];

  function recordObtained(name: string) {
    state.obtainedCounts = { ...state.obtainedCounts, [name]: (state.obtainedCounts[name] || 0) + 1 };
  }

  if (rarity === 6) {
    const { item, isFeatured, isRateUp } = pickSixStar(banner, state, Math.random());
    items.push({ ...item, rarity: 6, isFeatured, isRateUp });
    recordObtained(item.name);
    state.softPitySince6 = 0;
    state.firstTenGuaranteeUsed = true; // a 6-star is "at least a 5-star" -- consumes the guarantee too
    if (banner.type === 'featured' && isFeatured) {
      const guaranteeAlreadyUsedBeforeThisPull = state.featuredGuaranteeUsed;
      if (state.pullsSinceFeatured6Star >= 150) {
        // The guarantee is what just fired -- one-time use, never resets.
        state.featuredGuaranteeUsed = true;
        if (!guaranteeAlreadyUsedBeforeThisPull) items[items.length - 1].featuredGuaranteeEvent = 'guarantee';
      } else {
        state.pullsSinceFeatured6Star = 0;
        if (!guaranteeAlreadyUsedBeforeThisPull) items[items.length - 1].featuredGuaranteeEvent = 'reset';
      }
    }
    // Every featured 6-star starts the 120 over: the guarantee recurs.
    if (banner.type === 'crossover' && isFeatured) state.pullsSinceCrossover6Star = 0;
    if (banner.type === 'limited' && item.name === limitedTarget?.name) state.limitedObtained = true;
  } else if (rarity === 5) {
    const { item, isFeatured } = pickFiveStar(banner, state, Math.random());
    items.push({ ...item, rarity: 5, isFeatured });
    recordObtained(item.name);
    state.softPitySince6 += 1;
    state.firstTenGuaranteeUsed = true;
    if (banner.type === 'crossover' && isFeatured) {
      state.crossoverFiveStarSeen = true;
      if (!state.crossoverFiveStarObtainedName && !state.crossoverFiveStarPairCompleted) {
        // First of the pair obtained -- lock the NEXT pull to guarantee
        // whichever one is still missing. Only applies if the pair
        // hasn't already been fully completed once this session.
        state.crossoverFiveStarObtainedName = item.name;
      } else if (state.crossoverFiveStarObtainedName && item.name !== state.crossoverFiveStarObtainedName) {
        // The previously-missing one was just obtained, completing the
        // pair. This was a one-time guarantee, not a permanent lock --
        // reset back to normal 50/50 between the two for any future
        // pulls, and mark the pair as completed so this guarantee can
        // never re-trigger later this session.
        items[items.length - 1].crossoverFiveStarGuarantee = true;
        state.crossoverFiveStarObtainedName = null;
        state.crossoverFiveStarPairCompleted = true;
      }
    }
  } else if (rarity === 4) {
    const item = pickFourStar(banner, Math.random());
    items.push({ ...item.item, rarity: 4, isFeatured: item.isFeatured });
    recordObtained(item.item.name);
    state.softPitySince6 += 1;
  } else {
    const item = pickFromPool(banner.threeStarPool, Math.random());
    items.push({ ...item, rarity: 3, isFeatured: false });
    recordObtained(item.name);
    state.softPitySince6 += 1;
  }

  // Limited banner: guaranteed copy of the TRUE Limited-exclusive
  // six-star at 300 pulls (never the one that returns to the standard
  // pool), granted as a bonus alongside whatever this pull's own result
  // was -- ticks down every pull regardless of whether a featured
  // 6-star was hit along the way, since it's driven by pullCount alone.
  if (banner.type === 'limited' && !state.limitedGuaranteeGranted && state.pullCount >= 300 && limitedTarget) {
    items.push({ ...limitedTarget, rarity: 6, isFeatured: true, isBonus: true });
    recordObtained(limitedTarget.name);
    state.limitedObtained = true;
    state.limitedGuaranteeGranted = true;
  }

  state.history = [...state.history, ...items];
  return { state, items };
}

export function doPulls(banner: BannerConfig, prevState: GachaState, count: number): { state: GachaState; items: PulledItem[] } {
  let state = prevState;
  const allItems: PulledItem[] = [];
  for (let i = 0; i < count; i++) {
    const result = doSinglePull(banner, state);
    state = result.state;
    allItems.push(...result.items);
  }
  return { state, items: allItems };
}