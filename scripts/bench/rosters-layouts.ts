/**
 * Which layout wins for a weaker account? Runs the optimizer on a mid-game and a small roster across 243, 252 (both)
 * and the two layouts left out of the default search, 153 and 342, with funded scoring and no outside gold.
 * Usage: npx tsx scripts/bench/rosters-layouts.ts [loginInterval=12] [mid|small|both]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { optimizeBase, sustainableOutput, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { productOptions } from '../../lib/base/accountOptimizer';
import type { SimulationBase } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

const loginInterval = Number(process.argv[2] ?? 12);
const which = process.argv[3] ?? 'both';
// Feature flags from the environment: DRONES=1 FORMATIONS=1 REFILL=1 DEEP=1; LAYOUT=243 limits the layouts; SPLITS=all tries every product split.
const flags = { drones: !!process.env.DRONES, formations: process.env.FORMATIONS === '0' ? false : !!process.env.FORMATIONS, refill: !!process.env.REFILL, deep: !!process.env.DEEP };
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();

// A mid-game account: every 6* at Elite 2, 5* at Elite 1, 4* at Elite 1, the rest as recruited.
const max: Record<string, OwnedOperator> = Object.fromEntries(operators.map(o => [o.name, (o.rarity ?? 0) >= 3 ? { eliteLevel: 'Elite 2', level: 90 } : { eliteLevel: 'Base', level: 30 }])) as Record<string, OwnedOperator>;
const mid: Record<string, OwnedOperator> = Object.fromEntries(operators.map(o => [o.name,
  (o.rarity ?? 0) >= 6 ? { eliteLevel: 'Elite 2', level: 80 } : (o.rarity ?? 0) === 5 ? { eliteLevel: 'Elite 1', level: 70 } : (o.rarity ?? 0) === 4 ? { eliteLevel: 'Elite 1', level: 50 } : { eliteLevel: 'Base', level: 30 }]));
// A small account: 40 operators (the first 10 6*, 15 5*, 15 4* by name), Elite 1.
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);
const smallNames = [...pick(byRarity(6), 10), ...pick(byRarity(5), 15), ...pick(byRarity(4), 15)];
const small: Record<string, OwnedOperator> = Object.fromEntries(smallNames.map(n => [n, { eliteLevel: 'Elite 1', level: 60 } as OwnedOperator]));
// A brand-new account: 15 operators (first 3 6*, 6 5*, 6 4* by name), Base/low level -- plausibly no base skills unlocked at all.
const tinyNames = [...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)];
const tiny: Record<string, OwnedOperator> = Object.fromEntries(tinyNames.map(n => [n, { eliteLevel: 'Base', level: 30 } as OwnedOperator]));

const layouts = {
  '243 layout': { spots: presetSpots('2-4-3'), levels: presetLevels('2-4-3') },
  '252 left': { spots: presetSpots('2-5-2-left'), levels: presetLevels('2-5-2-left') },
  '252 right': { spots: presetSpots('2-5-2-right'), levels: presetLevels('2-5-2-right') },
  '153 layout': { spots: { ...presetSpots('2-4-3'), prod4: 'factory' as const }, levels: presetLevels('2-4-3') },
  '342 layout': { spots: { ...presetSpots('2-5-2-right'), prod8: 'tradingPost' as const }, levels: presetLevels('2-5-2-right') },
};

for (const [label, roster] of Object.entries({ max, mid, small, tiny })) {
  if (which === 'both' ? label === 'max' : which !== label) continue;
  console.log(`\n== ${label} roster: ${Object.keys(roster).length} operators, ${loginInterval}h logins`);
  for (const [name, layout] of Object.entries(layouts)) {
    if (process.env.LAYOUT && !name.startsWith(process.env.LAYOUT)) continue;
    try {
    const facilities = getFacilities(layout.spots, layout.levels);
    const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
    const splits = productOptions({ id: name, label: name, spots: layout.spots, levels: layout.levels });
    const chosen = process.env.SPLITS === 'all' ? splits : [splits[0], splits[Math.floor(splits.length / 2)], splits[splits.length - 1]].filter((s, i, a) => a.indexOf(s) === i);
    let best: { score: number; lmd: number; exp: number; gold: number } | null = null;
    const t0 = Date.now();
    for (const products of chosen) {
      const plan = optimizeBase({ base, roster, loginInterval, factoryProducts: products, sustainable: true, externalGold: 0, ...flags });
      if (!plan.simulation.periodic || plan.simulation.events.some(e => e.kind === 'exhausted')) continue;
      const out = sustainableOutput(plan.simulation.perDay, 0);
      const score = out.lmd + out.exp;
      if (process.env.VERBOSE) console.log(`   split ${Object.values(products).filter(v => v === 'Precious Metals').length} gold: ${plan.shape} score ${score.toFixed(0)}`);
      if (!best || score > best.score) best = { score, lmd: out.lmd, exp: out.exp, gold: plan.simulation.perDay.goldMade };
    }
    console.log(`${name.padEnd(12)} ${best ? `score ${best.score.toFixed(0).padStart(7)}  LMD ${best.lmd.toFixed(0).padStart(6)} EXP ${best.exp.toFixed(0).padStart(6)}  gold made ${best.gold.toFixed(1)}` : 'no valid plan'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (err) {
      console.log(`${name.padEnd(12)} ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
  }
}
