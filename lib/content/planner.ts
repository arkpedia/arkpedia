import { useMemo } from 'react';
import { useContentTable, useReleaseTable } from './context';
import formulas from '@/data/base-formulas.json';
import records from '@/data/battle-records.json';
import supply from '@/data/supply-stages.json';
import { inGameOrder } from '@/lib/farming/materialSortOrder';
import type { FarmingTier } from '@/lib/farming/farmingTypes';
import { createCraftTools, type Formula } from '@/lib/planner/craft';
import type { ImportAliases } from '@/lib/planner/foreignImport';
import type { LevelTable } from '@/lib/planner/plannerLogic';
import { createSourceTools } from '@/lib/planner/sources';
import { planBuild as build } from '@/lib/planner/build';

/**
 * The planner's game tables, from the page's props (lib/content/tables.mjs).
 *
 * The first three keep the bundled copy they always had as a no-release fallback. The
 * rest have none: the level costs, other planners' item ids, the depot's in-game order
 * and the farming guide used to be compiled into the planner's chunk and read from
 * there even on a page rendered from a newer release, so they now arrive only with the
 * page, which withContentPage guarantees on every path.
 */
export function usePlannerContent() {
  const recipes = useContentTable<Record<string, Formula>>('base-formulas', formulas);
  const battleRecords = useContentTable('battle-records', records);
  const stages = useContentTable('supply-stages', supply);
  const levels = useReleaseTable<LevelTable>('operatorLevelExpLmd');
  const importAliases = useReleaseTable<ImportAliases>('import-aliases');
  const sortIds = useReleaseTable<Record<string, number>>('item-sort-ids');
  const farmingTiers = useReleaseTable<FarmingTier[]>('farming-tiers');
  return useMemo(() => {
    const craft = createCraftTools(recipes, battleRecords);
    return { ...craft, ...createSourceTools(stages, craft.formulaFor, farmingTiers),
      levels, importAliases, inGameOrder: inGameOrder(sortIds),
      planBuild: (...args: Parameters<typeof build>) => build(args[0], args[1], args[2], craft) };
  }, [recipes, battleRecords, stages, levels, importAliases, sortIds, farmingTiers]);
}
