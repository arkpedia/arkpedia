import { FactoryProduct, ProductivityResult, CapacityResult, MoraleResult } from './baseTypes';

/** Grey productivity: 1.01 for the first operator, +0.01 flat for each
 * additional one (2 operators -> 1.02, 3 operators -> 1.03). 0 if empty. */
export function calcGreyProductivity(filledCount: number): number {
  if (filledCount <= 0) return 0;
  return 1.01 + (filledCount - 1) * 0.01;
}

// Allows an optional leading "-" directly on the number, so skills that
// REDUCE productivity (e.g. "productivity -5%") are captured correctly,
// not just ones that increase it.
const PRODUCTIVITY_PATTERN = /productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const ORDER_ACQUISITION_PATTERN = /order acquisition[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const BATTLE_RECORDS_PATTERN = /battle record/i;
const PRECIOUS_METALS_PATTERN = /precious metal/i;
const ORIGINIUM_FORMULA_PATTERN = /originium formula/i;

/** Trading Post: any skill mentioning "Order Acquisition" + a percentage
 * contributes that percentage (as a decimal) to yellow productivity. */
export function tradingPostYellowContribution(description: string | null): number {
  if (!description) return 0;
  const match = description.match(ORDER_ACQUISITION_PATTERN);
  if (!match) return 0;
  return parseFloat(match[1]) / 100;
}

/** Factory: any skill mentioning "productivity" + a percentage contributes
 * -- UNLESS it specifically names Battle Records or Precious Metals, in
 * which case it only counts if that's the factory's currently selected
 * product. Can be negative (a skill that reduces productivity). */
export function factoryYellowContribution(
  description: string | null,
  selectedProduct: FactoryProduct | null
): number {
  if (!description) return 0;
  const match = description.match(PRODUCTIVITY_PATTERN);
  if (!match) return 0;
  const pct = parseFloat(match[1]) / 100;

  const mentionsBattleRecords = BATTLE_RECORDS_PATTERN.test(description);
  const mentionsPreciousMetals = PRECIOUS_METALS_PATTERN.test(description);
  const mentionsOriginiumFormula = ORIGINIUM_FORMULA_PATTERN.test(description);

  if (mentionsBattleRecords && selectedProduct !== 'Battle Records') return 0;
  if (mentionsPreciousMetals && selectedProduct !== 'Precious Metals') return 0;
  if (mentionsOriginiumFormula && selectedProduct !== 'Originium Shards') return 0;
  return pct;
}

/** Computes total grey + yellow productivity for a Factory or Trading Post,
 * given the SPECIFIC skill each assigned operator is using (not all their
 * skills for that facility -- only the elite-level variant actually
 * placed contributes, per your instruction). */
export function calcProductivity(
  facilityKind: 'factory' | 'tradingPost',
  assignedSkillDescriptions: (string | null)[], // one entry per filled slot, the SELECTED skill's description
  filledCount: number,
  selectedProduct: FactoryProduct | null
): ProductivityResult {
  const grey = calcGreyProductivity(filledCount);
  let yellow = 0;

  for (const description of assignedSkillDescriptions) {
    yellow +=
      facilityKind === 'factory'
        ? factoryYellowContribution(description, selectedProduct)
        : tradingPostYellowContribution(description);
  }

  return { grey, yellow };
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

// Confirmed against real scraped data (Reception Room skill text seen
// earlier: "...increases Clue search speed by 15%...").
const CLUE_SPEED_PATTERN = /clue search speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;

/** Reception Room: sums any "Clue search speed" percentage bonuses
 * across assigned skills. Purely additive -- unlike Factory/Trading
 * Post there's no inherent per-operator baseline, just the skill bonus. */
export function calcClueSpeed(assignedSkillDescriptions: (string | null)[]): number {
  let total = 0;
  for (const description of assignedSkillDescriptions) {
    if (!description) continue;
    const match = description.match(CLUE_SPEED_PATTERN);
    if (match) total += parseFloat(match[1]) / 100;
  }
  return total;
}

// Trading Post's analogue to Factory's Capacity Limit. Confirmed by the
// user: base order limit scales by level -- 6 at Level 1, 8 at Level 2,
// 10 at Level 3. Previously a flat, unconfirmed guess of 10 regardless
// of level (see the old comment this replaced: "no confirmed base
// value was given for this one").
const ORDER_LIMIT_PATTERN = /order limit[^.\d+-]{0,10}?([+-]\d+)/i;

const ORDER_LIMIT_BY_LEVEL: Record<number, number> = {
  1: 6,
  2: 8,
  3: 10,
};

export function calcOrderLimit(assignedSkillDescriptions: (string | null)[], level: number): CapacityResult {
  let adjustment = 0;
  for (const description of assignedSkillDescriptions) {
    if (!description) continue;
    const match = description.match(ORDER_LIMIT_PATTERN);
    if (match) adjustment += parseInt(match[1], 10);
  }
  return { base: ORDER_LIMIT_BY_LEVEL[level] ?? ORDER_LIMIT_BY_LEVEL[3], adjustment };
}

// Power Plant: either phrasing contributes to the same yellow bubble.
const DRONE_PATTERN = /(?:drone recovery rate|drone charging speed)[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;

export function calcDroneRate(assignedSkillDescriptions: (string | null)[]): number {
  let total = 0;
  for (const description of assignedSkillDescriptions) {
    if (!description) continue;
    const match = description.match(DRONE_PATTERN);
    if (match) total += parseFloat(match[1]) / 100;
  }
  return total;
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

// NOTE: unlike Clue Search Speed and "morale consumed per hour" above,
// I don't have confirmed real examples of these three Control Center
// skill phrasings -- built from your description, not verified against
// actual scraped text. If a real skill's wording doesn't match, send it
// to me and I'll correct the pattern.
const ORDER_EFFICIENCY_PATTERN = /order efficiency[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const CC_FACTORY_PATTERN = /factor(?:y|ies)[^%]{0,40}?productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const CLUE_COLLECTION_PATTERN = /clue collection speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const CC_MORALE_INCREASE_PATTERN = /increase[s]? morale[^%\d]{0,60}?([+-]?\d+(?:\.\d+)?)\s*(?:per hour|\/\s*hr)/i;

export interface ControlCenterEffects {
  tradingPostBonus: number; // highest single value among CC operators, not summed
  factoryBonus: number; // highest single value among CC operators, not summed
  clueCollectionBonus: number; // highest single value among CC operators, not summed
  ccMoraleBonus: number; // sum -- this one DOES stack, per your instruction
}

/** One description's Clue Collection Speed value, using the same pattern
 * calcControlCenterEffects matches with. Exported so a caller can work out
 * WHICH Control Center operator won the highest-only pool without duplicating
 * the regex -- the Reception Room's breakdown named the source
 * "(Control Center) (generic)", which is accurate and useless when two
 * different operators are contributing two different bonuses. */
export function clueCollectionBonusFrom(description: string | null): number {
  if (!description) return 0;
  const match = description.match(CLUE_COLLECTION_PATTERN);
  return match ? parseFloat(match[1]) / 100 : 0;
}

/** Control Center's three global productivity/speed bonuses only ever
 * apply once, at whichever assigned operator has the highest value for
 * that specific bonus -- multiple operators with the same bonus type
 * don't stack. The self-morale bonus is the one exception that does
 * stack, as you specified. */
export function calcControlCenterEffects(ccDescriptions: (string | null)[]): ControlCenterEffects {
  let tradingPostBonus = 0;
  let factoryBonus = 0;
  let clueCollectionBonus = 0;
  let ccMoraleBonus = 0;

  for (const description of ccDescriptions) {
    if (!description) continue;

    const tpMatch = description.match(ORDER_EFFICIENCY_PATTERN);
    if (tpMatch) {
      const v = parseFloat(tpMatch[1]) / 100;
      if (Math.abs(v) > Math.abs(tradingPostBonus)) tradingPostBonus = v;
    }
    const facMatch = description.match(CC_FACTORY_PATTERN);
    if (facMatch) {
      const v = parseFloat(facMatch[1]) / 100;
      if (Math.abs(v) > Math.abs(factoryBonus)) factoryBonus = v;
    }
    const clueMatch = description.match(CLUE_COLLECTION_PATTERN);
    if (clueMatch) {
      const v = parseFloat(clueMatch[1]) / 100;
      if (Math.abs(v) > Math.abs(clueCollectionBonus)) clueCollectionBonus = v;
    }
    const moraleMatch = description.match(CC_MORALE_INCREASE_PATTERN);
    if (moraleMatch) {
      ccMoraleBonus += parseFloat(moraleMatch[1]); // stacks
    }
  }

  return { tradingPostBonus, factoryBonus, clueCollectionBonus, ccMoraleBonus };
}

/** Flat headcount-based bonus: every operator physically assigned to
 * Control Center reduces morale LOSS in every OTHER facility by 0.05/hr,
 * regardless of that operator's actual skills. Stacks with operator
 * count, and is separate from (and in addition to) the skill-driven
 * ccMoraleBonus above, which only affects Control Center's own morale. */
export function calcControlCenterMoraleRelief(ccOperatorCount: number): number {
  return ccOperatorCount * 0.05;
}

// NOTE: best-effort pattern, not confirmed against real scraped text --
// same caveat as the Control Center patterns above.
const HR_SPEED_PATTERN = /hr contacting speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i;
const OFFICE_BASE_REFRESH_HOURS = 12;

export interface OfficeResult {
  speed: number; // summed skill bonus, e.g. 0.40 for +40%
  refreshHours: number; // effective refresh interval after the speed bonus
}

/** Office: "HR contacting speed" shortens how often recruitment tags
 * refresh (base 12h). Office only has 1 slot, so there's no
 * stacking-vs-highest-only question to resolve -- at most one operator's
 * skill ever applies. */
export function calcOffice(assignedSkillDescriptions: (string | null)[]): OfficeResult {
  let speed = 0;
  for (const description of assignedSkillDescriptions) {
    if (!description) continue;
    const match = description.match(HR_SPEED_PATTERN);
    if (match) speed += parseFloat(match[1]) / 100;
  }
  const refreshHours = OFFICE_BASE_REFRESH_HOURS / (1 + speed);
  return { speed, refreshHours };
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
export function goldOrderTier(skills: { operatorName: string; skillName: string }[]): GoldOrderTier {
  const higher = new Set(['Tailoring β', 'Handicrafts β', "Appraiser's Means"]);
  const lower = new Set(['Tailoring α', 'Handicrafts α', "Appraiser's Eyes", 'Know the Ropes', "An Heiress's Eye"]);
  if (skills.some(s => higher.has(s.skillName))) return 'higher';
  const count = new Set(skills.filter(s => lower.has(s.skillName)).map(s => s.operatorName)).size;
  return count >= 2 ? 'doubleLower' : count === 1 ? 'lower' : 'base';
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
// confirmed real example of how a Capacity Limit adjustment actually reads
// in scraped skill text -- this is a best-effort pattern (the word
// "capacity" followed by a signed number before the next sentence ends).
// If a real skill's capacity wording doesn't match this, paste me the
// exact text and I'll fix the pattern precisely.
const CAPACITY_PATTERN = /capacity[^.]{0,30}?([+-]\d+)/i;

// Confirmed by the user: Factory base capacity scales by level -- 24 at
// Level 1, 36 at Level 2, 54 at Level 3. Previously a flat FACTORY_BASE_
// CAPACITY = 54 regardless of level, meaning every Factory was silently
// treated as fully built.
const FACTORY_CAPACITY_BY_LEVEL: Record<number, number> = {
  1: 24,
  2: 36,
  3: 54,
};

export function calcCapacity(assignedSkillDescriptions: (string | null)[], level: number): CapacityResult {
  let adjustment = 0;
  for (const description of assignedSkillDescriptions) {
    if (!description) continue;
    const match = description.match(CAPACITY_PATTERN);
    if (match) adjustment += parseInt(match[1], 10);
  }
  return { base: FACTORY_CAPACITY_BY_LEVEL[level] ?? FACTORY_CAPACITY_BY_LEVEL[3], adjustment };
}

/** Per-operator capacity contribution, keyed by operator name -- for
 * skills like Bubble's "Bigger is Better!" that scale off each OTHER
 * operator's own individual capacity increase, not the Factory-wide
 * total. */
export function calcCapacityPerOperator(assignedSkills: { operatorName: string; description: string | null }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const { operatorName, description } of assignedSkills) {
    if (!description) continue;
    const match = description.match(CAPACITY_PATTERN);
    if (match) result[operatorName] = (result[operatorName] || 0) + parseInt(match[1], 10);
  }
  return result;
}

// Confirmed against real scraped data (Reception Room skill text seen
// earlier: "...Morale consumed per hour +1").
const MORALE_PATTERN = /morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i;
// The rare room-wide case -- confirmed against the full uploaded skill
// list: only a handful of skills describe an effect on "Operators in
// the [Facility]" generally (with or without the literal word "all"),
// rather than the operator's own rate. Everything else is self-only.
const ALL_OPERATORS_MORALE_PATTERN = /morale (consumed per hour|loss)[^.]{0,20}?(of operators in the|of all operators)/i;
const ALL_OPERATORS_MORALE_VALUE_PATTERN = /(?:of (?:all )?operators in the [a-z\s]+?)\s*,?\s*([+-]?\d+(?:\.\d+)?)/i;

/** Grey morale consumption: 1.00/hr base, -0.05 for every operator after
 * the first (3 operators -> 1.00 - 0.05 - 0.05 = 0.90/hr). Applies to any
 * facility, not just Factory/Trading Post.
 *
 * Confirmed: outside of exactly one skill that explicitly says "all
 * Operators", every "Morale consumed per hour +/-X" skill in the game
 * only affects the operator who has it, not the whole room -- so this
 * now tracks each operator's own contribution separately rather than
 * summing everything into one shared room-wide number. */
export function calcMorale(
  filledCount: number,
  assignedSkills: { operatorName: string; description: string | null }[]
): MoraleResult {
  const grey = filledCount > 0 ? Math.max(0, 1 - 0.05 * (filledCount - 1)) : 0;

  const selfYellow: Record<string, number> = {};
  let allOperatorsYellow = 0;

  for (const { operatorName, description } of assignedSkills) {
    if (!description) continue;
    const isAllOperators = ALL_OPERATORS_MORALE_PATTERN.test(description);
    if (isAllOperators) {
      // The value sits right before the sentence/clause ends, e.g.
      // "...in the Factory -0.1" -- extract from the tail rather than
      // reusing MORALE_PATTERN's narrow gap, since "of all Operators in
      // the Factory" is much longer than 10 characters.
      const valueMatch = description.match(ALL_OPERATORS_MORALE_VALUE_PATTERN);
      if (valueMatch) allOperatorsYellow += parseFloat(valueMatch[1]);
      continue;
    }
    const match = description.match(MORALE_PATTERN);
    if (match) {
      selfYellow[operatorName] = (selfYellow[operatorName] || 0) + parseFloat(match[1]);
    }
  }

  return { grey, selfYellow, allOperatorsYellow };
}
