import type { NeedRow } from './craft';

/**
 * What the plan's missing materials cost in sanity, as an estimate.
 *
 * The table is data/material-sanity.json (scripts/build/build-material-sanity.mjs): for each
 * material the cheapest permanent stage's sanity per drop from Penguin Statistics' measured
 * rates, or what it costs to craft from cheaper tiers where that is cheaper. Read from the
 * release like the other planner tables (lib/content/planner.ts), never compiled in.
 *
 * A material with no entry has no estimate (a Chip Catalyst, a Dualchip, a currency): it is
 * left out of the total and named as not counted, so the number is never a quiet undercount.
 */
export interface MaterialSanityTable {
  about?: string;
  source: { name: string; url: string; server: string; minRuns: number; fetchedAt: string };
  items: Record<string, { sanity: number; via: 'farm' | 'craft' | 'convert'; stage?: string }>;
}

export interface SanityEstimate {
  /** Sanity to cover every short material that has an estimate, rounded to whole sanity. */
  total: number;
  /** Per short material: its shortfall times its unit cost. */
  byMaterial: Map<string, number>;
  /** Short materials the table has no estimate for. */
  uncounted: string[];
}

export function createSanityTools(table: MaterialSanityTable) {
  /** Sanity for one material, or null when there is no estimate. */
  function unitSanity(name: string): { sanity: number; via: 'farm' | 'craft' | 'convert'; stage?: string } | null {
    return Object.prototype.hasOwnProperty.call(table.items, name) ? table.items[name] : null;
  }

  /**
   * The sanity to cover what is short. A row declared a craft or a purchase is not short (its
   * ingredients and certificates are rows of their own, counted there), so only `short` counts
   * and nothing is counted twice.
   */
  function sanityFor(rows: readonly Pick<NeedRow, 'name' | 'short'>[]): SanityEstimate {
    const byMaterial = new Map<string, number>();
    const uncounted: string[] = [];
    let total = 0;
    for (const row of rows) {
      if (row.short <= 0) continue;
      const unit = unitSanity(row.name);
      if (!unit) { uncounted.push(row.name); continue; }
      const sanity = unit.sanity * row.short;
      byMaterial.set(row.name, sanity);
      total += sanity;
    }
    return { total: Math.round(total), byMaterial, uncounted };
  }

  return { sanityTable: table, unitSanity, sanityFor };
}
