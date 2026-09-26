/** One listing in an event's reward store, as /events/[slug] receives it. */
export interface ResolvedRewardItem {
  name: string;
  quantity: number | string;
  price: number | null;
  currency: string;
  /** How many times it can be bought. A count ("5"), or anything else for no limit:
   *  the data has written unlimited stock as both "unlimited" and "∞". */
  stock: string;
  iconPath: string | null;
}

export interface ResolvedRewardStore {
  type: string;
  name: string;
  items: ResolvedRewardItem[];
}

export interface RewardTotal {
  name: string;
  iconPath: string | null;
  total: number;
}

/**
 * How many times a listing can be bought, or null when there is no limit.
 *
 * Anything that is not a whole number is unlimited. The release writes the symbol
 * "∞" on six events (People, A People; Critical Phase Transition; ...), and this
 * used to skip only the word "unlimited": parseInt('∞') is NaN, `|| 0` made it
 * zero, and the All view printed "×0" for LMD and Grindstone on every one of them
 * (GE-15). Asking "is it a count?" instead of listing the spellings of "no" means
 * the next spelling cannot bring the zero back.
 */
export function stockLimit(stock: string): number | null {
  const text = String(stock).trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

export function parseRewardQuantity(q: number | string): number {
  if (typeof q === 'number') return q;
  const m = String(q).trim().match(/^(\d+(?:\.\d+)?)\s*([KkMm]?)$/);
  if (!m) return parseFloat(String(q)) || 0;
  const base = parseFloat(m[1]);
  const suffix = m[2].toLowerCase();
  if (suffix === 'k') return Math.round(base * 1000);
  if (suffix === 'm') return Math.round(base * 1000000);
  return Math.round(base);
}

/** Skins first (they are never in the material catalogue), alphabetically; then the
 *  materials in the game's tier order. The reverse of sortMaterials(), whose lists
 *  are pure materials and where an unknown name is a data gap. `order` is the
 *  release's catalogue order for this event's rewards (the page's materialOrder prop). */
export function sortByMaterialOrder<T extends { name: string }>(items: T[], order: readonly string[]): T[] {
  const index = new Map(order.map((n, i) => [n, i]));
  return [...items].sort((a, b) => {
    const ai = index.get(a.name);
    const bi = index.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai === undefined && bi === undefined) return a.name.localeCompare(b.name);
    if (ai === undefined) return -1;
    return 1;
  });
}

/**
 * Total obtainable of each material across every FINITE-stock listing: quantity x
 * stock, summed over every store that offers it. Unlimited listings are left out
 * entirely -- a material with a finite listing and an unlimited one shows the
 * finite total, and a material whose only listings are unlimited is not in the
 * totals at all (its own store tab still shows it). So no total is ever zero
 * because a listing had no limit.
 */
export function computeRewardTotals(stores: ResolvedRewardStore[], order: readonly string[]): RewardTotal[] {
  const totals = new Map<string, RewardTotal>();
  for (const store of stores) {
    for (const item of store.items) {
      const limit = stockLimit(item.stock);
      if (limit === null) continue;
      const add = parseRewardQuantity(item.quantity) * limit;
      const prev = totals.get(item.name)?.total ?? 0;
      totals.set(item.name, { name: item.name, iconPath: item.iconPath, total: prev + add });
    }
  }
  return sortByMaterialOrder(Array.from(totals.values()), order);
}
