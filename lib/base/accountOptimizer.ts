import type { AccountRecord } from '../account/accountStore';
import { BASE_PRESET_IDS, BASE_PRESETS, getFacilities, layoutProblems, presetLevels, presetSpots } from './baseConfig';
import { optimizeBase, sustainableOutput, type OptimizerResult, type OwnedOperator } from './baseOptimizer';
import { evaluate, genomeFromResult, genomeNotes, toOptimizerResult, type Evaluation, type Genome, type GenomeContext } from './planGenome';
import { anneal } from './annealBase';
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
  /** Count the Power Plants' drones, spent where each is worth most under the funded scoring. Default true. */
  drones?: boolean;
  /** Search time in seconds, 5 to 600. Default 120. */
  searchSeconds?: number;
}
export interface LayoutRecommendation extends LayoutOption {
  products: FactoryProducts;
  /** The objective's weights, which drones were spent by: a saved rotation scores with the same ones. */
  weights: { lmd: number; exp: number; goldMade: number };
  plan: OptimizerResult;
  output: DailyOutput;
  score: number;
}
export interface AccountOptimizerResult { recommendations: LayoutRecommendation[]; searched: number; rejected: number }

/** Production layouts the optimizer will search: 243 (2 Trading Posts, 4 Factories, 3 Power Plants) and 252
 * (2, 5, 2). Others (153, 342, ...) are left out to keep the search small. */
const productionCounts = (spots: ProductionSpots) => {
  const count = (kind: string) => Object.values(spots).filter(k => k === kind).length;
  return `${count('tradingPost')}${count('factory')}${count('powerPlant')}`;
};
export const SEARCHED_LAYOUT_SHAPES = ['243', '252'];

/** Respect already-upgraded right-side rooms, which cannot be downgraded in game. */
export function optimizerLayouts(snapshot?: AccountRecord['base'], compare = true): LayoutOption[] {
  const layouts: LayoutOption[] = [];
  // The imported layout is searched when the reader asks for it alone, or when it is itself a 243 or 252.
  if (snapshot && (!compare || SEARCHED_LAYOUT_SHAPES.includes(productionCounts(snapshot.productionSpots)))) layouts.push({ id: 'mine', label: 'Your layout', spots: snapshot.productionSpots, levels: snapshot.facilityLevels });
  if (compare || !snapshot) for (const id of BASE_PRESET_IDS) {
    const levels = presetLevels(id);
    if (snapshot && ['office', 'receptionRoom', 'trainingRoom'].some(room => (snapshot.facilityLevels[room] ?? 0) > (levels[room] ?? 0))) continue;
    layouts.push({ id, label: BASE_PRESETS[id].label, spots: presetSpots(id), levels });
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

/**
 * The account's best base within `searchSeconds` (default 120; the page offers up to 10 minutes).
 *
 * Seed: today's optimizer (lib/base/baseOptimizer.ts) on each layout, product splits in order of how likely
 * they are to win (about as many gold factories as Trading Posts first), until about a third of the time is
 * spent -- every layout gets at least one. Anneal: the best one or two layouts are improved by simulated
 * annealing over the plan genome (lib/base/annealBase.ts), which also tries other factory products. The
 * annealed plan never scores below its seed. `progress` receives the best result so far whenever it improves,
 * so a stopped search still has one to show.
 */
export function optimizeAccountBase(input: AccountOptimizerInput, progress?: (done: number, total: number, label: string, best?: AccountOptimizerResult) => void): AccountOptimizerResult {
  if (!Object.keys(input.roster).length) throw new Error('No known owned operators were found in this import.');
  if (!Number.isFinite(input.externalGold) || input.externalGold < 0 || input.externalGold > 1000) throw new Error('External gold must be between 0 and 1000 per day.');
  const layouts = optimizerLayouts(input.snapshot, input.compareLayouts);
  if (!layouts.length) throw new Error('The imported layout has an invalid power budget. Compare standard layouts or update your import.');
  const started = Date.now();
  const budget = Math.max(5, Math.min(600, input.searchSeconds ?? 120)) * 1000;
  const elapsed = () => Date.now() - started;
  const tick = (label: string, best?: AccountOptimizerResult) => progress?.(Math.min(100, Math.round(100 * elapsed() / budget)), 100, label, best);
  const recommendations: LayoutRecommendation[] = [];
  let rejected = 0, searched = 0;
  const weights = { lmd: input.objective === 'exp' ? 0 : 1, exp: input.objective === 'lmd' ? 0 : 1, goldMade: 500 };
  const drones = input.drones !== false;
  const baseFor = (layout: LayoutOption) => ({ ...input.base, facilities: getFacilities(layout.spots, layout.levels), dormitoryAmbience: layout.id === 'mine' ? input.snapshot?.dormitoryAmbience : undefined });
  const sorted = () => recommendations.sort((a, b) => b.score - a.score || (a.id === 'mine' ? -1 : b.id === 'mine' ? 1 : a.label.localeCompare(b.label)));
  const snapshotResult = (): AccountOptimizerResult => ({ recommendations: sorted().map(r => ({ ...r })), searched, rejected });
  const offer = (recommendation: LayoutRecommendation) => {
    const previous = recommendations.findIndex(r => r.id === recommendation.id);
    if (previous < 0) recommendations.push(recommendation);
    else if (recommendation.score > recommendations[previous].score) recommendations[previous] = recommendation;
    else return false;
    return true;
  };

  // Seed. Splits close to one gold factory per Trading Post first: gold is what the posts sell.
  const queue = layouts.map(layout => {
    const posts = getFacilities(layout.spots, layout.levels).filter(f => f.kind === 'tradingPost' && f.capacity).length;
    const gold = (p: FactoryProducts) => Object.values(p).filter(v => v === 'Precious Metals').length;
    return { layout, splits: productOptions(layout).sort((x, y) => Math.abs(gold(x) - posts) - Math.abs(gold(y) - posts) || gold(x) - gold(y)) };
  });
  for (let round = 0; queue.some(q => q.splits.length > round); round++) {
    for (const { layout, splits } of queue) {
      if (round >= splits.length || (round > 0 && elapsed() > budget * 0.35)) continue;
      tick(`${layout.label}: first plans`);
      const products = splits[round];
      searched++;
      const plan = optimizeBase({ base: baseFor(layout), roster: input.roster, loginInterval: input.loginInterval, factoryProducts: products, weights, sustainable: true, externalGold: input.externalGold, drones });
      if (!plan.simulation.periodic || plan.simulation.events.some(e => e.kind === 'exhausted')) { rejected++; continue; }
      const output = sustainableOutput(plan.simulation.perDay, input.externalGold);
      if (offer({ ...layout, products, weights, plan, output, score: output.lmd * weights.lmd + output.exp * weights.exp })) tick(`${layout.label}: first plans`, snapshotResult());
    }
    if (elapsed() > budget * 0.35) break;
  }

  // Anneal the best layouts in the time left: most of it to the best, the rest to the runner-up.
  const order = sorted().slice(0, 2);
  order.forEach((seed, i) => {
    const left = budget - elapsed();
    if (left < 2000) return;
    const timeMs = order.length > 1 && i === 0 ? left * 0.7 : left;
    const ctx: GenomeContext = { base: baseFor(seed), roster: input.roster, loginInterval: input.loginInterval, weights, sustainable: true, externalGold: input.externalGold, drones };
    const genome = genomeFromResult(seed.plan, ctx);
    if (!genome) return;
    const improve = (g: Genome, e: Evaluation) => {
      if (!e.sim.periodic || e.sim.events.some(x => x.kind === 'exhausted')) return;
      const plan = toOptimizerResult(g, e, ctx, genomeNotes(g, e, ctx));
      const output = sustainableOutput(e.sim.perDay, input.externalGold);
      if (offer({ ...seed, products: g.products, plan, output, score: output.lmd * weights.lmd + output.exp * weights.exp })) tick(`${seed.label}: improving`, snapshotResult());
    };
    const r = anneal(genome, ctx, {
      timeMs, seed: 1 + i,
      onProgress: ({ genome: g }) => { tick(`${seed.label}: improving`); improve(g, evaluate(g, ctx)); },
    });
    improve(r.genome, r.evaluation);
    searched += r.simulations;
  });
  // The search may stop before its time is up (nothing left to improve); it is still done.
  progress?.(100, 100, 'Done');
  return snapshotResult();
}
