import { checkMaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { materialOrderFor } from '@/lib/farming/materialSortOrder';

/**
 * A page payload's materialOrder, for a release exported before its page carried one.
 *
 * The operator and event pages sort their cost and reward lists by the slice of the material
 * catalogue their props carry (materialOrderFor, computed where the page data is built from the
 * release's data/material-catalogue.json). A release published before that has no such prop, and
 * the page would crash on it until the next content run re-exported every page. So, like
 * withContentPage does for a table (attachTables), the missing slice comes from this
 * deployment's catalogue, on the server, until then. Pass it as withContentPage's finalize.
 */
export async function withMaterialOrder<P extends { materialOrder?: string[] }>(props: P, names: (props: P) => Iterable<string>): Promise<P & { materialOrder: string[] }> {
  if (Array.isArray(props.materialOrder)) return props as P & { materialOrder: string[] };
  const catalogue = checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default);
  return { ...props, materialOrder: materialOrderFor(catalogue, names(props)) };
}
