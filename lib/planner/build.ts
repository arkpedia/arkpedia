import type { CostGroup, OperatorModule, PlannerOperator } from '@/lib/operators/operatorTypes';
import {
  computeLevelCostRemaining,
  maxLevelForElite,
  maxSkillRankForElite,
  moduleStageCostRemaining,
  moduleUnlock,
  promotionCostsNeeded,
  skillLevelCostRemaining,
  skillMasteryCostRemaining,
  type LevelTable,
} from '@/lib/planner/plannerLogic';
import { BATTLE_RECORDS, resolveNeeds } from './craft';
import type { Depot } from './depot';
import type { Goal } from './goals';
import type { Owned } from './roster';

/**
 * Building: paying for one upgrade out of the depot and recording it.
 *
 * The planner priced things and never let you finish one. Once the depot
 * covered a goal, the reader promoted the operator in the game, then came back
 * here and retyped both halves -- the new level in the roster, the new counts
 * in the depot, ninety-three of them read down again. This does that in one
 * press, and the whole difficulty is doing the depot half RIGHT:
 *
 * - What is held is spent first; the remainder is crafted where the resolver
 *   says it can be. A build spends what the resolver resolved -- the same walk,
 *   the same decisions -- because a build that made its own decisions would
 *   consume different materials from the ones the shortfall list said it
 *   would, and the reader would have no way of knowing which.
 * - A CRAFTED material consumes its INGREDIENTS, not itself, all the way down:
 *   a Cluster the depot does not hold costs five Cubes, and if it did not hold
 *   the Cubes either, whatever the Cubes were made from. That is what
 *   `resolveNeeds` already walks; it now hands back the stock it walked on.
 * - The bench charges LMD per run, for automatic crafts as much as declared
 *   ones. The plan's LMD line carries it.
 * - EXP is spent as battle records OUT OF WHAT IS HELD, and as the combination
 *   of them that wastes the least -- the game does not split a record, so a
 *   little may be wasted, and the receipt says how much.
 * - The Workshop's byproducts are a roll of the dice and are not credited.
 *
 * One goal at a time, in the game's own order of prerequisites. Nobody has the
 * materials for a whole E2-and-three-masteries plan at once; they have them
 * for the next step, and the next step is what this builds.
 */

export interface BuildReceipt {
  ok: true;
  /** Material -> how many left the depot, LMD and battle records included. */
  spent: Record<string, number>;
  /** Product -> how many the bench made on the way. Informational: what was
   *  consumed for them is already in `spent`. */
  made: Record<string, number>;
  /** The depot after. Write this back. */
  remaining: Depot;
  /** The plan's own LMD plus the bench's. */
  lmd: number;
  /** EXP the last record over-shot by. A record cannot be spent by halves. */
  expWasted: number;
}

export interface BuildShort {
  ok: false;
  /** The materials (and 'LMD', 'EXP') the depot cannot cover, even by crafting. */
  short: string[];
}

export type BuildPlan = BuildReceipt | BuildShort;

/** Modules a plan can target: the badge every operator carries is not one. */
export function plannerModules(op: Pick<PlannerOperator, 'modules'>): OperatorModule[] {
  return (op.modules || []).filter((m) => m.type !== 'Original');
}

/**
 * Whether the operator, as they are now, can take this upgrade next.
 *
 * The goal list groups by kind -- promotions, then levels, then ranks -- so
 * "E2 promotion" can sit above "E1 to Lv 80" in it. This is the rule that says
 * which of those is actually pressable: the game's own prerequisites, read
 * against the roster. Every rule here is one the editor's blocks already
 * state in words.
 */
export function goalReady(goal: Goal, from: Owned, rarity: number): boolean {
  switch (goal.kind) {
    case 'elite':
      /* Promotion needs the tier below it maxed. */
      return from.elite === goal.elite - 1 && from.level >= maxLevelForElite(rarity, goal.elite - 1);
    case 'level':
      return from.elite === goal.elite && from.level < goal.to;
    case 'skill':
      return from.skillLevel === goal.rank - 1 && goal.rank <= maxSkillRankForElite(from.elite);
    case 'mastery':
      return from.elite === 2 && from.skillLevel === 7 && (from.masteries[goal.skill] || 0) === goal.mastery - 1;
    case 'module': {
      const unlock = moduleUnlock(rarity);
      return !!unlock && from.elite >= unlock.elite && from.level >= unlock.level
        && (from.modules?.[goal.module] ?? -1) === goal.stage - 1;
    }
  }
}

/** Why a goal is not ready yet, in the editor's own words. */
export function goalBlocker(goal: Goal, from: Owned, rarity: number): string {
  switch (goal.kind) {
    case 'elite':
      return from.elite >= goal.elite ? 'Already promoted'
        : from.elite < goal.elite - 1 ? `After E${goal.elite - 1}`
          : `After E${goal.elite - 1} Lv${maxLevelForElite(rarity, goal.elite - 1)}`;
    case 'level':
      return from.elite < goal.elite ? `After E${goal.elite}` : 'Already there';
    case 'skill':
      return from.skillLevel >= goal.rank ? 'Already there'
        : goal.rank > maxSkillRankForElite(from.elite) ? `After E${goal.rank > 4 ? 1 : 0}`
          : `After rank ${goal.rank - 1}`;
    case 'mastery':
      return from.elite < 2 ? 'After E2' : from.skillLevel < 7 ? 'After rank 7'
        : (from.masteries[goal.skill] || 0) >= goal.mastery ? 'Already there' : `After M${goal.mastery - 1}`;
    case 'module': {
      const unlock = moduleUnlock(rarity);
      if (!unlock) return 'Not for this rarity';
      if (from.elite < unlock.elite || from.level < unlock.level) return `After E${unlock.elite} Lv${unlock.level}`;
      return (from.modules?.[goal.module] ?? -1) >= goal.stage ? 'Already there' : `After S${goal.stage}`;
    }
  }
}

/**
 * What one goal costs from where the operator is now. LMD and EXP ride along
 * as items named 'LMD' and 'EXP', which is how the gamedata writes them and
 * how `planBuild` tells them apart.
 */
export function priceGoal(goal: Goal, op: PlannerOperator, rarity: number, from: Owned, levels: LevelTable): CostGroup {
  switch (goal.kind) {
    case 'elite':
      return promotionCostsNeeded(op, goal.elite, goal.elite - 1).flatMap((p) => p.cost);
    case 'level': {
      const { exp, lmd } = computeLevelCostRemaining(levels, rarity, from.elite, from.level, goal.elite, goal.to);
      return [{ name: 'EXP', quantity: exp }, { name: 'LMD', quantity: lmd }];
    }
    case 'skill':
      return skillLevelCostRemaining(op, goal.rank - 1, goal.rank);
    case 'mastery':
      return skillMasteryCostRemaining(goal.skill, op, (goal.mastery - 1) as 0 | 1 | 2, goal.mastery);
    case 'module': {
      const mod = plannerModules(op)[goal.module];
      return mod ? moduleStageCostRemaining(mod, goal.stage - 1, goal.stage) : [];
    }
  }
}

/** The roster entry after the goal is built. A promotion resets the level to 1,
 *  as the game does; everything else moves one axis. */
export function applyGoal(goal: Goal, from: Owned): Owned {
  switch (goal.kind) {
    case 'elite':
      return { ...from, elite: goal.elite, level: 1 };
    case 'level':
      return { ...from, level: goal.to };
    case 'skill':
      return { ...from, skillLevel: goal.rank };
    case 'mastery':
      return { ...from, masteries: { ...from.masteries, [goal.skill]: goal.mastery } };
    case 'module':
      return { ...from, modules: { ...(from.modules ?? {}), [goal.module]: goal.stage } };
  }
}

/**
 * Which records to hand over for `exp`, out of what is held -- with the least
 * EXP wasted.
 *
 * `expToBattleRecords` answers a different question, what to FARM, and hands
 * back records the reader may not have. This spends the ones they do. Greedy
 * does not work here: 592 EXP with two Tacticals and five Drills on the shelf
 * is three Drills (8 wasted), not one Tactical (408 wasted), and the reverse
 * holds for other shelves. So it is an exact search -- a bounded knapsack over
 * records in units of the smallest one, a few thousand cells for the longest
 * level run -- for the smallest total at or above `exp` the shelf can make.
 * Among the ways to make that total, larger records go first, which is how
 * players spend them. null when the shelf cannot reach it at all.
 */
export function spendBattleRecords(
  exp: number,
  stock: Depot,
  records = BATTLE_RECORDS,
): { spent: Record<string, number>; wasted: number } | null {
  const need = Math.max(0, Math.ceil(exp));
  if (need === 0) return { spent: {}, wasted: 0 };

  /* The unit is the records' common divisor, read off the table rather than
     assumed to be the Drill's 200. */
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const unit = records.map((r) => r.exp).reduce(gcd);
  /* Largest first, as the table is. */
  const shelf = records.map((r) => ({ name: r.name, size: r.exp / unit, have: stock[r.name] || 0 }));
  const target = Math.ceil(need / unit);
  const total = shelf.reduce((n, r) => n + r.size * r.have, 0);
  if (total < target) return null;

  /* No answer overshoots by a whole record or more -- one fewer of it would
     still cover -- so the search stops one record past the target. */
  const top = Math.min(total, target + Math.max(...shelf.map((r) => r.size)));
  /* used[i][s]: how many of record i reach sum s given records 0..i, or -1.
     Zero wherever records 0..i-1 already reach s, so the reconstruction spends
     the later (smaller) records only where the earlier ones could not. */
  const used: Int32Array[] = [];
  let prev = new Int32Array(top + 1).fill(-1);
  prev[0] = 0;
  for (const r of shelf) {
    const cur = new Int32Array(top + 1).fill(-1);
    for (let s = 0; s <= top; s++) {
      if (prev[s] >= 0) cur[s] = 0;
      else if (s >= r.size && cur[s - r.size] >= 0 && cur[s - r.size] < r.have) cur[s] = cur[s - r.size] + 1;
    }
    used.push(cur);
    prev = cur;
  }
  let sum = target;
  while (sum <= top && prev[sum] < 0) sum++;
  if (sum > top) return null;

  const spent: Record<string, number> = {};
  let s = sum;
  for (let i = shelf.length - 1; i >= 0; i--) {
    const n = used[i][s];
    if (n > 0) spent[shelf[i].name] = n;
    s -= n * shelf[i].size;
  }
  return { spent, wasted: sum * unit - need };
}

/**
 * Price a bill against the depot and say exactly what would leave it.
 *
 * Refuses whole if anything is short -- a build that spent the materials it
 * could and left the operator un-promoted would be a depot that no longer
 * matches the game and a roster that never did. Nothing is written here; the
 * caller writes `remaining` and the new roster entry together, or neither.
 */
export function planBuild(
  cost: CostGroup,
  depot: Depot,
  opts: { crafting?: ReadonlySet<string>; autoCraft: boolean },
  craftTools = { resolveNeeds, BATTLE_RECORDS },
): BuildPlan {
  const materials: CostGroup = [];
  let lmd = 0;
  let exp = 0;
  for (const item of cost) {
    const qty = Math.ceil(Number(item.quantity) || 0);
    if (qty <= 0) continue;
    if (item.name === 'EXP') exp += qty;
    else if (item.name === 'LMD') lmd += qty;
    else materials.push({ name: item.name, quantity: qty });
  }

  /* The same resolve the shortfall list reads, on this bill alone. */
  const res = craftTools.resolveNeeds(materials, depot, opts);
  const short = res.rows.filter((r) => r.short > 0).map((r) => r.name);
  const stock: Depot = { ...res.stock };

  const lmdTotal = lmd + res.craftingLmd;
  if ((stock.LMD || 0) < lmdTotal) short.push('LMD');
  const records = spendBattleRecords(exp, stock, craftTools.BATTLE_RECORDS);
  if (!records) short.push('EXP');
  if (short.length) return { ok: false, short };

  if (lmdTotal > 0) stock.LMD = (stock.LMD || 0) - lmdTotal;
  for (const [name, n] of Object.entries(records!.spent)) stock[name] = (stock[name] || 0) - n;

  /* The receipt is the difference, so it cannot disagree with what is written. */
  const spent: Record<string, number> = {};
  for (const name of new Set([...Object.keys(depot), ...Object.keys(stock)])) {
    const d = (depot[name] || 0) - (stock[name] || 0);
    if (d > 0) spent[name] = d;
  }
  const remaining: Depot = {};
  for (const [name, n] of Object.entries(stock)) if (n > 0) remaining[name] = n;

  return { ok: true, spent, made: res.made, remaining, lmd: lmdTotal, expWasted: records!.wasted };
}
