import { parseRewardQuantity, stockLimit, type ResolvedRewardStore } from './rewardTotals';

/*
 * An event's free rewards at a glance, laid out the way community compilations share them: one
 * row per kind (Tier 5 materials ... furniture), and the pull currencies by where they came from.
 * Computed on the server from the same blocks as the All totals (the store at its stock limits,
 * the sign-in, missions, first clears and gifts); packs are bought, so they are not in it.
 */
export interface SummaryItem { name: string; count: number; iconPath: string | null }
export interface SummaryRow { label: string; items: SummaryItem[] }
export interface PullSourceRow { source: string; items: SummaryItem[] }
export interface RewardSummary { rows: SummaryRow[]; pulls: PullSourceRow[]; sources: string[] }

const ROWS = [
  'Tier 5 materials', 'Tier 4 materials', 'Tier 3 materials', 'Tier 2 materials', 'Tier 1 materials',
  'Chips', 'Skill summaries', 'Module materials', 'EXP', 'LMD', 'Headhunting', 'Recruitment', 'Sanity',
  'Chip catalysts', 'Vouchers', 'Furniture parts', 'Operators', 'Outfits', 'Furniture', 'Other',
] as const;
type Row = (typeof ROWS)[number];

/** The pull currencies: Orundum, Originite Prime and every kind of Headhunting Permit. */
export const isPullCurrency = (name: string) => /^(Orundum|Originite Prime)$|Headhunting Permit$/.test(name);

export interface SummaryContext {
  /** The material catalogue's groups ("Tier 5", "Skills & modules", ...), for the tiers. */
  groups: { tag: string; names: string[] }[];
  operators: ReadonlySet<string>;
  /** Outfit and furniture names known to this event (its store types and furniture sets). */
  outfits: ReadonlySet<string>;
  furniture: ReadonlySet<string>;
  /** What the game tables say an item is (data/event-rewards.json's item kinds), by its name:
   *  how an item named only in the CN client's words (a CN-only operator, a limited permit) is
   *  placed. */
  kinds: ReadonlyMap<string, string>;
}

/** A pull currency by its name, or by the tables' word for it (a CN permit's name is Chinese). */
const isPull = (name: string, context: SummaryContext) => isPullCurrency(name) || (context.kinds.get(name) === 'permit' && !/Recruitment Permit|Expedited Plan/.test(name)) || (context.kinds.get(name) === 'currency' && /^(源石|合成玉)$/.test(name));

export function rowOf(name: string, context: SummaryContext): Row {
  const tier = context.groups.find(group => /^Tier \d$/.test(group.tag) && group.names.includes(name))?.tag;
  if (tier) return `${tier} materials` as Row;
  if (isPull(name, context)) return 'Headhunting';
  if (name === 'LMD') return 'LMD';
  if (name === 'Chip Catalyst') return 'Chip catalysts';
  if (/(Dualchip|Chip Pack|Chip)$/.test(name)) return 'Chips';
  if (/^Skill Summary/.test(name)) return 'Skill summaries';
  if (/^(Module Data Block|Data Supplement)/.test(name)) return 'Module materials';
  if (/Battle Record$/.test(name)) return 'EXP';
  if (/^(Recruitment Permit|Expedited Plan)$/.test(name)) return 'Recruitment';
  if (/Sanity|Potion|Sampler/.test(name)) return 'Sanity';
  if (/Voucher|Purchase Certificate/.test(name)) return 'Vouchers';
  if (name === 'Furniture Part') return 'Furniture parts';
  const kind = context.kinds.get(name);
  if (context.operators.has(name) || kind === 'operator') return 'Operators';
  if (context.outfits.has(name) || kind === 'outfit') return 'Outfits';
  if (context.furniture.has(name) || kind === 'furniture') return 'Furniture';
  if (kind === 'sanity') return 'Sanity';
  return 'Other';
}

export function rewardSummary(stores: ResolvedRewardStore[], context: SummaryContext, order: readonly string[]): RewardSummary {
  const totals = new Map<string, SummaryItem>();
  const pulls = new Map<string, Map<string, SummaryItem>>();
  for (const store of stores) {
    for (const item of store.items) {
      const limit = stockLimit(item.stock);
      if (limit === null) continue;
      const count = parseRewardQuantity(item.quantity) * limit;
      if (!count) continue;
      const held = totals.get(item.name);
      if (held) held.count += count; else totals.set(item.name, { name: item.name, count, iconPath: item.iconPath });
      if (isPull(item.name, context)) {
        const source = pulls.get(store.type) ?? pulls.set(store.type, new Map()).get(store.type)!;
        const at = source.get(item.name);
        if (at) at.count += count; else source.set(item.name, { name: item.name, count, iconPath: item.iconPath });
      }
    }
  }
  const rank = (name: string) => { const index = order.indexOf(name); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
  const byRow = new Map<Row, SummaryItem[]>();
  for (const item of totals.values()) {
    const row = rowOf(item.name, context);
    byRow.set(row, [...(byRow.get(row) ?? []), item]);
  }
  const pullRank = (name: string) => (name === 'Originite Prime' ? 0 : name === 'Orundum' ? 1 : 2);
  return {
    rows: ROWS.filter(row => byRow.has(row)).map(row => ({
      label: row,
      items: byRow.get(row)!.sort((a, b) => rank(a.name) - rank(b.name) || b.count - a.count || a.name.localeCompare(b.name)),
    })),
    pulls: [...pulls.entries()].map(([source, items]) => ({ source, items: [...items.values()].sort((a, b) => pullRank(a.name) - pullRank(b.name) || a.name.localeCompare(b.name)) })),
    sources: [...new Set(stores.filter(store => store.items.some(item => stockLimit(item.stock) !== null)).map(store => store.type))],
  };
}
