import type { CostGroup } from '@/lib/operators/operatorTypes';
import type { Depot } from './depot';
import { CERTIFICATE_STORE, storeCost } from './store';

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

/** 'crafting': made at a bench the reader declared. 'buying': bought in the certificate
 *  store, which the reader declared; the certificates it costs are rows of their own. */
/** 'incoming': covered by what events and shops will give (Incoming), not by the depot. */
export type Coverage = 'have' | 'craftable' | 'crafting' | 'buying' | 'incoming' | 'short';

/**
 * Materials the reader does not hold yet but counts on: what the events up to a chosen date give
 * for free, and what their shops sell (lib/planner/farmingMethod.ts). A virtual stock beside the
 * depot, never part of it: the resolver reads it only after the depot, a Build resolves against
 * the real depot alone (planBuild passes null), and `stock` on the result never includes it.
 */
export interface Incoming {
  /** Material -> what arrives and when: a date (YYYY-MM-DD, the day the event that gives it ends) or
   *  null for what is available now. Taken earliest first, so a shortfall is dated by the last
   *  tranche it needed. */
  arrivals: Readonly<Record<string, readonly Tranche[]>>;
  /** Materials a store sells without a limit, with the date its event ends (null: on sale now): any
   *  shortfall in them is covered from then. */
  unlimited: ReadonlyMap<string, string | null>;
}

/** An amount of one material and the day it will be there. */
export interface Tranche { date: string | null; count: number }

export interface NeedRow {
  name: string;
  /** How many the plan asks for. */
  need: number;
  /** How many came straight out of the depot. */
  fromDepot: number;
  /** How many the events and shops will give (Incoming), after the depot. Absent when none. */
  fromIncoming?: number;
  /** Of `fromIncoming`, how many rest on a store that sells it without a limit rather than on a stock. */
  fromUnlimited?: number;
  /** The day the last of `fromIncoming` should be there (YYYY-MM-DD); absent when all of it is available now. */
  readyBy?: string;
  /** How many the Workshop could make from what was left after everything above. */
  fromCrafting: number;
  /** How many the reader chose to buy in the certificate store. Absent when none. */
  fromBuying?: number;
  /** What you still have to go and get. */
  short: number;
  coverage: Coverage;
  /** True when this row is only in the list because something above it is being
   *  crafted out of it. Worth saying: it is not a material the plan asked for. */
  viaCrafting?: boolean;
  /** Of `need`, how many the upgrades themselves ask for. */
  direct: number;
  /** Of `need`, how many go into each material being crafted out of this one, by the
   *  crafted material's name: `direct` plus these is `need`. Absent when none do. A
   *  material can be both, and the page says which part is which. */
  forCrafts?: Record<string, number>;
  /** Of `need`, how many go to buying each material in the store, by the bought material's
   *  name (a certificate row says which purchase it pays for). Absent when none do. */
  forBuys?: Record<string, number>;
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

/**
 * The resolver over one release's tables: its recipes (data/base-formulas.json), its battle
 * records (data/battle-records.json) and the order of its material catalogue
 * (data/material-catalogue.json), which ranks the walk. Every one is required. There is no
 * bundled instance: one would compile a deploy's copies into the browser bundle and answer
 * from them on a page rendered from a newer release, which is what the module-level instance
 * that used to sit at the bottom of this file did for any caller that forgot to pass the
 * page's (usePlannerContent passes them).
 */
export function createCraftTools(formulas: Record<string, Formula>, records: readonly { name: string; exp: number }[], order: readonly string[]) {


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

/**
 * Which recipes a reader may DECLARE a craft for: the walkable ones, and the Dualchip.
 *
 * A Dualchip is two Chip Packs and a Chip Catalyst at the Factory (type MANUFACTURE, which
 * also covers the Battle Records and Pure Gold, whose recipes name no ingredients, and the
 * Originium Shard, so the type alone is not the test). It was left out of the walk because
 * its ingredients lead down into the chip trades; but a declaration descends exactly one
 * level, to rows the reader reads and fills (Chip Packs are F_ASC and never entered), so the
 * cycle is not reachable from here. Automatic crafting keeps WALKABLE: it would have to
 * decide on the reader's behalf, and it is off on the page anyway.
 */
const isDualchip = (recipe: Formula) => recipe.type === 'MANUFACTURE' && recipe.room === 'FACTORY'
  && recipe.costs.some((cost) => cost.name === 'Chip Catalyst');
const declarable = (recipe: Formula) => WALKABLE.has(recipe.type) || isDualchip(recipe);

const STORE_CURRENCIES = new Set(Object.values(CERTIFICATE_STORE).map((entry) => entry.currency));

/** Highest tier first, which is the order the catalogue already encodes. */
const TIER_RANK = new Map(order.map((name, i) => [name, i]));

/**
 * EXP is not a material you hold; battle records are.
 *
 * Read from the table rather than restated here. They are four numbers that have not
 * moved in years, which is exactly the argument for typing them in -- and exactly why
 * a typo in them would never be noticed. The importer writes them out of
 * item_table.expItems, already sorted largest first, which is the order the greedy
 * conversion below spends them in.
 */
const BATTLE_RECORDS: readonly { name: string; exp: number }[] = records;

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
  opts: { crafting?: ReadonlySet<string>; buying?: ReadonlySet<string>; incoming: Incoming | null; autoCraft: boolean },
): Resolution {
  const stock: Depot = { ...depot };
  /* Each material's tranches, earliest first, copied: a row spends from them and the next must not. */
  const arriving = new Map<string, Tranche[]>(Object.entries(opts.incoming?.arrivals ?? {}).map(([name, list]) => [name,
    list.map((t) => ({ ...t })).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))]));
  const declared = opts.crafting ?? new Set<string>();
  const buying = opts.buying ?? new Set<string>();
  const { autoCraft } = opts;

  /* One map rather than a list, because a declared craft ADDS to it as we go. */
  const totals = new Map<string, number>();
  const asked = new Set<string>();
  /* What each total is for: the upgrades' own ask, and each declared craft's draw on it. */
  const direct = new Map<string, number>();
  const forCrafts = new Map<string, Record<string, number>>();
  const forBuys = new Map<string, Record<string, number>>();
  for (const item of need) {
    const qty = Math.ceil(Number(item.quantity) || 0);
    if (qty <= 0) continue;
    totals.set(item.name, (totals.get(item.name) ?? 0) + qty);
    direct.set(item.name, (direct.get(item.name) ?? 0) + qty);
    asked.add(item.name);
  }
  const purpose = (name: string) => {
    const crafts = forCrafts.get(name);
    const buys = forBuys.get(name);
    return { direct: direct.get(name) ?? 0, ...(crafts ? { forCrafts: { ...crafts } } : {}), ...(buys ? { forBuys: { ...buys } } : {}) };
  };

  /* The store's currency last. A purchase adds certificates to the map while it is walked, and
     they sit above every material in the catalogue, so left in tier order a row already
     resolved would be resolved again. Last, every purchase has been added by the time they are
     read. */
  const rank = (name: string) => STORE_CURRENCIES.has(name) ? Infinity : TIER_RANK.get(name) ?? Infinity;
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
    let stillWanted = wanted - fromDepot;

    /* What is on its way covers what the depot did not, before any bench is asked: a material
       an event gives is one not to craft. A store without a limit covers the rest. */
    let fromIncoming = 0;
    let fromUnlimited = 0;
    let readyBy = '';
    if (stillWanted > 0 && opts.incoming) {
      for (const tranche of arriving.get(next) ?? []) {
        if (stillWanted <= 0) break;
        const take = Math.min(tranche.count, stillWanted);
        if (take <= 0) continue;
        tranche.count -= take;
        fromIncoming += take;
        stillWanted -= take;
        if (tranche.date && tranche.date > readyBy) readyBy = tranche.date;
      }
      if (stillWanted > 0 && opts.incoming.unlimited.has(next)) {
        const from = opts.incoming.unlimited.get(next) ?? null;
        fromUnlimited = stillWanted; fromIncoming += stillWanted; stillWanted = 0;
        if (from && from > readyBy) readyBy = from;
      }
    }
    const incomingBits = fromIncoming > 0 ? { fromIncoming, ...(fromUnlimited > 0 ? { fromUnlimited } : {}), ...(readyBy ? { readyBy } : {}) } : {};

    const recipe = FORMULAS[next];
    if (stillWanted > 0 && declared.has(next) && recipe && declarable(recipe)) {
      /* Declared. The shortfall becomes the recipe's, not this material's. */
      const runs = Math.ceil(stillWanted / recipe.count);
      for (const cost of recipe.costs) {
        if (cost.name === 'LMD') { ledger.lmd += cost.count * runs; continue; }
        totals.set(cost.name, (totals.get(cost.name) ?? 0) + cost.count * runs);
        const uses = forCrafts.get(cost.name) ?? {};
        uses[next] = (uses[next] ?? 0) + cost.count * runs;
        forCrafts.set(cost.name, uses);
        done.delete(cost.name);
      }
      ledger.lmd += recipe.lmd * runs;
      ledger.made[next] = (ledger.made[next] || 0) + runs * recipe.count;
      rows.push({
        name: next,
        need: wanted,
        fromDepot,
        ...incomingBits,
        fromCrafting: stillWanted,
        short: 0,
        coverage: 'crafting',
        ...(asked.has(next) ? {} : { viaCrafting: true }),
        ...purpose(next),
      });
      continue;
    }

    const cost = stillWanted > 0 && buying.has(next) ? storeCost(next, stillWanted) : null;
    if (cost) {
      /* Declared a purchase. The shortfall becomes the store's price in certificates, a row of
         its own; the material is covered the way a crafted one is, by what stands behind it. */
      totals.set(cost.currency, (totals.get(cost.currency) ?? 0) + cost.amount);
      const uses = forBuys.get(cost.currency) ?? {};
      uses[next] = (uses[next] ?? 0) + cost.amount;
      forBuys.set(cost.currency, uses);
      done.delete(cost.currency);
      rows.push({
        name: next,
        need: wanted,
        fromDepot,
        ...incomingBits,
        fromCrafting: 0,
        fromBuying: stillWanted,
        short: 0,
        coverage: 'buying',
        ...(asked.has(next) ? {} : { viaCrafting: true }),
        ...purpose(next),
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
      ...incomingBits,
      fromCrafting,
      short,
      coverage: short === 0 ? (fromCrafting > 0 ? 'craftable' : fromIncoming > 0 ? 'incoming' : 'have') : 'short',
      ...(asked.has(next) ? {} : { viaCrafting: true }),
      ...purpose(next),
    });
  }

  /* The certificates a purchase costs sit beside the purchase, not at the foot of the list
     where they were resolved: a bought Chip Catalyst and its 360 certificates are one decision. */
  for (const row of [...rows]) {
    if (!row.forBuys) continue;
    const at = Math.min(...Object.keys(row.forBuys).map((bought) => rows.findIndex((r) => r.name === bought)).filter((i) => i >= 0));
    const from = rows.indexOf(row);
    if (!Number.isFinite(at) || at < 0 || from === at + 1) continue;
    rows.splice(from, 1);
    rows.splice(from < at ? at : at + 1, 0, row);
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

/** Whether a reader may declare a craft for this material (WALKABLE or a Dualchip): what the
 *  Craft box on a card turns on. isCraftable stays the narrower question the automatic walk asks. */
function isDeclarable(name: string): boolean {
  const f = FORMULAS[name];
  return !!f && declarable(f);
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
    if (row.coverage === 'buying') {
      /* Bought with certificates: it is as short as the certificates behind it are. The
         currency's own row says how short that is, so a bought catalyst with no certificates
         to pay for it reads blocked like a crafted one with a missing ingredient. */
      const cost = storeCost(name, 1);
      const paid = cost ? share(cost.currency, new Set(seen).add(name)) : 1;
      value = (row.fromBuying ?? 0) / row.need * paid;
    } else if (row.coverage !== 'crafting') {
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
return { BATTLE_RECORDS, expToBattleRecords, resolveNeeds, isCraftable, isDeclarable, formulaFor, shortShares };
}

export type CraftTools = ReturnType<typeof createCraftTools>;
/** The lookup createSourceTools takes: one release's recipe for a product, or null. */
export type FormulaLookup = CraftTools['formulaFor'];
