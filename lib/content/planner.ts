import { useMemo } from 'react';
import { useContentTable } from './context';
import formulas from '@/data/base-formulas.json';
import records from '@/data/battle-records.json';
import supply from '@/data/supply-stages.json';
import { createCraftTools, type Formula } from '@/lib/planner/craft';
import { createSourceTools } from '@/lib/planner/sources';
import { planBuild as build } from '@/lib/planner/build';

export function usePlannerContent() {
  const recipes = useContentTable<Record<string, Formula>>('base-formulas', formulas);
  const battleRecords = useContentTable('battle-records', records);
  const stages = useContentTable('supply-stages', supply);
  return useMemo(() => {
    const craft = createCraftTools(recipes, battleRecords);
    return { ...craft, ...createSourceTools(stages, craft.formulaFor),
      planBuild: (...args: Parameters<typeof build>) => build(args[0], args[1], args[2], craft) };
  }, [recipes, battleRecords, stages]);
}
