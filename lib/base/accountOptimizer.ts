import type { AccountRecord } from '../account/accountStore';
import { BASE_PRESET_IDS, BASE_PRESETS, getFacilities, layoutProblems, presetLevels, presetSpots } from './baseConfig';
import { optimizeBase, sustainableOutput, type OptimizerResult, type OwnedOperator } from './baseOptimizer';
import type { SimulationBase, DailyOutput } from './baseSimulation';
import type { ProductionSpots, FacilityLevels, FactoryProducts } from './baseTypes';

export interface LayoutOption { id: string; label: string; spots: ProductionSpots; levels: FacilityLevels }
export interface AccountOptimizerInput {
  base: Omit<SimulationBase, 'facilities'>;
  roster: Record<string, OwnedOperator>;
  snapshot?: AccountRecord['base'];
  loginInterval: number;
  objective: 'balanced' | 'lmd' | 'exp';
  externalGold: number;
  compareLayouts: boolean;
}
export interface LayoutRecommendation extends LayoutOption {
  products: FactoryProducts;
  plan: OptimizerResult;
  output: DailyOutput;
  score: number;
}
export interface AccountOptimizerResult { recommendations: LayoutRecommendation[]; searched: number; rejected: number }

/** Respect already-upgraded right-side rooms, which cannot be downgraded in game. */
export function optimizerLayouts(snapshot?: AccountRecord['base'], compare = true): LayoutOption[] {
  const layouts: LayoutOption[] = snapshot ? [{ id: 'mine', label: 'Your layout', spots: snapshot.productionSpots, levels: snapshot.facilityLevels }] : [];
  if (compare || !snapshot) for (const id of BASE_PRESET_IDS) {
    const levels = presetLevels(id);
    if (snapshot && ['office', 'receptionRoom', 'trainingRoom'].some(room => (snapshot.facilityLevels[room] ?? 0) > (levels[room] ?? 0))) continue;
    layouts.push({ id, label: BASE_PRESETS[id].label, spots: presetSpots(id), levels });
  }
  if (compare || !snapshot) {
    // 1-5-3 trades one post for EXP production; 3-4-2 is the reference
    // spreadsheet's three-post layout, with the max-right power budget.
    const onePost = { ...presetSpots('2-4-3'), prod4: 'factory' as const };
    layouts.push({ id: '1-5-3', label: '1-5-3', spots: onePost, levels: presetLevels('2-4-3') });
    layouts.push({ id: '3-4-2', label: '3-4-2', spots: { ...presetSpots('2-5-2-right'), prod8: 'tradingPost' }, levels: presetLevels('2-5-2-right') });
  }
  const seen = new Set<string>();
  return layouts.filter(l => {
    if (layoutProblems(l.spots, l.levels).length) return false;
    const key = JSON.stringify(getFacilities(l.spots, l.levels).map(f => [f.id, f.kind, f.level]));
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Search each distinct distribution across factory levels. Same-level rooms are
 * interchangeable before staffing, but a level 2 gold factory differs from level 3. */
export function productOptions(layout: LayoutOption): FactoryProducts[] {
  const factories = getFacilities(layout.spots, layout.levels).filter(f => f.kind === 'factory' && f.capacity);
  const seen = new Set<string>();
  const result: FactoryProducts[] = [];
  for (let mask = 0; mask < 2 ** factories.length; mask++) {
    const gold = factories.filter((_, i) => mask & (1 << i));
    const key = gold.map(f => f.level).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(Object.fromEntries(factories.map((f, i) => [f.id, mask & (1 << i) ? 'Precious Metals' : 'Battle Records'])));
  }
  return result;
}

export function optimizeAccountBase(input: AccountOptimizerInput, progress?: (done: number, total: number, label: string) => void): AccountOptimizerResult {
  if (!Object.keys(input.roster).length) throw new Error('No known owned operators were found in this import.');
  if (!Number.isFinite(input.externalGold) || input.externalGold < 0 || input.externalGold > 1000) throw new Error('External gold must be between 0 and 1000 per day.');
  const layouts = optimizerLayouts(input.snapshot, input.compareLayouts);
  if (!layouts.length) throw new Error('The imported layout has an invalid power budget. Compare standard layouts or update your import.');
  const candidates = layouts.flatMap(layout => productOptions(layout).map(products => ({ layout, products })));
  const recommendations: LayoutRecommendation[] = [];
  let rejected = 0;
  const weights = { lmd: input.objective === 'exp' ? 0 : 1, exp: input.objective === 'lmd' ? 0 : 1, goldMade: 500 };
  candidates.forEach(({ layout, products }, index) => {
    progress?.(index, candidates.length, layout.label);
    const plan = optimizeBase({
      base: { ...input.base, facilities: getFacilities(layout.spots, layout.levels), dormitoryAmbience: layout.id === 'mine' ? input.snapshot?.dormitoryAmbience : undefined },
      roster: input.roster, loginInterval: input.loginInterval, factoryProducts: products,
      weights, sustainable: true, externalGold: input.externalGold,
    });
    if (!plan.simulation.periodic || plan.simulation.events.some(e => e.kind === 'exhausted')) { rejected++; return; }
    const output = sustainableOutput(plan.simulation.perDay, input.externalGold);
    const score = output.lmd * weights.lmd + output.exp * weights.exp;
    const recommendation = { ...layout, products, plan, output, score };
    const previous = recommendations.findIndex(r => r.id === layout.id);
    if (previous < 0) recommendations.push(recommendation);
    else if (score > recommendations[previous].score) recommendations[previous] = recommendation;
  });
  progress?.(candidates.length, candidates.length, 'Done');
  recommendations.sort((a, b) => b.score - a.score || (a.id === 'mine' ? -1 : b.id === 'mine' ? 1 : a.label.localeCompare(b.label)));
  return { recommendations, searched: candidates.length, rejected };
}
