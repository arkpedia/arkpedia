import { completeStaffing } from './completeStaffing';
import { byScore } from './accountResults';
import type { AccountRecord } from '../account/accountStore';
import { BASE_PRESET_IDS, BASE_PRESETS, PRODUCTION_SPOT_IDS, getFacilities, layoutProblems, presetLevels, presetSpots } from './baseConfig';
import { optimizeBase, sustainableOutput, type OptimizerResult, type OwnedOperator } from './baseOptimizer';
import { evaluate, genomeFromResult, genomeNotes, toOptimizerResult, type Evaluation, type Genome, type GenomeContext } from './planGenome';
import { anneal } from './annealBase';
import { calcDormitoryRecovery, defaultDormitoryAmbience } from './baseProductivity';
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
  /** Reserve these owned operators in dorms throughout the search. */
  lockedDorm?: string[];
  /** Search time in seconds, 5 to 600. Default 60. */
  searchSeconds?: number;
  /** The formations search, run beside the main one (the page starts it in a second worker): one first plan per
   * layout, then the leading layout's plan built with formations, then all the time left annealing that. */
  formations?: boolean;
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

/** Automatic recommendations focus on 252: two Trading Posts, five Factories and two Power Plants.
 * Any valid imported layout can still be optimized on its own. */
const productionCounts = (spots: ProductionSpots) => {
  const count = (kind: string) => Object.values(spots).filter(k => k === kind).length;
  return `${count('tradingPost')}${count('factory')}${count('powerPlant')}`;
};
export const SEARCHED_LAYOUT_SHAPES = ['252'];

/** Respect already-upgraded right-side rooms, which cannot be downgraded in game. */
export function optimizerLayouts(snapshot?: AccountRecord['base'], compare = true): LayoutOption[] {
  const layouts: LayoutOption[] = [];
  // The imported layout is searched when the reader asks for it alone, or when it is itself a 252.
  if (snapshot && (!compare || SEARCHED_LAYOUT_SHAPES.includes(productionCounts(snapshot.productionSpots)))) layouts.push({ id: 'mine', label: 'Your layout', spots: snapshot.productionSpots, levels: snapshot.facilityLevels });
  if (compare || !snapshot) for (const id of BASE_PRESET_IDS) {
    if (!SEARCHED_LAYOUT_SHAPES.includes(productionCounts(presetSpots(id)))) continue;
    const levels = presetLevels(id);
    if (snapshot && ['office', 'receptionRoom', 'trainingRoom'].some(room => (snapshot.facilityLevels[room] ?? 0) > (levels[room] ?? 0))) continue;
    layouts.push({ id, label: BASE_PRESETS[id].label, spots: presetSpots(id), levels });
  }
  const seen = new Set<string>();
  return layouts.filter(l => {
    if (layoutProblems(l.spots, l.levels).length) return false;
    const facilities = getFacilities(l.spots, l.levels);
    // Production positions are presentation, not different buildings. Keep the
    // imported layout (added first), so teams and saved rotations use its room IDs.
    const production = facilities.filter(f => PRODUCTION_SPOT_IDS.includes(f.id))
      .map(f => `${f.kind}:${f.level}`).sort();
    const support = facilities.filter(f => !PRODUCTION_SPOT_IDS.includes(f.id)).map(f => [
      f.id, f.kind, f.level,
      f.kind === 'dormitory' ? calcDormitoryRecovery(f.level,
        (l.id === 'mine' ? snapshot?.dormitoryAmbience?.[f.id] : undefined) ?? defaultDormitoryAmbience(f.level)) : null,
    ]);
    const key = JSON.stringify([production, support]);
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
 * The account's best base within `searchSeconds` (default 60; the page offers up to 10 minutes).
 *
 * Seed: today's optimizer (lib/base/baseOptimizer.ts) on each layout, product splits in order of how likely
 * they are to win (about as many gold factories as Trading Posts first), until about a third of the time is
 * spent -- every layout gets at least one. With `formations` (a second search the page runs beside this one),
 * only the first split per layout, then the leader is built again with formations. Anneal: the best one or two layouts
 * are improved by simulated annealing over the plan genome (lib/base/annealBase.ts), which also tries other
 * factory products. The
 * annealed plan never scores below its seed. `progress` receives the best result so far whenever it improves,
 * so a stopped search still has one to show.
 */
export function optimizeAccountBase(input: AccountOptimizerInput, progress?: (done: number, total: number, label: string, best?: AccountOptimizerResult) => void): AccountOptimizerResult {
  const roster = Object.fromEntries(Object.entries(input.roster).filter(([name]) => name !== input.base.trainingTarget?.operatorName));
  if (!Object.keys(roster).length) throw new Error('No known owned operators were found in this import.');
  if (!Number.isFinite(input.externalGold) || input.externalGold < 0 || input.externalGold > 1000) throw new Error('External gold must be between 0 and 1000 per day.');
  const layouts = optimizerLayouts(input.snapshot, input.compareLayouts);
  if (!layouts.length) throw new Error('The imported layout has an invalid power budget. Turn on Recommend 2-5-2 or update your import.');
  const started = Date.now();
  const budget = Math.max(5, Math.min(600, input.searchSeconds ?? 60)) * 1000;
  const elapsed = () => Date.now() - started;
  const tick = (label: string, best?: AccountOptimizerResult) => progress?.(Math.min(100, Math.round(100 * elapsed() / budget)), 100, label, best);
  const recommendations: LayoutRecommendation[] = [];
  let rejected = 0, searched = 0;
  const weights = { lmd: input.objective === 'exp' ? 0 : 1, exp: input.objective === 'lmd' ? 0 : 1, goldMade: 500 };
  const drones = input.drones !== false;
  const baseFor = (layout: LayoutOption) => ({ ...input.base, facilities: getFacilities(layout.spots, layout.levels), dormitoryAmbience: layout.id === 'mine' ? input.snapshot?.dormitoryAmbience : undefined });
  const sorted = () => recommendations.sort(byScore);
  const completed = new WeakMap<OptimizerResult, LayoutRecommendation>();
  const completedBest = new Map<string, LayoutRecommendation>();
  const snapshotResult = (): AccountOptimizerResult => ({ recommendations: sorted().map(r => {
    let result = completed.get(r.plan);
    if (!result) {
      const ctx: GenomeContext = { base: baseFor(r), roster, loginInterval: input.loginInterval, weights, sustainable: true, externalGold: input.externalGold, drones, lockedDorm: input.lockedDorm };
      const plan = completeStaffing(r.plan, ctx);
      const output = sustainableOutput(plan.simulation.perDay, input.externalGold);
      result = { ...r, plan, output, score: output.lmd * weights.lmd + output.exp * weights.exp };
      completed.set(r.plan, result);
    }
    const previous = completedBest.get(r.id);
    if (!previous || result.score > previous.score) completedBest.set(r.id, result);
    return completedBest.get(r.id)!;
  }).sort(byScore), searched, rejected });
  const offer = (recommendation: LayoutRecommendation) => {
    const previous = recommendations.findIndex(r => r.id === recommendation.id);
    if (previous < 0) recommendations.push(recommendation);
    else if (recommendation.score > recommendations[previous].score) recommendations[previous] = recommendation;
    else return false;
    return true;
  };

  // Formations (Fiammetta's refill core with crews taking turns, as hand-made sheets run) take 20-40 s on a large
  // roster and help some rosters, not others, so they run as a second search beside the main one rather than
  // inside it. The main worker keeps its own full search budget.
  const withFormations = !!input.formations && 'Fiammetta' in roster;
  const seedShare = withFormations ? 0 : 0.35;

  // Seed. Splits close to one gold factory per Trading Post first: gold is what the posts sell.
  const queue = layouts.map(layout => {
    const facilities = getFacilities(layout.spots, layout.levels);
    const posts = facilities.filter(f => f.kind === 'tradingPost' && f.capacity).length;
    const gold = (p: FactoryProducts) => Object.values(p).filter(v => v === 'Precious Metals').length;
    // Strong gold pairs can use a smaller room; an EXP trio needs the larger
    // capacity. The main search tries several seeds; the formations worker keeps
    // the original single-seed order because its construction already dominates
    // the budget. Every split remains available to annealing in either worker.
    const goldCapacity = (p: FactoryProducts) => facilities.filter(f => f.kind === 'factory' && p[f.id] === 'Precious Metals').reduce((sum, f) => sum + f.capacity, 0);
    return { layout, splits: productOptions(layout).sort((x, y) => Math.abs(gold(x) - posts) - Math.abs(gold(y) - posts) || gold(x) - gold(y) || (withFormations ? 0 : goldCapacity(x) - goldCapacity(y))) };
  });
  for (let round = 0; queue.some(q => q.splits.length > round); round++) {
    for (const { layout, splits } of queue) {
      if (round >= splits.length || (round > 0 && elapsed() > budget * seedShare)) continue;
      tick(`${layout.label}: first plans`);
      const products = splits[round];
      searched++;
      const plan = optimizeBase({ base: baseFor(layout), roster, loginInterval: input.loginInterval, factoryProducts: products, weights, sustainable: true, externalGold: input.externalGold, drones, lockedDorm: input.lockedDorm });
      if (!plan.simulation.periodic || plan.simulation.events.some(e => e.kind === 'exhausted')) { rejected++; continue; }
      const output = sustainableOutput(plan.simulation.perDay, input.externalGold);
      if (offer({ ...layout, products, weights, plan, output, score: output.lmd * weights.lmd + output.exp * weights.exp })) tick(`${layout.label}: first plans`, snapshotResult());
    }
    if (elapsed() > budget * seedShare) break;
  }
  const leader = sorted()[0];
  if (withFormations && leader) {
    tick(`${leader.label}: formations`);
    searched++;
    const layout = layouts.find(l => l.id === leader.id)!;
    const plan = optimizeBase({ base: baseFor(layout), roster, loginInterval: input.loginInterval, factoryProducts: leader.products, weights, sustainable: true, externalGold: input.externalGold, drones, lockedDorm: input.lockedDorm, formations: true });
    if (plan.simulation.periodic && !plan.simulation.events.some(e => e.kind === 'exhausted')) {
      const output = sustainableOutput(plan.simulation.perDay, input.externalGold);
      if (offer({ ...layout, products: leader.products, weights, plan, output, score: output.lmd * weights.lmd + output.exp * weights.exp })) tick(`${layout.label}: formations`, snapshotResult());
    } else rejected++;
  }

  // Anneal the best layouts in the time left: most of it to the best, the rest to the runner-up (all of it to the
  // leader in the formations search, whose runner-up the main search covers).
  const order = sorted().slice(0, withFormations ? 1 : 2);
  order.forEach((seed, i) => {
    const left = budget - elapsed();
    if (left < 2000) return;
    const timeMs = order.length > 1 && i === 0 ? left * 0.7 : left;
    const ctx: GenomeContext = { base: baseFor(seed), roster, loginInterval: input.loginInterval, weights, sustainable: true, externalGold: input.externalGold, drones, lockedDorm: input.lockedDorm };
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
