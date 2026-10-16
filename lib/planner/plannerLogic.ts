import { Operator, CostGroup, OperatorModule, getSkillList, getSkillCost } from '../operators/operatorTypes';

// Level caps per rarity, per elite tier -- confirmed limits, not derived
// from anywhere else. Each elite tier must be fully maxed (reach its
// own cap) before the next tier unlocks, matching how promotion resets
// the level counter to 1 within the new tier rather than continuing
// from the previous tier's level.
export const LEVEL_CAPS: Record<number, Partial<Record<0 | 1 | 2, number>>> = {
  1: { 0: 30 },
  2: { 0: 30 },
  3: { 0: 40, 1: 55 },
  4: { 0: 45, 1: 60, 2: 70 },
  5: { 0: 50, 1: 70, 2: 80 },
  6: { 0: 50, 1: 80, 2: 90 },
};

export function maxEliteForRarity(rarity: number): 0 | 1 | 2 {
  const caps = LEVEL_CAPS[rarity];
  if (!caps) return 0;
  if (caps[2] !== undefined) return 2;
  if (caps[1] !== undefined) return 1;
  return 0;
}

export function maxLevelForElite(rarity: number, elite: number): number {
  return LEVEL_CAPS[rarity]?.[elite as 0 | 1 | 2] ?? 1;
}

/**
 * The two locks the game puts on an operator's upgrade axes, which the planner
 * now states rather than leaving a reader to discover by pressing something
 * that does nothing.
 *
 * SKILL RANK: 1 through 4 at Elite 0, and 5, 6 and 7 need Elite 1. Read off
 * `allSkillLvlup[].unlockCond.phase` across the whole EN character_table --
 * 474 of 474 operators put ranks 5-7 behind PHASE_1. The only four rows that
 * say PHASE_0 belong to `trap_116_stdurk` and `trap_288_sunmao`, which are
 * summoned traps rather than operators and never reach this page.
 *
 * MODULES: Elite 2, plus a level that depends on RARITY -- 40 for a 4-star, 50
 * for a 5-star, 60 for a 6-star. From uniequip_table's unlockEvolvePhase and
 * unlockLevel over all 477 non-INITIAL modules: PHASE_2 without exception, and
 * the level lines up with rarity perfectly (61 at 40, 184 at 50, 232 at 60,
 * nothing else). Worth stating because a flat number is wrong for two thirds of
 * the roster: Chiave's SOL-Y opens at E2 Lv50, not the E2 Lv40 a single
 * hardcoded figure would have promised.
 */
export function maxSkillRankForElite(elite: number): number {
  return elite >= 1 ? 7 : 4;
}

const MODULE_UNLOCK_LEVEL: Record<number, number> = { 4: 40, 5: 50, 6: 60 };

/** Elite and level a module needs, or null for a rarity that has no modules. */
export function moduleUnlock(rarity: number): { elite: 2; level: number } | null {
  const level = MODULE_UNLOCK_LEVEL[rarity];
  return level === undefined ? null : { elite: 2, level };
}

/** Default target on first adding an operator: 4/5/6-star operators
 * start at max elite, 30 levels below that tier's cap (matches the
 * request: 4-star -> E2L40, 5-star -> E2L50, 6-star -> E2L60). 1/2/3-star
 * operators default straight to their overall max (max elite, max
 * level), since they don't have the same 30-level headroom convention. */
export function defaultTarget(rarity: number): { elite: number; level: number } {
  const maxElite = maxEliteForRarity(rarity);
  const maxLevel = maxLevelForElite(rarity, maxElite);
  if (maxElite === 2) {
    return { elite: 2, level: Math.max(1, maxLevel - 30) };
  }
  return { elite: maxElite, level: maxLevel };
}

const ELITE_KEYS = ['Elite0', 'Elite1', 'Elite2'] as const;

/** data/operatorLevelExpLmd.json: EXP and LMD per level, per elite tier. A game table the
 *  release carries -- the planner reads it from its props (usePlannerContent) and passes
 *  it in, so this module never compiles a copy into the browser bundle. */
export interface LevelTable {
  [tier: string]: { [level: string]: { EXP: number; LMD: number } };
}

/** Cumulative EXP/LMD from Level 1, Elite 0 all the way to the given
 * target -- every lower elite tier is summed in full (levels 2 through
 * that tier's own cap), since it must be fully maxed before the next
 * tier unlocks, then the target tier is summed only up to the chosen
 * level. */
export function computeLevelCost(levels: LevelTable, rarity: number, targetElite: number, targetLevel: number): { exp: number; lmd: number } {
  let exp = 0;
  let lmd = 0;
  for (let e = 0; e <= targetElite; e++) {
    const tierData = levels[ELITE_KEYS[e]];
    if (!tierData) continue;
    const capAtThisTier = e === targetElite ? targetLevel : maxLevelForElite(rarity, e);
    for (let lvl = 2; lvl <= capAtThisTier; lvl++) {
      const entry = tierData[String(lvl)];
      if (entry) {
        exp += entry.EXP;
        lmd += entry.LMD;
      }
    }
  }
  return { exp, lmd };
}

/** Which promotion tiers are needed to reach the target elite, starting
 * from fromElite (0 by default -- fully unbuilt). Elite 0->1 only if
 * targeting Elite 1 from below it, both Elite 0->1 and Elite 1->2 if
 * targeting Elite 2 from Elite 0, etc. Assumes the promotion array is
 * ordered [Elite 0->1, Elite 1->2]. */
export function promotionCostsNeeded(operator: Pick<Operator, 'promotion'>, targetElite: number, fromElite = 0): { tier: string; cost: CostGroup }[] {
  const promotions = operator.promotion || [];
  const needed: { tier: string; cost: CostGroup }[] = [];
  for (let i = fromElite; i < targetElite && i < promotions.length; i++) {
    needed.push({ tier: promotions[i].tier, cost: promotions[i].cost as unknown as CostGroup });
  }
  return needed;
}

/** Adds a single CostGroup's items into a running material total. */
export function addCostGroup(totals: Map<string, number>, group: CostGroup | null | undefined, multiplier = 1) {
  if (!group || !Array.isArray(group)) return;
  for (const item of group) {
    if (!item || typeof item.name !== 'string') continue;
    const qty = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10) || 0;
    totals.set(item.name, (totals.get(item.name) || 0) + qty * multiplier);
  }
}


export function totalsToCostGroup(totals: Map<string, number>): CostGroup {
  return Array.from(totals.entries())
    .filter(([, qty]) => qty > 0)
    .map(([name, quantity]) => ({ name, quantity }));
}

/** Cumulative skill-level cost from Level 2 up to targetLevel (max 7).
 *
 * This is a SHARED, blanket cost -- the same total materials regardless
 * of how many skills the operator has -- NOT multiplied per skill.
 * (Multiplying by skill count was the actual bug here: only mastery
 * (M1-M3, see skillMasteryCost below) is genuinely per-skill-instance,
 * since each skill has its own separate mastery path with its own
 * materials. Skill rank 1-7 is a single shared investment that
 * simultaneously raises every skill the operator has.) */
export function skillLevelCost(operator: Pick<Operator, 'skills'>, targetLevel: number): CostGroup {
  const skillCost = getSkillCost(operator);
  if (!skillCost) return [];
  const totals = new Map<string, number>();
  for (let lvl = 2; lvl <= targetLevel; lvl++) {
    const group = skillCost[String(lvl)];
    if (group) addCostGroup(totals, group); // no multiplier -- shared across all skills, not per-skill
  }
  return totalsToCostGroup(totals);
}

/** Cost to reach a specific mastery level for one skill (M1, M2, or M3)
 * -- mastery is sequential, so targeting M2 includes M1's cost too, and
 * M3 includes M1 and M2. Genuinely per-skill (each skillIndex has its
 * own independent cost.m1/m2/m3), unlike skillLevelCost above. */
export function skillMasteryCost(skillIndex: number, operator: Pick<Operator, 'skills'>, targetMastery: 1 | 2 | 3): CostGroup {
  const skill = getSkillList(operator)[skillIndex];
  if (!skill?.cost) return [];
  const totals = new Map<string, number>();
  if (targetMastery >= 1) addCostGroup(totals, skill.cost.m1);
  if (targetMastery >= 2) addCostGroup(totals, skill.cost.m2);
  if (targetMastery >= 3) addCostGroup(totals, skill.cost.m3);
  return totalsToCostGroup(totals);
}

/**
 * What is still owed on a module, from a stage you already have to one you want.
 *
 * Stage indices are 0-based and cumulative -- reaching index 2 means paying for 0, 1
 * and 2 -- so "already at index 0" is one stage paid for and -1 is the module not
 * unlocked at all. That is why the loop starts at `from + 1` rather than at `from`, and
 * why -1 has to be the sentinel for nothing rather than 0.
 */
export function moduleStageCostRemaining(
  module: OperatorModule,
  fromStageIndex: number,
  targetStageIndex: number,
): CostGroup {
  const totals = new Map<string, number>();
  for (let i = Math.max(0, fromStageIndex + 1); i <= targetStageIndex && i < module.stages.length; i++) {
    addCostGroup(totals, module.stages[i]?.cost as unknown as CostGroup);
  }
  return totalsToCostGroup(totals);
}

// =====================================================================
// Starting-level-aware helpers -- everything below subtracts a starting
// point's cumulative cost from a target's cumulative cost, since none
// of the functions above natively support a "from X to Y" range. Every
// one of these assumes target >= starting (elite-wise, and level/skill/
// mastery-wise within the same tier) -- the planner UI is responsible
// for enforcing that via floor constraints, not these functions.
// =====================================================================

/** EXP/LMD still needed to go from a starting elite/level to a target
 * elite/level. Elite comparisons matter here specifically because a
 * higher elite tier's low level can still cost less cumulative EXP/LMD
 * than a lower tier's high level was already worth -- e.g. starting at
 * E1L50 and targeting E2L20 is a valid, real scenario (a lower level
 * number at a HIGHER promotion), so this can't just compare level
 * numbers directly; it has to go through the full cumulative
 * computation for both points and subtract. */
export function computeLevelCostRemaining(
  levels: LevelTable,
  rarity: number,
  startElite: number,
  startLevel: number,
  targetElite: number,
  targetLevel: number
): { exp: number; lmd: number } {
  const targetCost = computeLevelCost(levels, rarity, targetElite, targetLevel);
  const startCost = computeLevelCost(levels, rarity, startElite, startLevel);
  return {
    exp: Math.max(0, targetCost.exp - startCost.exp),
    lmd: Math.max(0, targetCost.lmd - startCost.lmd),
  };
}

/** Skill-level materials still needed, from a starting skill level to a
 * target skill level -- simple subtraction since skillLevelCost is
 * already cumulative from Level 2. */
export function skillLevelCostRemaining(operator: Pick<Operator, 'skills'>, startLevel: number, targetLevel: number): CostGroup {
  const targetTotals = new Map<string, number>();
  addCostGroup(targetTotals, skillLevelCost(operator, targetLevel));
  const startTotals = new Map<string, number>();
  addCostGroup(startTotals, skillLevelCost(operator, startLevel));

  const remaining = new Map<string, number>();
  for (const [name, qty] of targetTotals) {
    const already = startTotals.get(name) || 0;
    remaining.set(name, Math.max(0, qty - already));
  }
  return totalsToCostGroup(remaining);
}

/** Mastery materials still needed for one skill, from a starting
 * mastery level (0 = none, i.e. hasn't started mastery yet) to a
 * target mastery level. */
export function skillMasteryCostRemaining(
  skillIndex: number,
  operator: Pick<Operator, 'skills'>,
  startMastery: 0 | 1 | 2 | 3,
  targetMastery: 1 | 2 | 3
): CostGroup {
  if (targetMastery <= startMastery) return [];
  const targetTotals = new Map<string, number>();
  addCostGroup(targetTotals, skillMasteryCost(skillIndex, operator, targetMastery));
  const startTotals = new Map<string, number>();
  if (startMastery >= 1) addCostGroup(startTotals, skillMasteryCost(skillIndex, operator, startMastery as 1 | 2 | 3));

  const remaining = new Map<string, number>();
  for (const [name, qty] of targetTotals) {
    const already = startTotals.get(name) || 0;
    remaining.set(name, Math.max(0, qty - already));
  }
  return totalsToCostGroup(remaining);
}