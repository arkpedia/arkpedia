import { BaseOperator, BaseSkill } from '../operators/operatorTypes';
import { TRADING_POST_SPECIAL_SKILLS, TradingPostContext } from './tradingPostSpecialSkills';
import { FACTORY_SPECIAL_SKILLS, FactorySkillContext } from './factorySpecialSkills';
import {
  calcProductivity,
  calcOrderLimit,
  calcDailyProduction,
  calcTradingPostGoldAndLmdPerHour,
  calcTradingPostGoldPerHourStandardized,
  tradingPostYellowContribution,
  factoryYellowContribution,
} from './baseProductivity';
import { toBaseRosters, type BaseRosters } from './baseGroupRosters';
import { ResourcePools } from './baseResources';

/** Every cross-room conditional (Gnosis in CC, Mulberry in Office, Kirin R
 * Yato/Rathalos S Noir Corne in CC, Senshi in Dormitory, SilverAsh the
 * Reignfrost in CC, Gummy in a Trading Post, etc.) is assumed TRUE
 * throughout this module, per explicit instruction -- this optimizer
 * answers "what's the best 3-operator ROOM setup", not "what's the best
 * whole-base layout", so support operators elsewhere never cost a slot
 * here and are simply assumed present. */
const DORMITORY_OPERATOR_COUNT = 8;
const WORLDLY_PLIGHT = 20 + DORMITORY_OPERATOR_COUNT; // Mulberry (Office, flat 20) + Mr. Nothing's own Dormitory-count contribution
const FELVINE = 8 + 2 * 2; // Kirin R Yato (+8) + Rathalos S Noir Corne (+2 per Soubo Adventurer in CC, 2 assumed present)
const MONSTER_MEAL = 5; // Senshi in a Dormitory, flat +5 (Level 5)

export function combinations<T>(arr: T[], k: number): T[][] {
  const results: T[][] = [];
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

// Was `const allOperators = getAllOperators();` -- ran at module import
// time, which required server-only fs access and made this whole module
// impossible to import client-side at all. Now injected via
// initializeOptimizerData(), called once from base.tsx using the operator
// data it already has client-side (from its own getStaticProps props) --
// this is what lets the optimizer/rotation-experiment react to the
// player's LIVE facility levels, set at runtime, rather than only ever
// running against build-time state.
let allOperators: BaseOperator[] = [];
// The group rosters, injected the same way: the page's copy from its props.
let rosters: BaseRosters = toBaseRosters({});

/** Must be called once, with real operator data, before anything else in
 * this module is used. Also invalidates every cached candidate pool
 * (TP_CANDIDATES etc. below), since those are derived FROM allOperators
 * and would otherwise keep serving stale/empty results computed before
 * this was called. */
export function initializeOptimizerData(operators: BaseOperator[], groupRosters: BaseRosters) {
  allOperators = operators;
  rosters = groupRosters;
  invalidateCandidateCaches();
}
function cleanSkillName(rawName: string | null): string | null {
  if (!rawName) return rawName;
  return rawName.split('Replaces')[0];
}
function findSkill(operatorName: string, matcher: (s: BaseSkill, cleanName: string | null) => boolean): BaseSkill | null {
  const op = allOperators.find((o) => o.name === operatorName);
  if (!op || !op.baseSkills) return null;
  return op.baseSkills.find((s) => matcher(s, cleanSkillName(s.name))) ?? null;
}

/** Candidate identifiers map to a REAL operator name + a matcher that
 * finds their real BaseSkill entry (by exact skill name, or by elite
 * level when the display name alone is ambiguous across tiers). The
 * resulting description text is fed through the SAME generic parsers
 * (calcProductivity/calcOrderLimit) or SAME special-case handler
 * dictionaries the live site uses -- nothing here re-derives a formula
 * by hand. */
export interface Candidate {
  operatorName: string;
  skills: { skillName: string; eliteLevel?: string }[]; // ALL skills this operator has for this facility, applied simultaneously
}

function skillTextForOne(operatorName: string, skillName: string, eliteLevel?: string): string | null {
  const skill = findSkill(operatorName, (s, cleanName) => cleanName === skillName && (!eliteLevel || s.eliteLevel === eliteLevel));
  return skill?.description ?? null;
}

const ELITE_PRIORITY: Record<string, number> = { 'Elite 2': 2, 'Elite 1': 1, Base: 0, 'Level 30': 0 };

/** Every skill an operator has for a given facility, assuming Elite 2 is
 * unlocked (matching this whole codebase's "always assume max
 * investment" convention). Skills that "Replace" an earlier tier are the
 * SAME ability slot -- only the highest tier is kept. Skills that don't
 * replace anything are a genuinely SEPARATE, concurrent ability that
 * applies at the same time (e.g. Degenbrecher has both "Imposing
 * Presence", which replaces "Intimidate", AND "Champion's Bearing",
 * which replaces nothing and unlocks alongside it -- both are active
 * together once she's placed, not a "pick one" choice). */
function allSkillsForOperator(operatorName: string, facility: 'Factory' | 'Trading Post'): BaseSkill[] {
  const op = allOperators.find((o) => o.name === operatorName);
  if (!op || !op.baseSkills) return [];
  const relevant = op.baseSkills.filter((s) => s.facility === facility && s.name);
  const groups = new Map<string, BaseSkill[]>();
  for (const s of relevant) {
    const raw = s.name ?? '';
    const replacesMatch = raw.match(/Replaces(.+)$/);
    const slotKey = replacesMatch ? replacesMatch[1] : cleanSkillName(raw) ?? raw;
    if (!groups.has(slotKey)) groups.set(slotKey, []);
    groups.get(slotKey)!.push(s);
  }
  const result: BaseSkill[] = [];
  for (const group of groups.values()) {
    const best = group.reduce((a, b) => ((ELITE_PRIORITY[b.eliteLevel ?? ''] ?? -1) > (ELITE_PRIORITY[a.eliteLevel ?? ''] ?? -1) ? b : a));
    result.push(best);
  }
  return result;
}

/** Auto-generates ONE candidate PER OPERATOR (not per skill) for every
 * operator with at least one skill at the given facility, pulling
 * directly from the real operator dataset -- this is what guarantees
 * every released operator is actually searchable, instead of depending
 * on a hand-maintained list that can silently miss operators (as
 * happened with Crownslayer) or point at a dead skill name (as happened
 * with Tragodia). An operator with multiple concurrent skills (e.g.
 * Degenbrecher's two Trading Post skills) still occupies exactly ONE
 * search slot, but contributes every one of those skills at once when
 * evaluated -- matching how placing a real operator actually works. */
const PRODUCTIVITY_CLAIM_PATTERN = /productivity/i;
const ORDER_CLAIM_PATTERN = /order acquisition|order limit/i;

const BATTLE_RECORDS_MENTION = /battle record/i;
const PRECIOUS_METALS_MENTION = /precious metal/i;
const UNRECOGNIZED_PRODUCT_CONDITIONAL = /\bformula\b/i; // e.g. "Originium formula related productivity" -- a real, different product type this optimizer doesn't model yet, not a bug to work around

function isSkillUnderstood(operatorName: string, skillName: string, facility: 'Factory' | 'Trading Post', description: string | null): boolean {
  const key = `${operatorName}|${skillName}`;
  if (facility === 'Trading Post' && key in TRADING_POST_SPECIAL_SKILLS) return true;
  if (facility === 'Factory' && key in FACTORY_SPECIAL_SKILLS) return true;
  if (!description) return false; // no description text at all to verify anything against
  if (facility === 'Trading Post') {
    // A skill that never claims an order-acquisition or order-limit effect
    // (e.g. pure recruit-slot or morale text) legitimately contributes
    // zero to this metric -- that's a real zero, not an unverified one.
    if (!ORDER_CLAIM_PATTERN.test(description)) return true;
    return tradingPostYellowContribution(description) !== 0 || calcOrderLimit([description], 3).adjustment !== 0;
  } else {
    if (!PRODUCTIVITY_CLAIM_PATTERN.test(description)) return true;
    // A product-conditional productivity claim tied to neither Battle
    // Records nor Precious Metals (e.g. "Originium formula") is explicitly
    // excluded -- it's a real, different mechanic scoped out on purpose,
    // not something to silently fall through as unconditional.
    if (UNRECOGNIZED_PRODUCT_CONDITIONAL.test(description) && !BATTLE_RECORDS_MENTION.test(description) && !PRECIOUS_METALS_MENTION.test(description)) return false;
    return factoryYellowContribution(description, 'Battle Records') !== 0 || factoryYellowContribution(description, 'Precious Metals') !== 0;
  }
}

/** Excludes a candidate ENTIRELY if any one of their skills for this
 * facility isn't understood -- no fallback, no silent zero. Since an
 * operator's skills all apply together, a single unmodeled skill means
 * the operator's TRUE combined effect can't be verified, so the whole
 * candidate is dropped rather than included with a partially-wrong
 * (understated) contribution. */
function filterToUnderstoodCandidates(candidates: Record<string, Candidate>, facility: 'Factory' | 'Trading Post'): Record<string, Candidate> {
  const result: Record<string, Candidate> = {};
  for (const [id, c] of Object.entries(candidates)) {
    const allUnderstood = c.skills.every((sk) => isSkillUnderstood(c.operatorName, sk.skillName, facility, skillTextForOne(c.operatorName, sk.skillName, sk.eliteLevel)));
    if (allUnderstood) result[id] = c;
  }
  return result;
}

/** Same grouping logic as allSkillsForOperator above, but restricted to
 * ONLY Base-tier (Elite 0) skills -- for the rotation experiment, which
 * assumes every operator is owned but nobody has been promoted, rather
 * than this module's normal "assume Elite 2 everywhere" convention. A
 * skill with no eliteLevel tag at all is treated as Base tier too,
 * since that's how an operator's only/default skill is represented. */
function eliteZeroSkillsForOperator(operatorName: string, facility: 'Factory' | 'Trading Post'): BaseSkill[] {
  const op = allOperators.find((o) => o.name === operatorName);
  if (!op || !op.baseSkills) return [];
  return op.baseSkills.filter((s) => s.facility === facility && s.name && (!s.eliteLevel || s.eliteLevel === 'Base' || s.eliteLevel === 'Level 30'));
}

function autoGenerateCandidates(facility: 'Factory' | 'Trading Post'): Record<string, Candidate> {
  const result: Record<string, Candidate> = {};
  for (const op of allOperators) {
    const skills = allSkillsForOperator(op.name, facility);
    if (skills.length === 0) continue;
    result[op.name] = {
      operatorName: op.name,
      skills: skills.map((s) => ({ skillName: cleanSkillName(s.name) ?? s.name ?? '', eliteLevel: s.eliteLevel ?? undefined })),
    };
  }
  return filterToUnderstoodCandidates(result, facility);
}

function autoGenerateEliteZeroCandidates(facility: 'Factory' | 'Trading Post'): Record<string, Candidate> {
  const result: Record<string, Candidate> = {};
  for (const op of allOperators) {
    const skills = eliteZeroSkillsForOperator(op.name, facility);
    if (skills.length === 0) continue;
    result[op.name] = {
      operatorName: op.name,
      skills: skills.map((s) => ({ skillName: cleanSkillName(s.name) ?? s.name ?? '', eliteLevel: s.eliteLevel ?? undefined })),
    };
  }
  return filterToUnderstoodCandidates(result, facility);
}

// ==================== TRADING POST candidates ====================
export let TP_CANDIDATES: Record<string, Candidate> = {};
export let TP_CANDIDATES_ELITE_ZERO: Record<string, Candidate> = {};

// Real "operatorName|skillName" keys, not candidate ID strings -- robust
// to however a candidate happens to be identified.
const TP_SELF_REFERENTIAL = new Set(['Snowsant|Heavenly Reward β', "Degenbrecher|Champion's Bearing", 'Swire the Elegant Wit|Investment Solicitations']);
const PROVISO_GOLD_BONUS: Record<string, number> = { 'Damages for Breach α': 1, 'Damages for Breach β': 2 };
const TEQUILA_LMD_BONUS: Record<string, number> = { 'Investment α': 250, 'Investment β': 500 };
const GOLD_TIER_HIGHER: Record<string, string> = { Bibeak: 'Tailoring β', Kafka: 'Handicrafts β', Paprika: 'Tailoring β', "Diamante": "Appraiser's Means" };
const GOLD_TIER_LOWER: Record<string, string> = { Bena: 'Tailoring α', Shamare: 'Tailoring α' }; // Bena and Shamare only ever have the LOWER-tier version -- Shamare's is a permanent, separate skill (not replaced at Elite 2, her E2 slot is "Whispers" instead), so she carries this alongside her override for as long as she's placed

export interface TpResult {
  combo: string[];
  effectiveProductivity: number | null;
  effectiveLimit: number | null;
  dailyGold: number;
  dailyLmd: number;
}

export interface DynamicContextOverrides {
  worldlyPlight?: number;
  dormitoryOperatorCount?: number;
  felvineTotal?: number;
  monsterMealTotal?: number;
  gummyInTradingPost?: boolean;
  ulpianusInBase?: boolean;
  facilitiesWithSuiOperator?: number;
  facilitiesWithEliteOperator?: number;
  allPlacedNames?: string[];
  robotPowerPlantCount?: number;
  ursusSpecialtyBeverageTotal?: number;
  blacksteelWorldwideCountInBase?: number;
  rhineLabCountInBase?: number;
  controlCenterFactoryBonus?: number; // Control Center's highest-single-value factory productivity bonus, meant to apply to every Factory in the base
  controlCenterTradingPostBonus?: number; // same, for order efficiency in every Trading Post
  gnosisInControlCenter?: boolean; // gates the Karlan Trade Trading Post bonus below -- same "assumed true, never verified" bug class as ulpianusInBase/gummyInTradingPost had
  gladiiaGroupHuntingActiveInCC?: boolean; // suppresses Waai Fu's Cooperative Will when true -- the numeric Group Hunting bonus itself is applied through the Control Center/Factory perFactoryProductivity pipeline, not through this context
  tradingPostLevel?: number; // this specific Trading Post's own level (1-3) -- feeds calcOrderLimit's level-dependent base value. Defaults to 3 (max) when unspecified, same "assume fully built" convention this whole module already uses for everything else.
}

function baseTpContext(overrides?: DynamicContextOverrides): Omit<TradingPostContext, 'sameRoomOperatorNames' | 'filledCountThisRoom' | 'othersOrderEfficiencySum' | 'othersOrderLimitRawSum' | 'genericOrderLimitAdjustment'> {
  const worldlyPlight = overrides?.worldlyPlight ?? WORLDLY_PLIGHT;
  const dormitoryOperatorCount = overrides?.dormitoryOperatorCount ?? DORMITORY_OPERATOR_COUNT;
  const monsterMealTotal = overrides?.monsterMealTotal ?? MONSTER_MEAL;
  // Terra Research Commission's Trading Post skill scales with Felvine, same
  // as its Factory skill -- the Factory path already used this constant.
  const felvineTotal = overrides?.felvineTotal ?? FELVINE;
  return {
    rosters,
    dormitoryOperatorCount,
    felvineTotal,
    distinctFactoryProductCount: 2,
    operatorFaction: () => null, // left as-is: I can't confirm this interface takes a parameter without visibility into factorySpecialSkills.ts/tradingPostSpecialSkills.ts, so I'm not guessing at a signature change here
    ulpianusInBase: overrides?.ulpianusInBase ?? true,
    facilitiesWithSuiOperator: overrides?.facilitiesWithSuiOperator ?? 3,
    facilitiesWithEliteOperator: overrides?.facilitiesWithEliteOperator ?? 5,
    resourceBonuses: {
      'Wind Chimes|Hell and High Water|morale_loss_reduction_base': Math.floor(worldlyPlight / 10) * 0.01,
      'Wind Chimes|Distant Letter|morale_loss_reduction_e2': Math.floor(worldlyPlight / 10) * 0.02,
      'Mr. Nothing|"Obvious Deception"|order_efficiency_pct': worldlyPlight * 1,
      'Ebenholz|Lingering Melody|order_efficiency_pct_base': Math.floor(dormitoryOperatorCount / 4) * 1,
      'Ebenholz|Harmony Astray|order_efficiency_pct_e2': Math.floor(dormitoryOperatorCount / 2) * 1,
    },
    monsterMealTotal,
    effectiveGoldLineCount: 2,
    allPlacedNames: overrides?.allPlacedNames ?? ['Ines', 'Ulpianus'],
  };
}

export function evalTradingPost(comboIds: string[], overrides?: DynamicContextOverrides, candidatePool: Record<string, Candidate> = TP_CANDIDATES): TpResult | null {
  const candidates = comboIds.map((id) => candidatePool[id]).filter((c): c is Candidate => !!c);
  if (candidates.length !== comboIds.length) return null;
  const realNames = candidates.map((c) => c.operatorName);
  if (new Set(realNames).size !== realNames.length) return null;

  const sameRoomOperatorNames = realNames;
  const genericDescriptions: (string | null)[] = [];
  const specialEntries: { operatorName: string; skillName: string; key: string }[] = [];
  for (const c of candidates) {
    for (const sk of c.skills) {
      const key = `${c.operatorName}|${sk.skillName}`;
      if (key in TRADING_POST_SPECIAL_SKILLS) {
        specialEntries.push({ operatorName: c.operatorName, skillName: sk.skillName, key });
      } else {
        genericDescriptions.push(skillTextForOne(c.operatorName, sk.skillName, sk.eliteLevel));
      }
    }
  }
  const pending = specialEntries.filter((e) => !TP_SELF_REFERENTIAL.has(`${e.operatorName}|${e.skillName}`));
  const deferred = specialEntries.filter((e) => TP_SELF_REFERENTIAL.has(`${e.operatorName}|${e.skillName}`));
  // Among the deferred group, only Jaye's "Basic Needs" ALSO produces an
  // orderLimit output of its own (her CAP reduction) -- Swire's
  // "Investment Solicitations" and Degenbrecher's "Champion's Bearing"
  // both read othersOrderLimitRawSum, so they need to see Jaye's real
  // reduction already netted in, not a pre-Jaye snapshot. Mirrors the
  // same fix applied in base.tsx's own Trading Post evaluation.
  const orderLimitAffectingDeferred = deferred.filter((e) => e.skillName === 'Basic Needs');
  const remainingDeferred = deferred.filter((e) => e.skillName !== 'Basic Needs');

  const prelimProd = calcProductivity('tradingPost', genericDescriptions, candidates.length, null);
  const prelimOrderLimit = calcOrderLimit(genericDescriptions, overrides?.tradingPostLevel ?? 3);
  let othersEff = prelimProd.yellow;
  let othersLimitRaw = prelimOrderLimit.adjustment;

  const base = baseTpContext(overrides);
  const results: ReturnType<(typeof TRADING_POST_SPECIAL_SKILLS)[string]>[] = [];
  for (const { key } of pending) {
    const result = TRADING_POST_SPECIAL_SKILLS[key]({ ...base, sameRoomOperatorNames, filledCountThisRoom: candidates.length });
    results.push(result);
    if (result.orderEfficiency) othersEff += result.orderEfficiency;
    if (result.orderLimit) othersLimitRaw += result.orderLimit;
  }
  for (const { key } of orderLimitAffectingDeferred) {
    const result = TRADING_POST_SPECIAL_SKILLS[key]({
      ...base,
      sameRoomOperatorNames,
      filledCountThisRoom: candidates.length,
      othersOrderEfficiencySum: othersEff,
      othersOrderLimitRawSum: othersLimitRaw,
      genericOrderLimitAdjustment: prelimOrderLimit.base + prelimOrderLimit.adjustment,
    });
    results.push(result);
    if (result.orderLimit) othersLimitRaw += result.orderLimit;
  }
  for (const { key } of remainingDeferred) {
    const result = TRADING_POST_SPECIAL_SKILLS[key]({
      ...base,
      sameRoomOperatorNames,
      filledCountThisRoom: candidates.length,
      othersOrderEfficiencySum: othersEff,
      othersOrderLimitRawSum: othersLimitRaw,
      genericOrderLimitAdjustment: prelimOrderLimit.base + prelimOrderLimit.adjustment,
    });
    results.push(result);
  }

  const karlanHere = realNames.filter((n) => rosters.KARLAN_TRADE.has(n)).length;
  const gnosisPresent = overrides?.gnosisInControlCenter ?? true; // defaults true for backward compatibility with callers (wholeBaseOptimizer.ts) that genuinely do place Gnosis unconditionally
  const gnosisEff = gnosisPresent ? -0.15 * karlanHere : 0;
  const gnosisLimit = gnosisPresent ? 6 * karlanHere : 0;

  const specialProductivitySum = results.reduce((s, r) => s + (r.orderEfficiency ?? 0), 0);
  const specialOrderLimitSum = results.reduce((s, r) => s + (r.orderLimit ?? 0), 0);
  const overrideActive = results.some((r) => r.overridesOthersEfficiency);
  const overrideSum = results.filter((r) => r.overridesOthersEfficiency).reduce((s, r) => s + (r.orderEfficiency ?? 0), 0);

  // Matches base.tsx exactly: if an override skill (e.g. Shamare's Whispers)
  // is active, the room's final yellow productivity is JUST the overriding
  // operator's own contribution (plus Gnosis's and Control Center's
  // cross-facility effects) -- every other operator's own orderEfficiency
  // is discarded entirely. Otherwise it's the normal generic + special sum.
  const controlCenterBonus = overrides?.controlCenterTradingPostBonus ?? 0;
  const finalYellow = overrideActive ? overrideSum + gnosisEff + controlCenterBonus : prelimProd.yellow + specialProductivitySum + gnosisEff + controlCenterBonus;
  const effectiveProductivity = Math.max(0, prelimProd.grey + finalYellow);
  const effectiveLimit = Math.max(1, prelimOrderLimit.base + prelimOrderLimit.adjustment + specialOrderLimitSum + gnosisLimit);

  // Non-standard gold mechanics, matching base.tsx's if/else-if precedence.
  // Detected off each candidate's REAL matched skill, not a hand-typed ID.
  const provisoCandidate = candidates.find((c) => c.operatorName === 'Proviso');
  const provisoSkill = provisoCandidate?.skills.find((s) => s.skillName in PROVISO_GOLD_BONUS);
  const tequilaCandidate = candidates.find((c) => c.operatorName === 'Tequila');
  const tequilaSkill = tequilaCandidate?.skills.find((s) => s.skillName in TEQUILA_LMD_BONUS);
  const hasHigherTier = candidates.some((c) => c.skills.some((s) => GOLD_TIER_HIGHER[c.operatorName] === s.skillName));
  // Counting DISTINCT operators, not just presence -- confirmed by the
  // user: two different lower-tier operators stacked together shift the
  // distribution further than either alone (its own distinct 13/22/65
  // split), not just a boolean "is anyone lower-tier present".
  const lowerTierCount = candidates.filter((c) => c.skills.some((s) => GOLD_TIER_LOWER[c.operatorName] === s.skillName)).length;
  const goldTier: 'base' | 'lower' | 'doubleLower' | 'higher' = hasHigherTier
    ? 'higher'
    : lowerTierCount >= 2
    ? 'doubleLower'
    : lowerTierCount === 1
    ? 'lower'
    : 'base';
  const isPepe = candidates.some((c) => c.operatorName === 'Pepe' && c.skills.some((s) => s.skillName === 'Insightful'));
  const isUOfficial = candidates.some((c) => c.operatorName === 'U-Official');

  let dailyGold: number;
  let dailyLmd: number;
  if (isPepe) {
    return { combo: comboIds, effectiveProductivity: null, effectiveLimit: null, dailyGold: 0, dailyLmd: (24 * 60 / 270) * 1000 };
  } else if (isUOfficial) {
    dailyGold = calcTradingPostGoldPerHourStandardized(effectiveProductivity, 2) * 24;
    dailyLmd = dailyGold * 500;
  } else {
    // Always the same combined call -- Tailoring's distribution tier,
    // Proviso's gold bonus, and Tequila's LMD bonus all apply together
    // regardless of which subset is actually present (0/0/'base' for
    // any that aren't), instead of a branching chain that could
    // silently drop one dimension when another is active.
    const { goldPerHour, extraLmdPerHour } = calcTradingPostGoldAndLmdPerHour(
      effectiveProductivity,
      provisoSkill ? PROVISO_GOLD_BONUS[provisoSkill.skillName] : 0,
      tequilaSkill ? TEQUILA_LMD_BONUS[tequilaSkill.skillName] : 0,
      goldTier
    );
    dailyGold = goldPerHour * 24;
    dailyLmd = dailyGold * 500 + extraLmdPerHour * 24;
  }

  return { combo: comboIds, effectiveProductivity, effectiveLimit, dailyGold, dailyLmd };
}

// ==================== FACTORY candidates ====================
export let FACTORY_CANDIDATES: Record<string, Candidate> = {};
export let FACTORY_CANDIDATES_ELITE_ZERO: Record<string, Candidate> = {};

/** Rebuilds all four candidate pools from the current allOperators.
 * Function declaration (hoisted), so it's safely callable from
 * initializeOptimizerData above even though it's defined below both
 * sets of pools it rebuilds -- by the time it's actually CALLED (from
 * base.tsx, after import), every export it assigns to already exists. */
function invalidateCandidateCaches() {
  TP_CANDIDATES = autoGenerateCandidates('Trading Post');
  TP_CANDIDATES_ELITE_ZERO = autoGenerateEliteZeroCandidates('Trading Post');
  FACTORY_CANDIDATES = autoGenerateCandidates('Factory');
  FACTORY_CANDIDATES_ELITE_ZERO = autoGenerateEliteZeroCandidates('Factory');
}

const GUMMY_IN_TRADING_POST = true;

function emptyResourcePools(): ResourcePools {
  return {
    passion: 0,
    worldlyPlight: WORLDLY_PLIGHT,
    soundlessResonance: DORMITORY_OPERATOR_COUNT,
    perceptionInformation: 0,
    intelligenceReserve: 0,
    memoryFragments: 0,
    witchcraftCrystal: Math.floor(WORLDLY_PLIGHT / 5),
    chainOfThought: DORMITORY_OPERATOR_COUNT,
    measure: 0,
    dreamland: 0,
  };
}

export interface FactoryResult {
  combo: string[];
  effectiveProductivity: number;
  dailyOutput: number;
}

export function evalFactory(comboIds: string[], product: 'Battle Records' | 'Precious Metals', overrides?: DynamicContextOverrides, candidatePool: Record<string, Candidate> = FACTORY_CANDIDATES): FactoryResult | null {
  const candidates = comboIds.map((id) => candidatePool[id]).filter((c): c is Candidate => !!c);
  if (candidates.length !== comboIds.length) return null;
  const realNames = candidates.map((c) => c.operatorName);
  if (new Set(realNames).size !== realNames.length) return null;

  const sameFactoryOperatorNames = realNames;
  const sameFactorySkillNames = candidates.flatMap((c) => c.skills.map((s) => s.skillName));
  const genericDescriptions: (string | null)[] = [];
  const specialEntries: { key: string }[] = [];
  for (const c of candidates) {
    for (const sk of c.skills) {
      const key = `${c.operatorName}|${sk.skillName}`;
      if (key in FACTORY_SPECIAL_SKILLS) {
        specialEntries.push({ key });
      } else {
        genericDescriptions.push(skillTextForOne(c.operatorName, sk.skillName, sk.eliteLevel));
      }
    }
  }

  const genericProd = calcProductivity('factory', genericDescriptions, candidates.length, product);
  let normalSum = genericProd.yellow;
  let exemptSum = 0;
  let overrideSum = 0;
  const hasOverride = specialEntries.some((e) => {
    const r = FACTORY_SPECIAL_SKILLS[e.key]({ ...emptyFactoryContext(sameFactoryOperatorNames, sameFactorySkillNames, product, overrides), eliteLevel: null });
    return r.overridesOthersProductivity;
  });

  for (const { key } of specialEntries) {
    const ctx = emptyFactoryContext(sameFactoryOperatorNames, sameFactorySkillNames, product, overrides);
    const result = FACTORY_SPECIAL_SKILLS[key]({ ...ctx, eliteLevel: null });
    if (result.overridesOthersProductivity) {
      overrideSum += result.productivity ?? 0;
    } else if (result.exemptFromOverride) {
      exemptSum += result.productivity ?? 0;
    } else {
      normalSum += result.productivity ?? 0;
    }
  }

  const controlCenterBonus = overrides?.controlCenterFactoryBonus ?? 0;
  const total = exemptSum + (hasOverride ? overrideSum : normalSum) + controlCenterBonus;
  const effectiveProductivity = Math.max(0, genericProd.grey + total);
  return { combo: comboIds, effectiveProductivity, dailyOutput: calcDailyProduction(effectiveProductivity, product) };
}

function emptyFactoryContext(sameFactoryOperatorNames: string[], sameFactorySkillNames: string[], product: 'Battle Records' | 'Precious Metals', overrides?: DynamicContextOverrides): Omit<FactorySkillContext, 'eliteLevel'> {
  const worldlyPlight = overrides?.worldlyPlight ?? WORLDLY_PLIGHT;
  const felvineTotal = overrides?.felvineTotal ?? FELVINE;
  const monsterMealTotal = overrides?.monsterMealTotal ?? MONSTER_MEAL;
  const gummyInTradingPost = overrides?.gummyInTradingPost ?? GUMMY_IN_TRADING_POST;
  return {
    rosters,
    selectedProduct: product,
    sameFactoryOperatorNames,
    sameFactorySkillNames,
    filledCountThisFactory: sameFactoryOperatorNames.length,
    tradingPostOperatorCount: 3,
    tradingPostCount: 2,
    powerPlantOperatorCount: 3,
    powerPlantCount: 3,
    robotPowerPlantCount: overrides?.robotPowerPlantCount ?? 2,
    operatorFaction: () => null,
    factionCountInBase: () => 3,
    dormitoryCount: 4,
    otherOperatorsCapacity: {},
    totalFactoryCapacityIncrease: 0,
    gladiiaGroupHuntingActiveInCC: overrides?.gladiiaGroupHuntingActiveInCC ?? false,
    felvineTotal,
    monsterMealTotal,
    ursusSpecialtyBeverageTotal: overrides?.ursusSpecialtyBeverageTotal ?? 1,
    blacksteelWorldwideCountInBase: overrides?.blacksteelWorldwideCountInBase ?? 2,
    rhineLabCountInBase: overrides?.rhineLabCountInBase ?? 5, // optimistic: assumes a full Rhine Lab squad (Nasti's own 5-cap), same simplification convention as the other assumed values in this standalone context
    resourcePools: emptyResourcePools(),
    resourceBonuses: {
      'Shu|Where Stalks Grow Deep, Autumn Reaps|productivity_pct': Math.floor(worldlyPlight / 3) * 1,
    },
    operatorInAnyTradingPost: (name: string) => (name === 'Gummy' && gummyInTradingPost ? { facilityId: 'tp1' } : null),
    rampWindowHours: 24, // optimistic: assumes ramping skills reach their capped value, same simplification flagged in the earlier standalone version
    selfMoraleRate: 0.01, // near-zero decay rate -> Totter's own morale-difference stays near 0 -> his BASE value, the optimistic case
  };
}

// ==================== Tier grouping (unchanged from before -- detects
// exact ties and separates the shared "core" from swappable
// "alternatives" instead of showing near-duplicate rows) ====================
export interface ConsolidatedOption<T> {
  fillers: string[]; // the operator(s) that fill the remaining slot(s) for this specific option
  score: number;
  example: T;
}
export interface ConsolidatedGroup<T> {
  core: string[]; // the recurring operator subset shared by every option below (or the full combo, if this setup never recurs with anyone else)
  options: ConsolidatedOption<T>[]; // ranked descending by score
}

function subsetsOmittingOne(combo: string[]): string[][] {
  return combo.map((_, omitIdx) => combo.filter((_, idx) => idx !== omitIdx));
}
function subsetKey(subset: string[]): string {
  return [...subset].sort().join('|||');
}

/** Finds the (comboLength - 1)-operator subset that recurs most often
 * across the WHOLE result set, groups every combo containing that exact
 * subset into one row (ranking the differing slot's fillers by score),
 * then repeats on whatever's left unclaimed. Combos that share no
 * recurring subset with anything else become their own standalone
 * single-option row. */
function consolidateByFrequentSubset<T extends { combo: string[] }>(sortedResults: T[], scoreFn: (r: T) => number, maxGroups: number): ConsolidatedGroup<T>[] {
  const n = sortedResults[0]?.combo.length ?? 0;
  if (n < 2) {
    return sortedResults.slice(0, maxGroups).map((r) => ({ core: r.combo, options: [{ fillers: [], score: scoreFn(r), example: r }] }));
  }

  // Build the subset -> member-indices index ONCE, up front, instead of
  // re-scanning the whole result array for every group (that was an
  // O(maxGroups * totalResults) scan and the actual cause of a 37-second
  // runtime -- this index makes each lookup O(1)).
  const subsetIndex = new Map<string, number[]>();
  for (let idx = 0; idx < sortedResults.length; idx++) {
    for (const subset of subsetsOmittingOne(sortedResults[idx].combo)) {
      const k = subsetKey(subset);
      if (!subsetIndex.has(k)) subsetIndex.set(k, []);
      subsetIndex.get(k)!.push(idx);
    }
  }

  const claimed = new Set<number>();
  const groups: ConsolidatedGroup<T>[] = [];

  for (let i = 0; i < sortedResults.length; i++) {
    if (claimed.has(i)) continue;
    if (groups.length >= maxGroups) break;
    const combo = sortedResults[i].combo;
    const subsets = subsetsOmittingOne(combo);
    let bestSubset = subsets[0];
    let bestCount = subsetIndex.get(subsetKey(bestSubset))?.length ?? 0;
    for (const s of subsets) {
      const c = subsetIndex.get(subsetKey(s))?.length ?? 0;
      if (c > bestCount) {
        bestSubset = s;
        bestCount = c;
      }
    }

    if (bestCount <= 1) {
      claimed.add(i);
      groups.push({ core: combo, options: [{ fillers: [], score: scoreFn(sortedResults[i]), example: sortedResults[i] }] });
      continue;
    }

    const memberIndices = (subsetIndex.get(subsetKey(bestSubset)) ?? []).filter((idx) => !claimed.has(idx));
    memberIndices.forEach((idx) => claimed.add(idx));
    const options = memberIndices
      .map((idx) => ({
        fillers: sortedResults[idx].combo.filter((op) => !bestSubset.includes(op)),
        score: scoreFn(sortedResults[idx]),
        example: sortedResults[idx],
      }))
      .sort((a, b) => b.score - a.score);
    groups.push({ core: bestSubset, options });
  }
  return groups;
}

export function runTradingPostSearch(
  maxGroups = 500,
  candidates: Record<string, Candidate> = TP_CANDIDATES,
  overrides?: DynamicContextOverrides,
  maxSlots = 3
): ConsolidatedGroup<TpResult>[] {
  const allIds = Object.keys(candidates);
  const results: TpResult[] = [];
  const cappedSlots = Math.max(1, Math.min(3, maxSlots));
  for (let r = 1; r <= cappedSlots; r++) {
    for (const combo of combinations(allIds, r)) {
      const result = evalTradingPost(combo, overrides, candidates);
      if (result) results.push(result);
    }
  }
  results.sort((a, b) => b.dailyLmd - a.dailyLmd);
  const groups = consolidateByFrequentSubset(results, (r) => r.dailyLmd, maxGroups);
  groups.sort((a, b) => b.options[0].score - a.options[0].score);
  return groups;
}

export function runFactorySearch(
  product: 'Battle Records' | 'Precious Metals',
  maxGroups = 500,
  candidates: Record<string, Candidate> = FACTORY_CANDIDATES,
  overrides?: DynamicContextOverrides,
  maxSlots = 3
): ConsolidatedGroup<FactoryResult>[] {
  const results: FactoryResult[] = [];
  const ids = Object.keys(candidates);
  const cappedSlots = Math.max(1, Math.min(3, maxSlots));
  for (let r = 1; r <= cappedSlots; r++) {
    for (const combo of combinations(ids, r)) {
      const result = evalFactory(combo, product, overrides, candidates);
      if (result) results.push(result);
    }
  }
  results.sort((a, b) => b.dailyOutput - a.dailyOutput);
  const groups = consolidateByFrequentSubset(results, (r) => r.dailyOutput, maxGroups);
  groups.sort((a, b) => b.options[0].score - a.options[0].score);
  return groups;
}

export interface OptimizerResults {
  generatedAt: string;
  tradingPostLmd: ConsolidatedGroup<TpResult>[];
  factoryExp: ConsolidatedGroup<FactoryResult>[];
  factoryGold: ConsolidatedGroup<FactoryResult>[];
}

export function runFullOptimizer(): OptimizerResults {
  return {
    generatedAt: new Date().toISOString(),
    tradingPostLmd: runTradingPostSearch(500),
    factoryExp: runFactorySearch('Battle Records', 500),
    factoryGold: runFactorySearch('Precious Metals', 500),
  };
}