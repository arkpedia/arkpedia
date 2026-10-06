import { stockLimit, totalRewards, type ResolvedRewardStore } from './rewardTotals';

/*
 * An event's free rewards at a glance, laid out the way community compilations share them: one
 * row per kind (Tier 5 materials ... furniture). The pull currencies are in the Headhunting row;
 * a second list of them by source repeated it (removed 2026-10-05).
 * Computed on the server from the same blocks as the All totals (the store at its stock limits,
 * the sign-in, missions, first clears and gifts); packs are bought, so they are not in it.
 */
export interface SummaryItem { name: string; count: number; iconPath: string | null }
export interface SummaryRow { label: string; items: SummaryItem[] }
export interface RewardSummary { rows: SummaryRow[]; sources: string[] }

const ROWS = [
  'Tier 5 materials', 'Tier 4 materials', 'Tier 3 materials', 'Tier 2 materials', 'Tier 1 materials',
  'Chips', 'Skill summaries', 'Module materials', 'EXP', 'LMD', 'Headhunting', 'Recruitment', 'Sanity',
  'Chip catalysts', 'Vouchers', 'Furniture parts', 'Operators', 'Outfits', 'Furniture', 'Other',
] as const;
type Row = (typeof ROWS)[number];

/** The pull currencies: Orundum, Originite Prime, the daily free roll and every kind of Headhunting
 *  Permit, a limited banner's ten-roll included as the tables spell it ("Sing while Drinking
 *  Headhunting Permit (ten-roll)", "Awakening Commemoration Permit (ten-roll)", the CN
 *  "封缄诺言寻访凭证 (ten-roll)"). Without the suffix none of the 30-odd limited permits matched, and
 *  they reached Headhunting only by the tables' kind, which a store row does not carry. */
export const isPullCurrency = (name: string) => /^(Orundum|Originite Prime|Daily free headhunting roll)$|(Headhunting Permit|寻访凭证)( \(ten-roll\))?$|Permit \(ten-roll\)$/.test(name);

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
  // The totals are the All row's (totalRewards: one tile per name, the first icon any block has --
  // a store's furniture row may have none where the milestone's, by id, does).
  const byRow = new Map<Row, SummaryItem[]>();
  for (const { name, total, iconPath } of totalRewards(stores)) {
    const row = rowOf(name, context);
    byRow.set(row, [...(byRow.get(row) ?? []), { name, count: total, iconPath }]);
  }
  /* Within a row, the catalogue's order, then the largest count. Not sortByMaterialOrder, which
     puts what the catalogue does not know FIRST, alphabetically: right for the flat All row, where
     that is the outfits, but here a row is one kind, and in Headhunting nothing is in the
     catalogue, so it would read Headhunting Permit, Originite Prime, Orundum where a compilation
     leads with the Orundum. */
  const index = new Map(order.map((name, i) => [name, i]));
  const rank = (name: string) => index.get(name) ?? Number.MAX_SAFE_INTEGER;
  return {
    rows: ROWS.filter(row => byRow.has(row)).map(row => ({
      label: row,
      items: byRow.get(row)!.sort((a, b) => rank(a.name) - rank(b.name) || b.count - a.count || a.name.localeCompare(b.name)),
    })),
    sources: [...new Set(stores.filter(store => store.items.some(item => stockLimit(item.stock) !== null)).map(store => store.type))],
  };
}
