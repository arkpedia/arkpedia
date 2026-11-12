import { FactoryProduct } from './baseTypes';

/** Grey productivity: 1.01 for the first operator, +0.01 flat for each
 * additional one (2 operators -> 1.02, 3 operators -> 1.03). 0 if empty. */
export function calcGreyProductivity(filledCount: number): number {
  if (filledCount <= 0) return 0;
  return 1.01 + (filledCount - 1) * 0.01;
}

// Confirmed by the user: unlike Factory/Trading Post's headcount-only
// grey baseline, Reception Room's base speed is genuinely per-operator
// -- rarity and promotion level each contribute their own bonus. Every
// slotted operator adds a flat +5% just for being there, UNCONDITIONALLY
// -- this applies on top of their own skill's bonus too, not only when
// they lack one (corrected: an earlier version of this gated the +5% on
// "no skill", which was wrong). Starts at 100% with nobody slotted, but
// the caller should treat 0 filled as "don't show yet" (the room can't
// actually operate empty), same as Factory/Trading Post's grey returning
// 0 when empty.
function receptionRoomRarityBonus(rarity: number | null): number {
  if (rarity === 6) return 0.05;
  if (rarity === 5) return 0.04;
  if (rarity === 4) return 0.02;
  return 0; // 1-3 star, or unknown
}
function receptionRoomEliteBonus(eliteLevel: string | null): number {
  if (eliteLevel === 'Elite 2') return 0.16;
  if (eliteLevel === 'Elite 1') return 0.08;
  return 0; // Base/E0, or unknown
}
/** One slotted operator's three separate contributions to the room's base
 * speed. Split out rather than pre-summed so the breakdown panel can name each
 * one -- "+25%" for an Elite 2 5-star tells a reader nothing about which part
 * came from the promotion and which from the rarity. calcReceptionRoomBaseSpeed
 * below sums exactly these, so the panel and the number can never disagree. */
export interface ReceptionRoomBaseContribution {
  slotted: number; // flat, just for occupying a slot -- applies even with no skill
  rarity: number;
  elite: number;
}

export function receptionRoomBaseContribution(
  op: { rarity: number | null; eliteLevel: string | null; exhausted?: boolean }
): ReceptionRoomBaseContribution {
  return {
    slotted: op.exhausted ? 0 : 0.05,
    rarity: receptionRoomRarityBonus(op.rarity),
    elite: receptionRoomEliteBonus(op.eliteLevel),
  };
}

export function calcReceptionRoomBaseSpeed(operators: { rarity: number | null; eliteLevel: string | null; exhausted?: boolean }[]): number {
  if (operators.length === 0) return 0;
  let total = 1.0;
  for (const op of operators) {
    const c = receptionRoomBaseContribution(op);
    total += c.slotted + c.rarity + c.elite;
  }
  return total;
}

// Trading Post's analogue to Factory's Capacity Limit. Confirmed by the
// user: base order limit scales by level -- 6 at Level 1, 8 at Level 2,
// 10 at Level 3. Previously a flat, unconfirmed guess of 10 regardless
// of level (see the old comment this replaced: "no confirmed base
// value was given for this one").
const ORDER_LIMIT_BY_LEVEL: Record<number, number> = {
  1: 6,
  2: 8,
  3: 10,
};

/** A Trading Post's order limit before skills, by level. */
export function tradingPostBaseOrderLimit(level: number): number {
  return ORDER_LIMIT_BY_LEVEL[level] ?? ORDER_LIMIT_BY_LEVEL[3];
}

// Per-item cost to produce each Factory product.
export const FACTORY_PRODUCT_COSTS: Record<FactoryProduct, { capacityPerItem: number; hoursPerItem: number }> = {
  'Battle Records': { capacityPerItem: 5, hoursPerItem: 3 },
  'Precious Metals': { capacityPerItem: 2, hoursPerItem: 1 + 12 / 60 }, // 1:12:00
  // Placeholder only -- Originium Shards isn't selectable in the UI yet
  // (see base.tsx), so this is never actually reached in practice, but
  // TypeScript requires every FactoryProduct member to have an entry
  // here regardless. Replace with real values once the feature is
  // actually exposed.
  'Originium Shards': { capacityPerItem: 2, hoursPerItem: 1 + 12 / 60 },
};

/** Time until the Factory's capacity is completely full, assuming
 * continuous production at the current productivity rate. Higher
 * productivity means faster production, so less time per item. */
export function calcFullTime(
  effectiveCapacity: number,
  effectiveProductivity: number,
  product: FactoryProduct | null
): number | null {
  if (!product || effectiveCapacity <= 0) return null;
  const costs = FACTORY_PRODUCT_COSTS[product];
  if (effectiveProductivity <= 0) return null;
  const timePerItem = costs.hoursPerItem / effectiveProductivity;
  const itemsToFill = Math.floor(effectiveCapacity / costs.capacityPerItem);
  return itemsToFill * timePerItem;
}

/** Items produced per day, assuming continuous collection so production
 * never actually stalls waiting on capacity -- used for the daily
 * EXP/LMD averages, which explicitly assume this. */
export function calcDailyProduction(effectiveProductivity: number, product: FactoryProduct): number {
  if (effectiveProductivity <= 0) return 0;
  const costs = FACTORY_PRODUCT_COSTS[product];
  const timePerItem = costs.hoursPerItem / effectiveProductivity;
  return 24 / timePerItem;
}

export interface ControlCenterEffects {
  tradingPostBonus: number; // highest single value among CC operators, not summed
  factoryBonus: number; // highest single value among CC operators, not summed
  clueCollectionBonus: number; // highest single value among CC operators, not summed
  ccMoraleBonus: number; // sum -- this one DOES stack, per your instruction
}

/** Flat headcount-based bonus: every operator physically assigned to
 * Control Center reduces morale LOSS in every OTHER facility by 0.05/hr,
 * regardless of that operator's actual skills. Stacks with operator
 * count, and is separate from (and in addition to) the skill-driven
 * ccMoraleBonus above, which only affects Control Center's own morale. */
export function calcControlCenterMoraleRelief(ccOperatorCount: number): number {
  return ccOperatorCount * 0.05;
}

// Trading Post's random gold-order spawns: each spawn is 2, 3, or 4 gold
// with these probabilities, taking this long to generate. Used to
// compute an EXPECTED (average) fill rate toward the order limit.
const TRADING_POST_GOLD_SCENARIOS = [
  { gold: 2, probability: 0.3, minutes: 144 },
  { gold: 3, probability: 0.5, minutes: 210 },
  { gold: 4, probability: 0.2, minutes: 276 },
];


/** The "higher-yield chance" family (Bena/Bibeak/Diamante/Kafka/Paprika/
 * Shamare/Mitm) shifts the underlying gold-spawn PROBABILITIES
 * themselves, unlike Proviso/Tequila which change the gold amount or
 * LMD per scenario while keeping the base probabilities. Confirmed by
 * the user: lower tier (highest-only among lower-tier operators) uses
 * 15/30/55, higher tier (highest-only among higher-tier operators, and
 * takes precedence over lower tier when both present) uses 5/10/85.
 * Timing (minutes) per scenario is unaffected -- only which scenario is
 * more or less likely to occur. */
const TRADING_POST_GOLD_SCENARIOS_LOWER_TIER = [
  { gold: 2, probability: 0.15, minutes: 144 },
  { gold: 3, probability: 0.3, minutes: 210 },
  { gold: 4, probability: 0.55, minutes: 276 },
];
// Confirmed by the user: stacking TWO different lower-tier ("Tailoring
// alpha" family) operators simultaneously shifts the distribution
// further still, to its own distinct 13/22/65 split -- not just two
// separate 15/30/55 effects added together, and not the same as a
// single higher-tier ("Tailoring beta") operator's 5/10/85 either.
const TRADING_POST_GOLD_SCENARIOS_DOUBLE_LOWER_TIER = [
  { gold: 2, probability: 0.13, minutes: 144 },
  { gold: 3, probability: 0.22, minutes: 210 },
  { gold: 4, probability: 0.65, minutes: 276 },
];
const TRADING_POST_GOLD_SCENARIOS_HIGHER_TIER = [
  { gold: 2, probability: 0.05, minutes: 144 },
  { gold: 3, probability: 0.1, minutes: 210 },
  { gold: 4, probability: 0.85, minutes: 276 },
];

export type GoldOrderTier = 'base' | 'lower' | 'doubleLower' | 'higher';
export function tradingPostGoldScenarios(tier: GoldOrderTier = 'base', level = 3) {
  if (level <= 1) return [{ gold: 2, probability: 1, minutes: 144 }];
  if (level === 2 && tier === 'base') return [{ gold: 2, probability: 0.6, minutes: 144 }, { gold: 3, probability: 0.4, minutes: 210 }];
  return tier === 'higher' ? TRADING_POST_GOLD_SCENARIOS_HIGHER_TIER
    : tier === 'doubleLower' ? TRADING_POST_GOLD_SCENARIOS_DOUBLE_LOWER_TIER
    : tier === 'lower' ? TRADING_POST_GOLD_SCENARIOS_LOWER_TIER : TRADING_POST_GOLD_SCENARIOS;
}
export function tradingPostExpectedMinutes(tier: GoldOrderTier = 'base', level = 3) {
  return tradingPostGoldScenarios(tier, level).reduce((sum, s) => sum + s.minutes * s.probability, 0);
}
/** Proviso ("Contract Law" + "Damages for Breach") and Tequila
 * ("Investment") both react to the SAME underlying gold-spawn scenarios
 * but on genuinely disjoint subsets -- confirmed mutually exclusive by
 * the user: Proviso only boosts scenarios under 4 gold (Defaulted),
 * Tequila's bonus only fires on the scenario at or above 4 gold
 * (explicitly NOT Defaulted trades). Proviso's boosted gold still
 * counts as Defaulted and still sells at the standard rate (handled by
 * the caller multiplying goldPerHour by 500) -- it does not promote a
 * trade out of Defaulted status. Tequila's bonus is a flat LMD add-on
 * per qualifying trade, not a gold-count change, so it's returned
 * separately rather than folded into goldPerHour.
 *
 * Uses the requested order-value tier
 * so Tailoring's distribution shift stays in effect even when Proviso
 * and/or Tequila are ALSO present -- confirmed by the user this was
 * previously being silently dropped whenever Proviso or Tequila showed
 * up, since the caller was choosing one mechanic or the other instead
 * of combining them. */
export function calcTradingPostGoldAndLmdPerHour(
  effectiveProductivity: number,
  provisoGoldBonus: number,
  tequilaLmdBonus: number,
  tier: GoldOrderTier = 'base',
  level = 3
): { goldPerHour: number; extraLmdPerHour: number } {
  if (effectiveProductivity <= 0) return { goldPerHour: 0, extraLmdPerHour: 0 };
  const scenarios = tradingPostGoldScenarios(tier, level);
  const expectedGold = scenarios.reduce((sum, s) => sum + (s.gold < 4 ? s.gold + provisoGoldBonus : s.gold) * s.probability, 0);
  const expectedMinutes = scenarios.reduce((sum, s) => sum + (s.minutes / effectiveProductivity) * s.probability, 0);
  const tradesPerHour = 1 / (expectedMinutes / 60);
  const expectedTequilaLmdPerTrade = scenarios.reduce((sum, s) => sum + (s.gold >= 4 ? tequilaLmdBonus * s.probability : 0), 0);
  return {
    goldPerHour: expectedGold / (expectedMinutes / 60),
    extraLmdPerHour: expectedTequilaLmdPerTrade * tradesPerHour,
  };
}

/** U-Official's "Naive Negotiator" standardizes every Pure Gold trade in
 * her Trading Post to a fixed amount (not the normal probabilistic 2/3/4
 * outcome), while explicitly NOT counting as a Defaulted trade. Reuses
 * the same timing/probability distribution -- only the gold amount per
 * trade changes, not how often trades happen. */
export function calcTradingPostGoldPerHourStandardized(effectiveProductivity: number, fixedGold: number, level = 3): number {
  if (effectiveProductivity <= 0) return 0;
  const expectedMinutes = tradingPostGoldScenarios('base', level).reduce(
    (sum, s) => sum + (s.minutes / effectiveProductivity) * s.probability,
    0
  );
  return fixedGold / (expectedMinutes / 60);
}

/** Orders per hour -- deliberately NOT weighted by gold count, since a
 * spawn yielding 2, 3, or 4 gold still only consumes ONE order-limit
 * slot. This is purely about how often a new order appears, regardless
 * of its size. */
export function calcTradingPostOrdersPerHour(effectiveProductivity: number, level = 3, tier: GoldOrderTier = 'base', fixedMinutes?: number): number {
  if (effectiveProductivity <= 0) return 0;
  const expectedMinutes = (fixedMinutes ?? tradingPostExpectedMinutes(tier, level)) / effectiveProductivity;
  return 1 / (expectedMinutes / 60);
}

/** Time until Trading Post's order limit fills up, on average -- uses
 * the ORDER rate (one order = one slot), not the gold-weighted rate. */
export function calcTradingPostFullTime(effectiveOrderLimit: number, effectiveProductivity: number, level = 3, tier: GoldOrderTier = 'base', fixedMinutes?: number): number | null {
  const ordersPerHour = calcTradingPostOrdersPerHour(effectiveProductivity, level, tier, fixedMinutes);
  if (ordersPerHour <= 0 || effectiveOrderLimit <= 0) return null;
  return effectiveOrderLimit / ordersPerHour;
}

/** Time until operators need to enter the dormitory due to morale
 * depletion. Base morale pool is 24 (matching the 24-hour baseline at
 * the default 1.00/hr consumption rate) -- a higher combined consumption
 * rate shortens this, a lower one extends it. */
const BASE_MORALE_POOL = 24;

export function calcDeadTime(combinedMoraleRate: number): number | null {
  if (combinedMoraleRate <= 0) return null; // never depletes
  return BASE_MORALE_POOL / combinedMoraleRate;
}

// Dormitory morale recovery -- confirmed by the user: the base rate
// (before any skill bonuses) depends on BOTH the room's level and its
// "ambience", an in-game furnishing stat this simulator has no way to
// derive from furniture choices, so the player sets it directly per
// Dormitory. Recovery rises linearly with ambience up to that level's
// own cap; past the cap, more ambience does nothing further.
//
// Game building_data.dormData: capped rooms recover 2/2.5/3/3.5/4 Morale/hr.
const DORMITORY_RECOVERY_BASE_BY_LEVEL: Record<number, number> = {
  1: 1.6,
  2: 1.7,
  3: 1.8,
  4: 1.9,
  5: 2.0,
};
const DORMITORY_AMBIENCE_CAP_BY_LEVEL: Record<number, number> = {
  1: 1000,
  2: 2000,
  3: 3000,
  4: 4000,
  5: 5000, // building_data.dormData.phases[4].decorationLimit
};
const DORMITORY_AMBIENCE_RATE = 0.0004; // Morale/hr per point of ambience, confirmed constant across every level

export function dormitoryAmbienceCap(level: number): number {
  if (level <= 0) return 0;
  return DORMITORY_AMBIENCE_CAP_BY_LEVEL[level] ?? DORMITORY_AMBIENCE_CAP_BY_LEVEL[5];
}

/** Default ambience for a Dormitory the player hasn't explicitly set --
 * "capped towards the level" per the user's own words, i.e. fully
 * furnished by default. Matches the same always-maximally-built
 * convention already used elsewhere in this codebase (Dormitory level
 * itself defaults to max, Senshi's meal count assumed max level before
 * that was made level-aware too, etc.). */
export function defaultDormitoryAmbience(level: number): number {
  return dormitoryAmbienceCap(level);
}

export function calcDormitoryRecovery(level: number, ambience: number): number {
  if (level <= 0) return 0;
  const base = DORMITORY_RECOVERY_BASE_BY_LEVEL[level] ?? DORMITORY_RECOVERY_BASE_BY_LEVEL[5];
  const cap = dormitoryAmbienceCap(level);
  const effectiveAmbience = Math.max(0, Math.min(ambience, cap));
  return base + DORMITORY_AMBIENCE_RATE * effectiveAmbience;
}
// Confirmed by the user: Factory base capacity scales by level -- 24 at
// Level 1, 36 at Level 2, 54 at Level 3.
const FACTORY_CAPACITY_BY_LEVEL: Record<number, number> = {
  1: 24,
  2: 36,
  3: 54,
};

/** A Factory's capacity before skills, by level. */
export function factoryBaseCapacity(level: number): number {
  return FACTORY_CAPACITY_BY_LEVEL[level] ?? FACTORY_CAPACITY_BY_LEVEL[3];
}

/** Grey morale consumption: 1.00/hr base, -0.05 for every operator after the first (3 operators -> 0.90/hr).
 * Applies to any facility, not just Factory/Trading Post. Each operator's own change and the room-wide ones come
 * from the skill table and are added by the calculator. */
export function greyMoraleRate(filledCount: number): number {
  return filledCount > 0 ? Math.max(0, 1 - 0.05 * (filledCount - 1)) : 0;
}
