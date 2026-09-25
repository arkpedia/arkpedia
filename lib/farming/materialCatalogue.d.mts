export interface MaterialCatalogueItem {
  /** The game's item id. */
  itemId: string;
  /** 1-5 for the tiered materials; the item's rarity otherwise. */
  tier: number;
  /** Which client the id comes from: the EN one, or the CN one ahead of Global. */
  client: 'EN' | 'CN';
}
export interface MaterialCatalogue {
  version: 1;
  /** Every name the planner can emit, highest tier first: the resolver's walk order and the
   *  cost-list order. EXP leads; everything after it is a material the depot can hold. */
  order: string[];
  /** The depot's headings, every held material in exactly one. */
  groups: { tag: string; names: string[] }[];
  items: Record<string, MaterialCatalogueItem>;
}
type CostItem = { name: string; quantity: number | string };
export declare function plannerCostLists(op: unknown): CostItem[][];
export declare function plannerCostNames(op: unknown): string[];
export declare function depotNames(catalogue: Pick<MaterialCatalogue, 'order'>): string[];
export declare function uncataloguedCosts(op: unknown, catalogue: Pick<MaterialCatalogue, 'order'>): string[];
export declare function checkMaterialCatalogue<T>(value: T): T & MaterialCatalogue;
