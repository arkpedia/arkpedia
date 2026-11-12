import { jayeContribution } from './jaye';
import { activeBaseSkills } from './activeBaseSkills';
import { BaseOperator, BaseSkill } from '../operators/operatorTypes';
import {
  tradingPostExpectedMinutes,
  calcGreyProductivity,
  tradingPostBaseOrderLimit,
  calcDailyProduction,
  calcTradingPostGoldAndLmdPerHour,
  calcTradingPostGoldPerHourStandardized,
  type GoldOrderTier,
} from './baseProductivity';
import { toBaseRosters, type BaseRosters, type BaseRosterName } from './baseGroupRosters';
import { nonDefaultRecruitSlots } from './baseResources';
import { skillEffectEntry, type SkillCondition, type SkillCountSource } from './baseSkillEffects';
import { evaluateSkill, type SkillContribution, type SkillScope } from './skillEvaluation';
import { CUSTOM_HANDLERS, CUSTOM_STAGE, type CustomContext } from './customSkillHandlers';
import { categoriesFor } from './factorySkillCategories';
import type { FactoryProduct } from './baseTypes';

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
/** Candidate identifiers map to a REAL operator name + the real BaseSkill entries they bring to the room, every one
 * applied together, exactly as the whole-base calculator reads them from the skill table. */
export interface Candidate {
  operatorName: string;
  skills: { skillName: string; eliteLevel?: string; skill: BaseSkill }[]; // ALL skills this operator has for this facility, applied simultaneously
}

const ELITE_PRIORITY: Record<string, number> = { 'Elite 2': 2, 'Elite 1': 1, Base: 0, 'Level 30': 0 };

/** The highest-tier skill of each ability slot among `skills` (one operator's, one facility's),
 * assuming Elite 2 is unlocked (matching this whole codebase's "always assume max investment"
 * convention). Skills that "Replace" an earlier tier are the SAME ability slot -- only the
 * highest tier is kept. Skills that don't replace anything are a genuinely SEPARATE, concurrent
 * ability that applies at the same time (e.g. Degenbrecher has both "Imposing Presence", which
 * replaces "Intimidate", AND "Champion's Bearing", which replaces nothing and unlocks alongside
 * it -- both are active together once she's placed, not a "pick one" choice).
 *
 * The slot is the game's where the record carries it (building_data's buffChar entry, written
 * every night by sync-operator-english.mjs); else the scraped "Replaces" suffix, which names the
 * slot's first skill; else the skill's own name. */
export function bestSkillPerSlot(skills: BaseSkill[]): BaseSkill[] {
  const groups = new Map<string, BaseSkill[]>();
  for (const s of skills) {
    const raw = s.name ?? '';
    const replacesMatch = raw.match(/Replaces(.+)$/);
    const slotKey = typeof s.slot === 'number' ? `#${s.slot}` : replacesMatch ? replacesMatch[1] : cleanSkillName(raw) ?? raw;
    if (!groups.has(slotKey)) groups.set(slotKey, []);
    groups.get(slotKey)!.push(s);
  }
  return [...groups.values()].map((group) => group.reduce((a, b) => ((ELITE_PRIORITY[b.eliteLevel ?? ''] ?? -1) > (ELITE_PRIORITY[a.eliteLevel ?? ''] ?? -1) ? b : a)));
}

/** Every skill an operator has for a given facility at Elite 2: the best of each slot. */
function allSkillsForOperator(operatorName: string, facility: 'Factory' | 'Trading Post'): BaseSkill[] {
  const op = allOperators.find((o) => o.name === operatorName);
  if (!op || !op.baseSkills) return [];
  return activeBaseSkills(op, facility, 'Elite 2');
}

/** A skill the table describes with numbers the room can use. A Factory skill whose only productivity is for
 *  Originium Shards is left out: a real, different product this optimizer does not model. */
function isSkillUnderstood(skill: BaseSkill, facility: 'Factory' | 'Trading Post'): boolean {
  const entry = skillEffectEntry(skill);
  if (!entry) return false;
  if (entry.custom || entry.nonNumeric || entry.interaction) return true;
  if (facility === 'Factory' && entry.effects.length && entry.effects.every((e) => e.kind === 'productivity' && e.product === 'Originium Shards')) return false;
  return true;
}

/** Excludes a candidate ENTIRELY if any one of their skills for this facility isn't understood -- no fallback, no
 * silent zero: an operator's skills all apply together, so a single unmodeled skill means the operator's TRUE
 * combined effect can't be verified. */
function filterToUnderstoodCandidates(candidates: Record<string, Candidate>, facility: 'Factory' | 'Trading Post'): Record<string, Candidate> {
  const result: Record<string, Candidate> = {};
  for (const [id, c] of Object.entries(candidates)) {
    if (c.skills.every((sk) => isSkillUnderstood(sk.skill, facility))) result[id] = c;
  }
  return result;
}

/** Same grouping logic as allSkillsForOperator above, but restricted to ONLY Base-tier (Elite 0) skills -- for the
 * rotation experiment, which assumes every operator is owned but nobody has been promoted. A skill with no
 * eliteLevel tag at all is treated as Base tier too. */
function eliteZeroSkillsForOperator(operatorName: string, facility: 'Factory' | 'Trading Post'): BaseSkill[] {
  const op = allOperators.find((o) => o.name === operatorName);
  if (!op || !op.baseSkills) return [];
  return op.baseSkills.filter((s) => s.facility === facility && s.name && (!s.eliteLevel || s.eliteLevel === 'Base' || s.eliteLevel === 'Level 30'));
}

/** ONE candidate PER OPERATOR for every operator with at least one skill at the given facility, from the real
 * operator dataset, so every released operator is searchable. An operator with several concurrent skills occupies
 * one search slot and contributes every one of those skills at once, as placing a real operator does. */
function candidatesFrom(facility: 'Factory' | 'Trading Post', skillsOf: (name: string) => BaseSkill[]): Record<string, Candidate> {
  const result: Record<string, Candidate> = {};
  for (const op of allOperators) {
    const skills = skillsOf(op.name);
    if (skills.length === 0) continue;
    result[op.name] = { operatorName: op.name, skills: skills.map((s) => ({ skillName: cleanSkillName(s.name) ?? s.name ?? '', eliteLevel: s.eliteLevel ?? undefined, skill: s })) };
  }
  return filterToUnderstoodCandidates(result, facility);
}
const autoGenerateCandidates = (facility: 'Factory' | 'Trading Post') => candidatesFrom(facility, (name) => allSkillsForOperator(name, facility));
const autoGenerateEliteZeroCandidates = (facility: 'Factory' | 'Trading Post') => candidatesFrom(facility, (name) => eliteZeroSkillsForOperator(name, facility));

// ==================== TRADING POST candidates ====================
export let TP_CANDIDATES: Record<string, Candidate> = {};
export let TP_CANDIDATES_ELITE_ZERO: Record<string, Candidate> = {};

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
  loginInterval?: number;
  receptionRoomLevel?: number;
  totalDormitoryLevels?: number;
  tradingPostLevel?: number; // this specific Trading Post's own level (1-3) -- feeds the level-dependent base order limit. Defaults to 3 (max) when unspecified, same "assume fully built" convention this whole module already uses for everything else.
}

const GUMMY_IN_TRADING_POST = true;

/** The scope a room-only search evaluates a skill in: the room's own operators and skills for real, and the
 *  assumed base around it -- every cross-room conditional true, the standard counts filled in, as before. */
function roomOnlyScope(facility: 'Factory' | 'Trading Post', candidates: Candidate[], operatorName: string, product: FactoryProduct | null, overrides?: DynamicContextOverrides): SkillScope {
  const roomNames = candidates.map((c) => c.operatorName);
  const worldlyPlight = overrides?.worldlyPlight ?? WORLDLY_PLIGHT;
  const dormOperators = overrides?.dormitoryOperatorCount ?? DORMITORY_OPERATOR_COUNT;
  const placed = overrides?.allPlacedNames ?? (facility === 'Trading Post' ? ['Ines', 'Ulpianus'] : []);
  const roster = (key: string) => rosters[key as BaseRosterName] ?? new Set<string>();
  const resources: Record<string, number> = {
    worldlyPlight, felvine: overrides?.felvineTotal ?? FELVINE, monsterMeal: overrides?.monsterMealTotal ?? MONSTER_MEAL, ursusBeverage: overrides?.ursusSpecialtyBeverageTotal ?? 1,
    soundlessResonance: dormOperators, chainOfThought: dormOperators, witchcraftCrystal: Math.floor(worldlyPlight / 5), engineeringRobots: 64, passion: 0, intelligenceReserve: 0,
  };
  const count = (source: SkillCountSource): number => {
    const at = source.indexOf(':');
    const head = at < 0 ? source : source.slice(0, at), rest = at < 0 ? '' : source.slice(at + 1);
    switch (head) {
      case 'room.operators': return roomNames.length;
      case 'room.others': return Math.max(0, roomNames.length - 1);
      case 'room.roster': return roomNames.filter((n) => roster(rest).has(n)).length;
      case 'room.rosterOthers': return roomNames.filter((n) => n !== operatorName && roster(rest).has(n)).length;
      case 'room.skillCategory': {
        const skills = candidates.flatMap((c) => c.skills);
        const reclassify = skills.some((s) => skillEffectEntry(s.skill)?.interaction?.reclassifiesSkills);
        return skills.filter((s) => categoriesFor(s.skillName, reclassify).includes(rest)).length;
      }
      case 'base.tradingPosts': return 2;
      case 'base.factories': return 4;
      case 'base.powerPlants': return 3;
      case 'base.dormitories': return 4;
      case 'base.dormLevels': return overrides?.totalDormitoryLevels ?? 20;
      case 'base.facilityLevels': return 64;
      case 'base.robotsInPowerPlants': return overrides?.robotPowerPlantCount ?? 2;
      case 'base.distinctFactoryProducts': return 2;
      case 'base.goldFactories': case 'base.goldLines': return 2;
      case 'base.dormOperators': return dormOperators;
      case 'base.roster': return rest === 'BLACKSTEEL_WORLDWIDE' ? overrides?.blacksteelWorldwideCountInBase ?? 2 : rest === 'RHINE_LAB' ? overrides?.rhineLabCountInBase ?? 5 : placed.filter((n) => roster(rest).has(n)).length;
      case 'base.facilitiesWithRoster': case 'base.workFacilitiesWithRoster': return rest === 'SUI' ? overrides?.facilitiesWithSuiOperator ?? 3 : overrides?.facilitiesWithEliteOperator ?? 5;
      case 'level.room': return facility === 'Trading Post' ? overrides?.tradingPostLevel ?? 3 : 3;
      case 'level.receptionRoom': return overrides?.receptionRoomLevel ?? 3;
      case 'level.trainingRoom': return 3;
      case 'office.extraSlots': return nonDefaultRecruitSlots(3);
      case 'resource': return resources[rest] ?? 0;
      default: return 0;
    }
  };
  const holds = (c: SkillCondition): boolean => {
    switch (c.type) {
      case 'roomHas': return [c.name, ...(c.forms ?? [])].some((n) => roomNames.includes(n));
      case 'roomHasRoster': return roomNames.some((n) => n !== operatorName && roster(c.roster).has(n));
      case 'alone': return roomNames.length === 1;
      case 'baseHas': return c.name === 'Ulpianus' ? overrides?.ulpianusInBase ?? true : placed.includes(c.name);
      case 'inTradingPost': return c.name === 'Gummy' ? overrides?.gummyInTradingPost ?? GUMMY_IN_TRADING_POST : false;
      case 'countAtLeast': return count(c.count) >= c.value;
      case 'countAtMost': return count(c.count) <= c.value;
      case 'product': return product === c.product;
      default: return false;
    }
  };
  return { operatorName, roomNames, product, count, holds, active: (buffId) => candidates.some((c) => c.skills.some((s) => s.skill.buffId === buffId)) };
}
const roomOnlyCustomContext = (operatorName: string, roomNames: readonly string[], overrides?: DynamicContextOverrides): CustomContext => ({
  operatorName, roomNames,
  rampWindowHours: 24, rampStartHours: 0, // optimistic: ramping skills reach their capped value
  selfMoraleRate: 0.01, // near-zero decay rate -> Totter's own morale-difference stays near 0 -> his BASE value, the optimistic case
  othersProductivitySum: 0, capacityByOperator: {}, groupHuntingInControlCenter: overrides?.gladiiaGroupHuntingActiveInCC ?? false,
  othersOrderEfficiencySum: 0, othersOrderLimitRawSum: 0,
  abyssalHunters: { working: 0, resting: 0, restingAtFullMorale: 0, perFactory: [], totalInFactories: 0 }, fractionAbove12: 1, ccFamilyCount: () => 0,
});
const goldOrderTierOf = (candidates: Candidate[]): GoldOrderTier => {
  const tiers = candidates.flatMap((c) => c.skills.map((s) => ({ name: c.operatorName, tier: skillEffectEntry(s.skill)?.interaction?.goldOrderTier })));
  if (tiers.some((t) => t.tier === 'higher')) return 'higher';
  const lower = new Set(tiers.filter((t) => t.tier === 'lower').map((t) => t.name)).size;
  return lower >= 2 ? 'doubleLower' : lower === 1 ? 'lower' : 'base';
};

export function evalTradingPost(comboIds: string[], overrides?: DynamicContextOverrides, candidatePool: Record<string, Candidate> = TP_CANDIDATES): TpResult | null {
  const candidates = comboIds.map((id) => candidatePool[id]).filter((c): c is Candidate => !!c);
  if (candidates.length !== comboIds.length) return null;
  const realNames = candidates.map((c) => c.operatorName);
  if (new Set(realNames).size !== realNames.length) return null;

  const level = overrides?.tradingPostLevel ?? 3;
  const evaluated = candidates.flatMap((c) => c.skills.map((s) => { const entry = skillEffectEntry(s.skill); return entry ? { name: c.operatorName, c: evaluateSkill(entry, roomOnlyScope('Trading Post', candidates, c.operatorName, null, overrides)) } : null; })).filter((x): x is { name: string; c: SkillContribution } => !!x);
  const karlanHere = realNames.filter((n) => rosters.KARLAN_TRADE.has(n)).length;
  const gnosisPresent = overrides?.gnosisInControlCenter ?? true; // defaults true for backward compatibility with callers (wholeBaseOptimizer.ts) that genuinely do place Gnosis unconditionally
  const gnosisEff = gnosisPresent ? -0.15 * karlanHere : 0;
  const gnosisLimit = gnosisPresent ? 6 * karlanHere : 0;
  const grey = calcGreyProductivity(candidates.length);
  const results: { orderEfficiency: number; orderLimit: number; overrides: boolean }[] = [];
  let othersEff = gnosisEff;
  let othersLimitRaw = gnosisLimit;
  for (const { c } of evaluated) {
    if (c.custom) continue;
    results.push({ orderEfficiency: c.orderEfficiency, orderLimit: c.orderLimit, overrides: c.overridesOthers });
    othersEff += c.orderEfficiency; othersLimitRaw += c.orderLimit;
  }
  const customs = evaluated.filter(({ c }) => c.custom);
  for (const { name, c } of customs) {
    if (c.custom!.handler !== 'perOthersOrderLimit' || !c.custom!.params.beforeLimitChanges) continue;
    const r = CUSTOM_HANDLERS[c.custom!.handler](c.custom!.params, { ...roomOnlyCustomContext(name, realNames, overrides), othersOrderLimitRawSum: othersLimitRaw });
    results.push({ orderEfficiency: r.orderEfficiency ?? 0, orderLimit: 0, overrides: false }); othersEff += r.orderEfficiency ?? 0;
  }
  const jaye = customs.filter(({ c }) => c.custom!.handler.startsWith('jaye'));
  const snowsant = customs.find(({ c }) => c.custom!.handler === 'snowsant');
  const goldTier = goldOrderTierOf(candidates);
  if (jaye.length) {
    const promoted = jaye.some(({ c }) => c.custom!.handler === 'jayeBasicNeeds');
    const modeled = jayeContribution(tradingPostBaseOrderLimit(level) + othersLimitRaw, othersEff, snowsant ? snowsant.c.custom!.params.cap : 0, promoted, grey + (overrides?.controlCenterTradingPostBonus ?? 0), overrides?.loginInterval ?? 24, level, tradingPostExpectedMinutes(goldTier, level));
    results.push({ orderEfficiency: modeled.jaye, orderLimit: modeled.limitReduction, overrides: false });
    if (snowsant) results.push({ orderEfficiency: modeled.snowsant, orderLimit: 0, overrides: false });
    othersLimitRaw += modeled.limitReduction;
  }
  for (const { name, c } of customs) {
    if (c.custom!.handler.startsWith('jaye') || (c.custom!.handler === 'snowsant' && jaye.length) || (c.custom!.handler === 'perOthersOrderLimit' && c.custom!.params.beforeLimitChanges)) continue;
    const r = CUSTOM_HANDLERS[c.custom!.handler](c.custom!.params, { ...roomOnlyCustomContext(name, realNames, overrides), othersOrderEfficiencySum: othersEff, othersOrderLimitRawSum: othersLimitRaw });
    results.push({ orderEfficiency: r.orderEfficiency ?? 0, orderLimit: 0, overrides: false });
  }

  const specialProductivitySum = results.reduce((s, r) => s + r.orderEfficiency, 0);
  const specialOrderLimitSum = results.reduce((s, r) => s + r.orderLimit, 0);
  const overrideActive = results.some((r) => r.overrides);
  const overrideSum = results.filter((r) => r.overrides).reduce((s, r) => s + r.orderEfficiency, 0);

  // Matches the whole-base calculator: with an override skill (Shamare's Whispers) active, the room's final yellow is
  // JUST the overriding operator's own contribution plus Gnosis's and the Control Center's cross-facility effects.
  const controlCenterBonus = overrides?.controlCenterTradingPostBonus ?? 0;
  const finalYellow = overrideActive ? overrideSum + gnosisEff + controlCenterBonus : specialProductivitySum + gnosisEff + controlCenterBonus;
  const effectiveProductivity = Math.max(0, grey + finalYellow);
  const effectiveLimit = Math.max(1, tradingPostBaseOrderLimit(level) + specialOrderLimitSum + gnosisLimit);

  // Non-standard gold mechanics, from the skills' trade rules, in the whole-base calculator's precedence.
  const rules = candidates.flatMap((c) => c.skills.map((s) => skillEffectEntry(s.skill)?.interaction?.trade)).filter((t): t is NonNullable<typeof t> => !!t);
  let dailyGold: number;
  let dailyLmd: number;
  if (rules.some((t) => t.order === 'pepe')) {
    return { combo: comboIds, effectiveProductivity: null, effectiveLimit: null, dailyGold: 0, dailyLmd: (24 * 60 / 270) * 1000 };
  } else if (rules.some((t) => t.order === 'closure')) {
    const dailyOrders = effectiveProductivity * 24 / 2.4;
    dailyGold = dailyOrders * 2;
    dailyLmd = dailyOrders * 1200;
  } else if (rules.some((t) => t.fixedGold)) {
    dailyGold = calcTradingPostGoldPerHourStandardized(effectiveProductivity, rules.find((t) => t.fixedGold)!.fixedGold!, level) * 24;
    dailyLmd = dailyGold * 500;
  } else {
    // Tailoring's distribution tier, Proviso's gold bonus and Tequila's LMD bonus all apply together.
    const { goldPerHour, extraLmdPerHour } = calcTradingPostGoldAndLmdPerHour(effectiveProductivity, Math.max(0, ...rules.map((t) => t.defaultedGoldBonus ?? 0)), Math.max(0, ...rules.map((t) => t.lmdBonusAbove3 ?? 0)), goldTier, level);
    dailyGold = goldPerHour * 24;
    dailyLmd = dailyGold * 500 + extraLmdPerHour * 24;
  }

  return { combo: comboIds, effectiveProductivity, effectiveLimit, dailyGold, dailyLmd };
}

// ==================== FACTORY candidates ====================
export let FACTORY_CANDIDATES: Record<string, Candidate> = {};
export let FACTORY_CANDIDATES_ELITE_ZERO: Record<string, Candidate> = {};

/** Rebuilds all four candidate pools from the current allOperators. Function declaration (hoisted), so it's safely
 * callable from initializeOptimizerData above even though it's defined below both sets of pools it rebuilds. */
function invalidateCandidateCaches() {
  TP_CANDIDATES = autoGenerateCandidates('Trading Post');
  TP_CANDIDATES_ELITE_ZERO = autoGenerateEliteZeroCandidates('Trading Post');
  FACTORY_CANDIDATES = autoGenerateCandidates('Factory');
  FACTORY_CANDIDATES_ELITE_ZERO = autoGenerateEliteZeroCandidates('Factory');
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

  const evaluated = candidates.flatMap((c) => c.skills.map((s) => { const entry = skillEffectEntry(s.skill); return entry ? { name: c.operatorName, c: evaluateSkill(entry, roomOnlyScope('Factory', candidates, c.operatorName, product, overrides)) } : null; })).filter((x): x is { name: string; c: SkillContribution } => !!x);
  const grey = calcGreyProductivity(candidates.length);
  let normalSum = 0;
  let exemptSum = 0;
  let overrideSum = 0;
  let hasOverride = false;
  let othersSum = 0;
  const capacityByOp: Record<string, number> = {};
  const take = (c: SkillContribution, productivity: number) => {
    if (c.overridesOthers) { hasOverride = true; overrideSum += productivity; }
    else if (c.exemptFromOverride) exemptSum += productivity;
    else normalSum += productivity;
  };
  for (const { name, c } of evaluated) {
    if (c.custom) continue;
    take(c, c.productivity);
    if (c.productivity && !c.exemptFromOverride) othersSum += c.productivity;
    if (c.capacity) capacityByOp[name] = (capacityByOp[name] || 0) + c.capacity;
  }
  for (const handler of ['bubble', 'vermeil', 'waaiFu']) for (const { name, c } of evaluated) {
    if (c.custom?.handler !== handler) continue;
    const r = CUSTOM_HANDLERS[handler](c.custom.params, { ...roomOnlyCustomContext(name, realNames, overrides), capacityByOperator: capacityByOp, othersProductivitySum: othersSum });
    take(c, r.productivity ?? 0);
    if (handler !== 'waaiFu' && r.productivity) othersSum += r.productivity;
  }
  for (const { name, c } of evaluated) {
    if (!c.custom || CUSTOM_STAGE[c.custom.handler] !== 'moraleWindow') continue;
    take(c, CUSTOM_HANDLERS[c.custom.handler](c.custom.params, roomOnlyCustomContext(name, realNames, overrides)).productivity ?? 0);
  }

  const controlCenterBonus = overrides?.controlCenterFactoryBonus ?? 0;
  const total = exemptSum + (hasOverride ? overrideSum : normalSum) + controlCenterBonus;
  const effectiveProductivity = Math.max(0, grey + total);
  return { combo: comboIds, effectiveProductivity, dailyOutput: calcDailyProduction(effectiveProductivity, product) };
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