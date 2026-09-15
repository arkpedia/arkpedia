import { BannerConfig, GachaItem, GachaState, PulledItem, Rarity } from './gachaTypes';

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

function pickFromPool(pool: GachaItem[], rand: number): GachaItem {
  if (pool.length === 0) return { name: 'Unknown Operator', icon: null };
  const idx = Math.min(pool.length - 1, Math.floor(rand * pool.length));
  return pool[idx];
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
export function sixStarWeightedPool(banner: BannerConfig): { item: GachaItem; weight: number; tag: 'featured' | 'rateUp' | 'other' }[] {
  const feat = banner.sixStarFeatured;
  const others = banner.otherSixStarPool;
  const rateUp = banner.rateUpSixStars || [];

  switch (banner.type) {
    case 'featured':
      return [
        { item: feat[0], weight: 0.5, tag: 'featured' },
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length), tag: 'other' as const })),
      ];
    case 'limited': {
      const rateUpWeight = 0.3 * (rateUp.length > 0 ? 5 / (5 * rateUp.length + others.length) : 0);
      const otherWeight = 0.3 * (others.length > 0 ? 1 / (5 * rateUp.length + others.length) : 0);
      return [
        { item: feat[0], weight: 0.35, tag: 'featured' },
        { item: feat[1], weight: 0.35, tag: 'featured' },
        ...rateUp.map((o) => ({ item: o, weight: rateUpWeight, tag: 'rateUp' as const })),
        ...others.map((o) => ({ item: o, weight: otherWeight, tag: 'other' as const })),
      ];
    }
    case 'standard':
    case 'kernel':
      return [
        { item: feat[0], weight: 0.25, tag: 'featured' },
        { item: feat[1], weight: 0.25, tag: 'featured' },
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length), tag: 'other' as const })),
      ];
    case 'joint':
      return feat.slice(0, 4).map((o) => ({ item: o, weight: 0.25, tag: 'featured' as const }));
    case 'orienteering':
      return feat.slice(0, 3).map((o) => ({ item: o, weight: 1 / 3, tag: 'featured' as const }));
    case 'celebration':
      return feat.map((o) => ({ item: o, weight: 1 / Math.max(1, feat.length), tag: 'featured' as const }));
    case 'crossover':
      return [
        { item: feat[0], weight: 0.5, tag: 'featured' },
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length), tag: 'other' as const })),
      ];
    case 'trio':
      return feat.slice(0, 3).map((o) => ({ item: o, weight: 1 / 3, tag: 'featured' as const }));
    case 'kernelLocating':
      return [
        ...feat.map((o) => ({ item: o, weight: 0.5 / Math.max(1, feat.length), tag: 'featured' as const })),
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length), tag: 'other' as const })),
      ];
    default:
      return feat.map((o) => ({ item: o, weight: 1 / Math.max(1, feat.length), tag: 'featured' as const }));
  }
}

function pickSixStar(banner: BannerConfig, state: GachaState, rand: number): { item: GachaItem; isFeatured: boolean; isRateUp: boolean } {
  const feat = banner.sixStarFeatured;

  if (banner.type === 'featured' && !state.featuredGuaranteeUsed && state.pullsSinceFeatured6Star >= 150) {
    return { item: feat[0], isFeatured: true, isRateUp: false };
  }
  if (banner.type === 'crossover' && !state.crossoverGuaranteeUsed && state.pullsSinceCrossover6Star >= 120) {
    return { item: feat[0], isFeatured: true, isRateUp: false };
  }

  const pool = sixStarWeightedPool(banner);
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
      return [
        ...feat.map((o) => ({ item: o, weight: 0.5 / Math.max(1, feat.length) })),
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length) })),
      ];
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
      return [
        ...feat.slice(0, 2).map((o) => ({ item: o, weight: 0.5 / Math.max(1, feat.length) })),
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length) })),
      ];
    }
    case 'standard':
    case 'kernel':
      return [
        ...feat.map((o) => ({ item: o, weight: 0.5 / Math.max(1, feat.length) })),
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length) })),
      ];
    case 'joint':
      return feat.slice(0, 6).map((o) => ({ item: o, weight: 1 / 6 }));
    case 'orienteering':
      // The 3 chosen share 60%; the 3 NOT chosen stay pullable too,
      // sharing the remaining 40% -- unlike six-stars, five-stars here
      // aren't all-or-nothing on the player's picks.
      return [
        ...feat.map((o) => ({ item: o, weight: 0.6 / Math.max(1, feat.length) })),
        ...others.map((o) => ({ item: o, weight: 0.4 / Math.max(1, others.length) })),
      ];
    case 'trio':
      return feat.slice(0, 3).map((o) => ({ item: o, weight: 1 / 3 }));
    case 'kernelLocating':
      return [
        ...feat.map((o) => ({ item: o, weight: 0.5 / Math.max(1, feat.length) })),
        ...others.map((o) => ({ item: o, weight: 0.5 / Math.max(1, others.length) })),
      ];
    default:
      return feat.map((o) => ({ item: o, weight: 1 / Math.max(1, feat.length) }));
  }
}

function pickFiveStar(banner: BannerConfig, state: GachaState, rand: number): { item: GachaItem; isFeatured: boolean } {
  const feat = banner.fiveStarFeatured;
  const others = banner.otherFiveStarPool;

  switch (banner.type) {
    case 'featured':
    case 'limited':
    case 'celebration': {
      const pool = fiveStarWeightedPool(banner);
      const picked = pickWeighted(pool, rand);
      return { item: picked, isFeatured: banner.fiveStarFeatured.some((f) => f.name === picked.name) };
    }
    case 'crossover': {
      const pool = fiveStarWeightedPool(banner, state.crossoverFiveStarObtainedName);
      const picked = pickWeighted(pool, rand);
      return { item: picked, isFeatured: banner.fiveStarFeatured.some((f) => f.name === picked.name) };
    }
    case 'standard':
    case 'kernel': {
      const pool = fiveStarWeightedPool(banner);
      const picked = pickWeighted(
        pool.map((p) => ({ item: p, weight: p.weight })),
        rand
      );
      return { item: picked.item, isFeatured: banner.fiveStarFeatured.some((f) => f.name === picked.item.name) };
    }
    case 'joint': {
      const idx = Math.min(5, Math.floor(rand * 6));
      return { item: feat[idx], isFeatured: true };
    }
    case 'orienteering': {
      const pool = fiveStarWeightedPool(banner);
      const picked = pickWeighted(pool, rand);
      return { item: picked, isFeatured: feat.some((f) => f.name === picked.name) };
    }
    case 'trio': {
      const idx = Math.min(2, Math.floor(rand * 3));
      return { item: feat[idx], isFeatured: true };
    }
    case 'kernelLocating': {
      const idx = Math.min(2, Math.floor(rand * 3));
      return { item: feat[idx], isFeatured: true };
    }
  }
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

  const rarity = rollRarity(state.softPitySince6, forced, Math.random());
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
    if (banner.type === 'crossover' && isFeatured) {
      state.crossoverGuaranteeUsed = true;
      state.pullsSinceCrossover6Star = 0;
    }
    if (banner.type === 'limited' && item.name === limitedTarget?.name) state.limitedObtained = true;
  } else if (rarity === 5) {
    const { item, isFeatured } = pickFiveStar(banner, state, Math.random());
    items.push({ ...item, rarity: 5, isFeatured });
    recordObtained(item.name);
    state.softPitySince6 += 1;
    state.firstTenGuaranteeUsed = true;
    if (banner.type === 'crossover' && isFeatured) {
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