import type { CostGroup } from '../operators/operatorTypes';
import { depotNames, type MaterialCatalogue } from './materialCatalogue.mjs';

/*
 * Orders for material lists, read from the planner's material catalogue.
 *
 * The catalogue used to be typed out here -- the tier lists, the chip ladder, the depot's
 * groups -- so a material the game added needed a code change and a redeploy, and four
 * that operators already cost were missing with nothing to say so. It is a game record now,
 * data/material-catalogue.json, derived from the item tables by
 * scripts/build/build-material-catalogue.mjs and carried by the content release
 * (lib/content/tables.mjs). Every function here takes the catalogue, or the part of its
 * order a page needs, as a required argument: there is no bundled copy to fall back on.
 */

/**
 * The order the game's own depot lists things in.
 *
 * item_table gives every item a sortId and that sortId IS the depot screen's order -- LMD
 * 10201, Pure Gold 10202, the certificates 10203/4/5. scripts/build/build-ingame-order.mjs
 * pulls the numbers out for every material the site has art for (data/item-sort-ids.json);
 * this sorts the catalogue by them. It was checked against a hand transcription of a real
 * depot: 96 of the 96 materials that carry a sortId came out in exactly the screen's order.
 *
 * Kept apart from the catalogue's own order, which is ranked by TIER because the crafting
 * resolver walks it that way (lib/planner/craft.ts). The game's order groups by material
 * LINE instead, so tier is not monotonic down it. This one is display only.
 */
export function inGameOrder(catalogue: Pick<MaterialCatalogue, 'order'>, sortIds: Record<string, number>): string[] {
  /* EXP is a number an operator needs, not a thing you hold, so it has no place on a depot
     screen and no sortId either. */
  return depotNames(catalogue)
    .sort((a, b) => (sortIds[a] ?? Infinity) - (sortIds[b] ?? Infinity) || a.localeCompare(b));
}

/* Every holdable material has a place in that order. A name with no sortId sorts to the
   end, which is a tile in the wrong place rather than a missing one -- silent either way,
   so it fails here instead. /planner's table loader runs this wherever the tables are read
   from data/ -- the build's prerender and the content export. The browser sorts a missing
   one last. */
export function checkItemSortIds(sortIds: Record<string, number>, catalogue: Pick<MaterialCatalogue, 'order'>): Record<string, number> {
  const placeless = depotNames(catalogue).filter((name) => sortIds[name] === undefined);
  if (placeless.length) {
    throw new Error(
      'materialSortOrder: no sortId for ' + placeless.join(', ') +
      '. Re-run scripts/build/build-ingame-order.mjs; if the game genuinely has no entry for it, ' +
      'add an alias in scripts/lib/material-items.mjs the way Information Fragment(s) has one, or its ' +
      'English name to data/material-names.json for a CN-only material.',
    );
  }
  return sortIds;
}

/**
 * The part of the catalogue's order a set of lists needs, in that order: what a page that
 * only SORTS costs (an operator's upgrade rows, an event's rewards) carries in its props
 * instead of the whole table. Computed where the page's data is built, from the release's
 * catalogue, so a new material sorts correctly without a redeploy.
 */
export function materialOrderFor(catalogue: Pick<MaterialCatalogue, 'order'>, names: Iterable<string>): string[] {
  const wanted = new Set(names);
  return catalogue.order.filter((name) => wanted.has(name));
}

/** Sorts a material list by `order` (the catalogue's, or the slice of it a page carries).
 * Anything not in it (shouldn't normally happen, but data is data) sorts after everything
 * that is, alphabetically among itself rather than disappearing or erroring. */
export function sortMaterials(items: CostGroup, order: readonly string[]): CostGroup {
  const index = new Map(order.map((name, i) => [name, i]));
  return [...items].sort((a, b) => {
    const ai = index.get(a.name);
    const bi = index.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}
