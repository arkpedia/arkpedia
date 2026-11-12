/**
 * Holds the staffing program (staffingMip.ts) to a brute force: a small base, every way to place a handful of
 * operators (each in one room or none), each scored by the same funded snapshot. Rooms without cross-room effects must come
 * out exactly; with a Control Center the program's re-solving in the new context is a heuristic, and this says how
 * close it lands.
 *
 *   npx tsx scripts/bench/staffing-mip-verify.ts
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { OwnedOperator } from '../../lib/base/baseOptimizer';
import type { GenomeContext } from '../../lib/base/planGenome';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import { bestStaffing, fundedValue, type Team } from './staffingMip';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const all = getFacilities(presetSpots('2-5-2-left'), presetLevels('2-5-2-left'));
const first = (kind: string, nth = 0) => all.filter(f => f.kind === kind)[nth];

function subsets<T>(xs: T[], max: number): T[][] {
  const out: T[][] = [[]];
  for (const x of xs) for (const s of [...out]) if (s.length < max) out.push([...s, x]);
  return out.filter(s => s.length);
}

async function check(label: string, kinds: string[], names: string[], products: (f: typeof all) => FactoryProducts) {
  const facilities = kinds.map((k, i) => first(k, kinds.slice(0, i).filter(x => x === k).length));
  const roster: Record<string, OwnedOperator> = Object.fromEntries(names.map(n => [n, { eliteLevel: 'Elite 2', level: 90 }]));
  const ctx: GenomeContext = { base: { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities }, roster, loginInterval: 12 };
  const prod = products(facilities);
  // Brute force: each operator in one of the rooms or none.
  let best = -Infinity, bestA: BaseAssignments = {}, count = 0;
  const choice = Array(names.length).fill(0);
  for (;;) {
    const a: BaseAssignments = Object.fromEntries(facilities.map(f => [f.id, [] as BaseAssignments[string]]));
    let ok = true;
    names.forEach((n, i) => { if (choice[i]) { const f = facilities[choice[i] - 1]; if (a[f.id].length >= f.capacity) ok = false; else a[f.id].push({ operatorName: n, ...roster[n] }); } });
    if (ok) {
      for (const f of facilities) while (a[f.id].length < f.capacity) a[f.id].push(null);
      count++;
      const v = fundedValue(ctx, a, prod);
      if (v > best + 1e-9) { best = v; bestA = a; }
    }
    let i = 0;
    while (i < names.length && ++choice[i] > facilities.length) choice[i++] = 0;
    if (i === names.length) break;
  }
  // The program over every team (all subsets up to each room's capacity), from an empty base.
  const every = (_: BaseAssignments) => Object.fromEntries(facilities.map(f => [f.id, subsets(names, f.capacity).map(t => ({ room: f.id, names: t } as Team))]));
  const exact = await bestStaffing(ctx, prod, {}, { candidates: every });
  // And over teamBlocks' candidates, as the bench over the Krooster fixtures runs it.
  const blocks = await bestStaffing(ctx, prod, {});
  const show = (a: BaseAssignments) => facilities.map(f => `${f.kind}: ${(a[f.id] ?? []).flatMap(s => s ? [s.operatorName] : []).join(', ') || '-'}`).join(' | ');
  console.log(`\n${label}: ${count} staffings`);
  console.log(`  brute force  ${best.toFixed(2)}  ${show(bestA)}`);
  console.log(`  every team   ${exact.value.toFixed(2)}  ${show(exact.assignments)}  (${exact.rounds.length} rounds)`);
  console.log(`  teamBlocks   ${blocks.value.toFixed(2)}  ${show(blocks.assignments)}  (${blocks.rounds.length} rounds)`);
  const ok = Math.abs(exact.value - best) < 1e-6;
  console.log(`  ${ok ? 'match' : `MISS by ${(best - exact.value).toFixed(2)} (${(100 * (best - exact.value) / best).toFixed(3)}%)`}`);
  return ok;
}

const exp = (fs: typeof all): FactoryProducts => Object.fromEntries(fs.filter(f => f.kind === 'factory').map(f => [f.id, 'Battle Records']));
const gold = (fs: typeof all): FactoryProducts => Object.fromEntries(fs.filter(f => f.kind === 'factory').map(f => [f.id, 'Precious Metals']));
async function main() {
  const results = [
  // Independent rooms: the program must equal the brute force.
  await check('Factory + Trading Post + Power Plant', ['factory', 'tradingPost', 'powerPlant'], ['Gravel', 'Spot', 'Vigna', 'Proviso', 'Shamare', 'Tequila', 'Bibeak', 'Lancet-2'], gold),
  // A Control Center whose skills lift the other rooms: interactions the sum cannot see in one pass.
  await check('Control Center + Factory + Trading Post', ['controlCenter', 'factory', 'tradingPost'], ['Amiya', 'Swire', 'Gravel', 'Spot', 'Proviso', 'Shamare', 'Tequila', 'Bibeak'], gold),
    // Control Center skills that lift Factory workers by faction (Flametail for Pinus Sylvestris, Viviana for Knights):
    // a room's worth depends on who sits in another.
    await check('Control Center + two Factories, faction bonuses', ['controlCenter', 'factory', 'factory'], ['Flametail', 'Viviana', "Kal'tsit", 'Fartooth', 'Ashlock', 'Wild Mane', 'Vigna', 'Gravel'], exp),
  ];
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
main().catch(e => { console.error(e); process.exit(1); });
