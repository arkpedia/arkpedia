/**
 * What the permanent certificate store sells that nothing else does, by hand.
 *
 * It has to be by hand. The Chip Catalyst appears nowhere in shop_client_table.json --
 * zero occurrences of its id, its name or its constant -- because the store's stock is
 * server-side and no shipped table carries it. So this is the same kind of curated map
 * as the farming guide, kept deliberately small: one entry, for the one material with no
 * other source at all. A Chip Catalyst does not drop and cannot be crafted, and a
 * Dualchip needs one, so without this the planner would send a reader looking for
 * something and give them nowhere to look.
 *
 * Read by two places that have to agree: the source tools (lib/planner/sources.ts), which
 * say where a material comes from, and the resolver (lib/planner/craft.ts), which turns a
 * material the reader has chosen to BUY into the certificates it costs. Code, not a release
 * table, like the farming guide's constants next to it.
 *
 * `price` is the certificates one costs. A made-up number is worse than none, so an entry
 * without one is still listed as a place to buy and cannot be converted.
 */
export interface StorePrice { currency: string; price?: number }

export const CERTIFICATE_STORE: Readonly<Record<string, StorePrice>> = {
  'Chip Catalyst': { currency: 'Purchase Certificate', price: 90 },
};

/** The certificates a purchase of `count` costs, or null when the store does not sell it for a known price. */
export function storeCost(name: string, count: number): { currency: string; amount: number } | null {
  const entry = CERTIFICATE_STORE[name];
  if (!entry || entry.price === undefined) return null;
  return { currency: entry.currency, amount: entry.price * count };
}
