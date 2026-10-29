export const MIN_RUNS: number;

export interface MaterialSanityInputs {
  /** Penguin Statistics /result/matrix. */
  matrix: { stageId: string; itemId: string; times: number; quantity: number; end?: number | null }[];
  /** /stages. */
  stages: { stageId: string; code: string; apCost: number; stageType?: string }[];
  /** /items. */
  items: { itemId: string; name?: string; name_i18n?: { en?: string } }[];
  /** data/base-formulas.json. */
  formulas: Record<string, { type: string; count: number; costs: { name: string; count: number }[] }>;
  /** The materials to price. */
  names: string[];
}

export function materialSanity(inputs: MaterialSanityInputs): Record<string, { sanity: number; via: 'farm' | 'craft' | 'convert'; stage?: string }>;
