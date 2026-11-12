/**
 * A genuine, complete joint plan (not just a score) for a weak account, via the REAL optimizeAccountBase
 * entry point the app itself calls -- phase 3's "finished joint plan for weaker rosters" deliverable.
 * Usage: npx tsx scripts/bench/weak-roster-joint-plan.ts [small|tiny] [loginInterval=12]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase, optimizerLayouts } from '../../lib/base/accountOptimizer';
import type { OwnedOperator } from '../../lib/base/baseOptimizer';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);

const smallNames = [...pick(byRarity(6), 10), ...pick(byRarity(5), 15), ...pick(byRarity(4), 15)];
const small: Record<string, OwnedOperator> = Object.fromEntries(smallNames.map(n => [n, { eliteLevel: 'Elite 1', level: 60 }]));
const tinyNames = [...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)];
const tiny: Record<string, OwnedOperator> = Object.fromEntries(tinyNames.map(n => [n, { eliteLevel: 'Base', level: 30 }]));

const which = process.argv[2] ?? 'small';
const roster = which === 'tiny' ? tiny : small;
const loginInterval = Number(process.argv[3] ?? 12);
const base = { operators, rosters: toBaseRosters(require('../../data/base-group-rosters.json')), skillSlots: require('../../data/base-skill-slots.json'), workshopRecipes: require('../../data/base-workshop-recipes.json') };

console.log(`${which} roster: ${Object.keys(roster).length} operators, ${loginInterval}h logins`);
console.log('layouts the real search will compare:', optimizerLayouts(undefined, true).map(l => l.label).join(', '));

const t0 = Date.now();
const result = optimizeAccountBase({ base, roster, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true });
console.log(`searched ${result.searched} candidates, ${result.rejected} rejected (exhaustion/non-periodic), in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`${result.recommendations.length} layouts survived with a valid (periodic, non-exhausting) plan`);
for (const r of result.recommendations.slice(0, 5)) console.log(`  ${r.label.padEnd(14)} score ${r.score.toFixed(0).padStart(7)}  LMD ${r.output.lmd.toFixed(0).padStart(6)} EXP ${r.output.exp.toFixed(0).padStart(6)}`);

const best = result.recommendations[0];
if (!best) { console.log('NO VALID RECOMMENDATION -- this is the failure mode to check for'); process.exit(1); }
console.log(`\n=== Full joint plan: ${best.label} ===`);
console.log('facility levels:', JSON.stringify(best.levels));
console.log('factory products:', Object.entries(best.products).map(([id, p]) => `${id}=${p}`).join(' '));
console.log('rotation shape:', best.plan.shape, ' step', best.plan.stepHours + 'h', ' cycle', best.plan.simulation.cycleHours + 'h');
console.log(`crews (${best.plan.crews.length}):`);
best.plan.crews.forEach((crew, i) => {
  const rooms = Object.entries(crew).filter(([, v]) => (v ?? []).some(Boolean)).map(([room, v]) => `${room}=[${(v ?? []).flatMap(x => x ? [x.operatorName] : []).join(',')}]`);
  console.log(`  crew ${i}: ${rooms.join('  ')}`);
});
console.log('notes:', best.plan.notes.join(' | ') || '(none)');
console.log('warnings:', best.plan.simulation.warnings.join(' | ') || '(none)');
console.log(`total placed workers: ${new Set(best.plan.crews.flatMap(c => Object.values(c).flatMap(v => (v ?? []).flatMap(x => x ? [x.operatorName] : [])))).size} of ${Object.keys(roster).length} owned`);
