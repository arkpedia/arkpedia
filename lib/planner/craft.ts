import type { CostGroup } from '@/lib/operators/operatorTypes';
import { MATERIAL_SORT_ORDER } from '@/lib/farming/materialSortOrder';
import formulaData from '@/data/base-formulas.json';
import recordData from '@/data/battle-records.json';
import type { Depot } from './depot';

/**
 * How much of a plan you can already cover, counting the Workshop.
 *
 * The plain subtraction -- need minus have -- is only half an answer, because a
 * missing Orirock Cluster is not missing if you have the four Orirock Cubes it is
 * made of. This walks the recipe tree the way the game lets you: spend what you have,
 * then craft what you can from what is left, then report the rest.
 */

export interface Formula {
  type: string;
  /** WORKSHOP or FACTORY -- which bench in the base makes this. */
  room: string;
  count: number;
  lmd: number;
  costs: { name: string; count: number }[];
  byproducts: { name: string; count: number; weight: number }[];
  byproductRate: number;
  /** Other recipes for the same product. Only the Factory has any. */
  alternatives: { lmd: number; costs: { name: string; count: number }[] }[];
}

export type Coverage = 'have' | 'craftable' | 'crafting' | 'short';

export interface NeedRow {
  name: string;
  /** How many the plan asks for. */
  need: number;
  /** How many came straight out of the depot. */
  fromDepot: number;
  /** How many the Workshop could make from what was left after everything above. */
  fromCrafting: number;
  /** What you still have to go and get. */
  short: number;
  coverage: Coverage;
  /** True when this row is only in the list because something above it is being
   *  crafted out of it. Worth saying: it is not a material the plan asked for. */
  viaCrafting?: boolean;
}

/**
 * What the Workshop did on the way to an answer: LMD charged at the bench and
 * how many of each product came off it. Kept because a BUILD has to spend
 * exactly this -- the ingredients the recipes consumed are already gone from
 * `stock`, but the bench fee is not a material and has to be added to the
 * plan's own LMD line, for automatic crafts as much as declared ones. */
export interface CraftLedger {
  lmd: number;
  made: Record<string, number>;
}

export interface Resolution {
  rows: NeedRow[];
  /** LMD the crafts will cost at the bench, on top of the plan's own -- the
   *  declared ones AND the automatic ones. The bench charges either way, and a
   *  total that left the automatic ones out was a total the build could not
   *  pay from. */
  craftingLmd: number;
  /** The depot after everything above was taken from it: what the plan asked
   *  for where it was held, and the ingredients of whatever was crafted. This
   *  is what a build writes back. Only meaningful when nothing is short. */
  stock: Depot;
  /** How many of each product the bench made, declared and automatic. */
  made: Record<string, number>;
}

export function createCraftTools(formulas: Record<string, Formula> = formulaData, records: { name: string; exp: number }[] = recordData) {


const FORMULAS = formulas;

/**
 * Which recipes may be DESCENDED INTO.
 *
 * F_ASC, the chip family, is a cycle -- three Sniper Chips make a Caster Chip and
 * three Caster Chips make a Sniper Chip, because those are the game's class trades
 * rather than a ladder. Following them would not terminate, and the advice it
 * produced on the way would be nonsense. scripts/imports/import-base-formulas.mjs fails
 * the build if a cycle ever appears among the two families below, so this set and
 * that guard have to agree; they are stated in both places on purpose.
 */
const WALKABLE = new Set(['F_EVOLVE', 'F_SKILL']);

/** Highest tier first, which is the order the sort list already encodes. */
const TIER_RANK = new Map(MATERIAL_SORT_ORDER.map((name, i) => [name, i]));

/**
 * EXP is not a material you hold; battle records are.
 *
 * Read from the table rather than restated here. They are four numbers that have not
 * moved in years, which is exactly the argument for typing them in -- and exactly why
 * a typo in them would never be noticed. The importer writes them out of
 * item_table.expItems, already sorted largest first, which is the order the greedy
 * conversion below spends them in.
 */
const BATTLE_RECORDS: { name: string; exp: number }[] = records;

/** The records that cover `exp`, largest first. The last one over-shoots, which is
 *  what happens in game too -- a record cannot be spent by halves. */
function expToBattleRecords(exp: number): { name: string; count: number }[] {
  let left = Math.max(0, Math.ceil(exp));
  const out: { name: string; count: number }[] = [];
  BATTLE_RECORDS.forEach(({ name, exp: value }, i) => {
    const isLast = i === BATTLE_RECORDS.length - 1;
    const count = isLast ? Math.ceil(left / value) : Math.floor(left / value);
    if (count > 0) {
      out.push({ name, count });
      left -= count * value;
    }
  });
  return out;
}

/**
 * Spend `stock` (mutated) to make `want` of `name`, crafting where the depot cannot
 * pay directly. Returns how many were actually produced.
 *
 * Depth-first, and greedy at every level: a recipe is only attempted if all of its
 * ingredients can be met, and an ingredient may itself be crafted. `seen` guards
 * against a cycle reaching this far -- the importer should have caught it, but a
 * resolver that hangs on bad data is a worse failure than one that declines.
 */
function craft(name: string, want: number, stock: Depot, seen: Set<string>, ledger: CraftLedger): number {
  const recipe = FORMULAS[name];
  if (!recipe || !WALKABLE.has(recipe.type) || seen.has(name)) return 0;
  seen.add(name);
  let made = 0;
  while (made < want) {
    /**
     * Every attempt runs against a COPY and is committed only if it produced
     * something.
     *
     * Without that, an attempt that cannot finish still leaves behind the
     * intermediates it converted on the way -- and the next row to want one of those
     * intermediates finds it sitting in stock and reports it as already owned. Asking
     * for one Polymerization Preparation with nothing but Orirock in the depot used to
     * make an Orirock Concentration, fail, abandon it, and then tell you that you had
     * an Orirock Concentration in your depot.
     */
    const attempt = { ...stock };
    const runs = Math.ceil((want - made) / recipe.count);
    let canRun = runs;
    for (const cost of recipe.costs) {
      const have = attempt[cost.name] || 0;
      const needed = cost.count * canRun;
      const extra = have >= needed ? 0 : craftInto(cost.name, needed - have, attempt, seen, ledger);
      canRun = Math.min(canRun, Math.floor((have + extra) / cost.count));
      if (canRun <= 0) break;
    }
    if (canRun <= 0) break;
    for (const cost of recipe.costs) attempt[cost.name] = (attempt[cost.name] || 0) - cost.count * canRun;
    Object.assign(stock, attempt);
    made += canRun * recipe.count;
    ledger.lmd += recipe.lmd * canRun;
    ledger.made[name] = (ledger.made[name] || 0) + canRun * recipe.count;
  }
  seen.delete(name);
  return made;
}

/** Craft `extra` more of `name` INTO the stock, returning how many were added. */
function craftInto(name: string, extra: number, stock: Depot, seen: Set<string>, ledger: CraftLedger): number {
  if (extra <= 0) return 0;
  const made = craft(name, extra, stock, seen, ledger);
  if (made > 0) stock[name] = (stock[name] || 0) + made;
  return made;
}

/**
 * The plan against the depot, and against what you have said you will craft.
 *
 * Highest tier first, and that ordering is load-bearing rather than cosmetic: a Tier 3
 * and a Tier 4 target can want the same Tier 2 ingredient, and whichever is resolved
 * first gets it. Spending on the higher tier first is the right call, because the lower
 * one is the cheaper of the two to go and farm. It is also what makes one pass enough
 * for the crafting expansion below: a declared craft adds its ingredients to the very
 * map being walked, and they are always lower tier, so they are still ahead.
 *
 * `crafting` is the reader's own declaration -- "I will make my Orirock Clusters" --
 * and it is a different question from the one this used to answer alone. Automatic
 * crafting says "you already hold the ingredients, so this is not really missing".
 * A declaration says "I cannot make it yet and I would rather make it than farm it, so
 * tell me what to farm instead", and the answer is its ingredients, which appear in the
 * list as rows of their own. The two compose: the declaration pushes the requirement
 * down a tier, and the depot is then applied to what it landed on.
 *
 * EXP passes through untouched, being a number rather than a thing you hold.
 *
 * `autoCraft` is the whole-bill switch: false answers the plain subtraction, need
 * minus have, and never opens the workbench. It is a required field rather than an
 * optional argument, so adding it could not leave a call site quietly on one answer
 * while the screen offered the reader both -- the compiler names every one.
 * A DECLARED craft still runs with it off: that is the reader saying "make this",
 * not the resolver deciding on their behalf.
 */
function resolveNeeds(
  need: CostGroup,
  depot: Depot,
  opts: { crafting?: ReadonlySet<string>; autoCraft: boolean },
): Resolution {
  const stock: Depot = { ...depot };
  const declared = opts.crafting ?? new Set<string>();
  const { autoCraft } = opts;

  /* One map rather than a list, because a declared craft ADDS to it as we go. */
  const totals = new Map<string, number>();
  const asked = new Set<string>();
  for (const item of need) {
    const qty = Math.ceil(Number(item.quantity) || 0);
    if (qty <= 0) continue;
    totals.set(item.name, (totals.get(item.name) ?? 0) + qty);
    asked.add(item.name);
  }

  const rank = (name: string) => TIER_RANK.get(name) ?? Infinity;
  const rows: NeedRow[] = [];
  const done = new Set<string>();
  const ledger: CraftLedger = { lmd: 0, made: {} };

  /* Re-picked each time rather than sorted once: the pool grows during the walk. The
     bound is the number of distinct materials, which is under a hundred. */
  for (;;) {
    let next: string | null = null;
    for (const name of totals.keys()) {
      if (done.has(name)) continue;
      if (next === null || rank(name) < rank(next)) next = name;
    }
    if (next === null) break;
    done.add(next);

    const wanted = totals.get(next) ?? 0;
    if (wanted <= 0) continue;
    const held = stock[next] || 0;
    const fromDepot = Math.min(held, wanted);
    stock[next] = held - fromDepot;
    const stillWanted = wanted - fromDepot;

    const recipe = FORMULAS[next];
    if (stillWanted > 0 && declared.has(next) && recipe && WALKABLE.has(recipe.type)) {
      /* Declared. The shortfall becomes the recipe's, not this material's. */
      const runs = Math.ceil(stillWanted / recipe.count);
      for (const cost of recipe.costs) {
        if (cost.name === 'LMD') { ledger.lmd += cost.count * runs; continue; }
        totals.set(cost.name, (totals.get(cost.name) ?? 0) + cost.count * runs);
        done.delete(cost.name);
      }
      ledger.lmd += recipe.lmd * runs;
      ledger.made[next] = (ledger.made[next] || 0) + runs * recipe.count;
      rows.push({
        name: next,
        need: wanted,
        fromDepot,
        fromCrafting: stillWanted,
        short: 0,
        coverage: 'crafting',
        ...(asked.has(next) ? {} : { viaCrafting: true }),
      });
      continue;
    }

    const madeHere = stillWanted > 0 && autoCraft ? craft(next, stillWanted, stock, new Set(), ledger) : 0;
    /* Every walkable recipe yields one, so this never over-produces today; if a
       recipe ever yields more, the extra is stock the reader now holds. */
    if (madeHere > stillWanted) stock[next] = (stock[next] || 0) + (madeHere - stillWanted);
    const fromCrafting = Math.min(madeHere, stillWanted);
    const short = Math.max(0, stillWanted - fromCrafting);
    rows.push({
      name: next,
      need: wanted,
      fromDepot,
      fromCrafting,
      short,
      coverage: short === 0 ? (fromCrafting > 0 ? 'craftable' : 'have') : 'short',
      ...(asked.has(next) ? {} : { viaCrafting: true }),
    });
  }

  /* Zeroes out, the same way the depot store keeps itself. */
  for (const name of Object.keys(stock)) if (!(stock[name] > 0)) delete stock[name];
  return { rows, craftingLmd: ledger.lmd, stock, made: ledger.made };
}

/** Whether the Workshop knows how to make this at all -- used to decide whether a row
 *  is worth offering a "craft" affordance, not to decide the numbers. */
function isCraftable(name: string): boolean {
  const f = FORMULAS[name];
  return !!f && WALKABLE.has(f.type);
}

function formulaFor(name: string): Formula | null {
  return FORMULAS[name] ?? null;
}

/**
 * How short each material really is, as a fraction of what the plan wants --
 * following a declared craft down to the ingredients that carry its shortfall.
 *
 * A row the reader has said they will CRAFT reports `short: 0`, because its
 * requirement moved down a tier: the resolver put the recipe's ingredients into
 * the list as rows of their own and the shortfall landed on those. Read naively
 * that says the craft is covered, so an operator whose whole bill is one
 * declared craft looks unblocked while the summary above says four materials
 * are missing. It is the exact case the reference screen shows -- Chiave, with
 * Manganese Trihydrate set to craft, reading BLOCKED.
 *
 * So a crafting row inherits its ingredients' shortfall, weighted by how much
 * of each the recipe wants. `seen` stops a cycle: the importer refuses to emit
 * one among the walkable families, and a resolver that hangs on bad data is a
 * worse failure than one that declines.
 */
function shortShares(resolution: Resolution): Map<string, number> {
  const byName = new Map(resolution.rows.map((r) => [r.name, r]));
  const cache = new Map<string, number>();

  function share(name: string, seen: Set<string>): number {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    const row = byName.get(name);
    if (!row || row.need <= 0) return 0;
    if (seen.has(name)) return 0;

    let value: number;
    if (row.coverage !== 'crafting') {
      value = row.short / row.need;
    } else {
      const recipe = FORMULAS[name];
      const runs = recipe ? Math.ceil(row.fromCrafting / Math.max(1, recipe.count)) : 0;
      const costs = (recipe?.costs ?? []).filter((c) => c.name !== 'LMD');
      let wanted = 0;
      let missing = 0;
      const next = new Set(seen).add(name);
      for (const cost of costs) {
        const qty = cost.count * runs;
        wanted += qty;
        missing += qty * share(cost.name, next);
      }
      /* Only the part of the row that is being CRAFTED can inherit a shortfall;
         whatever came straight out of the depot is already in hand. */
      const craftedShare = row.fromCrafting / row.need;
      value = wanted > 0 ? craftedShare * (missing / wanted) : 0;
    }
    value = Math.min(1, Math.max(0, value));
    cache.set(name, value);
    return value;
  }

  const out = new Map<string, number>();
  for (const row of resolution.rows) out.set(row.name, share(row.name, new Set()));
  return out;
}
return { BATTLE_RECORDS, expToBattleRecords, resolveNeeds, isCraftable, formulaFor, shortShares };
}

export const { BATTLE_RECORDS, expToBattleRecords, resolveNeeds, isCraftable, formulaFor, shortShares } = createCraftTools();
