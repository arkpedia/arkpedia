import { useMemo } from 'react';
import { useReleaseTable } from './context';
import { depotNames, type MaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { inGameOrder } from '@/lib/farming/materialSortOrder';
import type { FarmingTier } from '@/lib/farming/farmingTypes';
import { createCraftTools, type Formula } from '@/lib/planner/craft';
import type { ImportAliases } from '@/lib/planner/foreignImport';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import type { LevelTable } from '@/lib/planner/plannerLogic';
import { createSourceTools } from '@/lib/planner/sources';
import { planBuild as build } from '@/lib/planner/build';

type BuildArgs = Parameters<typeof build>;

/**
 * The planner's game tables, from the page's props (lib/content/tables.mjs).
 *
 * All of them arrive only with the page, which withContentPage guarantees on every path.
 * The recipes, battle records and supply stages used to keep a bundled copy as a no-release
 * fallback, compiled into the planner's chunk; the material catalogue used to be a list typed
 * out in lib/farming/materialSortOrder.ts. Both answered from the last deploy on a page
 * rendered from a newer release, so neither exists any more.
 */
export function usePlannerContent() {
  const recipes = useReleaseTable<Record<string, Formula>>('base-formulas');
  const battleRecords = useReleaseTable<{ name: string; exp: number }[]>('battle-records');
  const stages = useReleaseTable<Record<string, string[]>>('supply-stages');
  const levels = useReleaseTable<LevelTable>('operatorLevelExpLmd');
  const importAliases = useReleaseTable<ImportAliases>('import-aliases');
  const sortIds = useReleaseTable<Record<string, number>>('item-sort-ids');
  const farmingTiers = useReleaseTable<FarmingTier[]>('farming-tiers');
  const catalogue = useReleaseTable<MaterialCatalogue>('material-catalogue');
  const gameAccountMap = useReleaseTable<GameAccountMap>('game-account-map');
  return useMemo(() => {
    const craft = createCraftTools(recipes, battleRecords, catalogue.order);
    return { ...craft, ...createSourceTools(stages, craft.formulaFor, farmingTiers),
      levels, importAliases, catalogue, gameAccountMap,
      /** Every material the depot can hold, in the catalogue's (tier) order. */
      depotCatalogue: depotNames(catalogue),
      inGameOrder: inGameOrder(catalogue, sortIds),
      planBuild: (cost: BuildArgs[0], depot: BuildArgs[1], opts: BuildArgs[2]) => build(cost, depot, opts, craft) };
  }, [recipes, battleRecords, stages, levels, importAliases, sortIds, farmingTiers, catalogue, gameAccountMap]);
}
