/**
 * How close the search's crews come to the best staffing it could use, per account: each shift of a saved plan
 * (an optimizer-run.ts JSON) scored as funded output at full Morale (staffingMip.ts), against the program's best
 * single staffing started from the plan's best shift and the rest-aware ceiling over every rotation, under the plan's
 * own layout and products.
 *
 *   npx tsx scripts/bench/staffing-gap.ts <run.json> [more runs...] [--iterations 12] [--top 48] [--shortlist 18]
 *
 * Columns: the plan's time-average and best shift; the program's best single staffing (staffing-mip-verify.ts holds
 * it to a brute force); and the best time-share of whole setups (`rotationMix`), first over the plan's own shifts
 * alone, then with setups the column generation adds. The first difference, relaxation, is what the mix's freedoms
 * (fractional shares, no preset limit, Morale never wasted) add by themselves; the second, slack, is what better
 * setups add on top: staffing the search could use. Both are over exact setup values; pricing is heuristic.
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { WORK_KINDS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import type { GenomeContext } from '../../lib/base/planGenome';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import { additiveValue, bestStaffing, fundedValue, rotationMix } from './staffingMip';
import { calculateBase } from '../../lib/base/calculateBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : undefined; };
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const known = new Set(operators.map(o => o.name));

async function main() {
  console.log(['account', 'plan mean', 'plan best', 'best single', 'mix (plan setups)', 'mix (+ generated)', 'relaxation %', 'slack %', 'additive err %', 'columns', 'seconds'].join('\t'));
  const relax: number[] = [], slack: number[] = [];
  for (const file of runs) {
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rec = run.recommendations[0];
    const profile = profileFromData(JSON.parse(fs.readFileSync(run.account, 'utf8')))!;
    const roster: Record<string, OwnedOperator> = ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
    const facilities = getFacilities(presetSpots(rec.id), presetLevels(rec.id));
    const ctx: GenomeContext = { base: { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never, facilities }, roster, loginInterval: run.loginInterval ?? 12 };
    const products = rec.products as FactoryProducts;
    const work = new Set(facilities.filter(f => f.capacity > 0 && WORK_KINDS.includes(f.kind)).map(f => f.id));
    const slotted = (rooms: Record<string, (string | null)[]>, keep: (id: string) => boolean): BaseAssignments => Object.fromEntries(Object.entries(rooms).filter(([id]) => keep(id)).map(([id, names]) => [id, names.map(n => n && roster[n] ? { operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level } : null)]));
    const shifts: BaseAssignments[] = rec.shifts.map((s: { rooms: Record<string, (string | null)[]> }) => slotted(s.rooms, id => work.has(id)));
    const values = shifts.map(a => fundedValue(ctx, a, products));
    const bestShift = values.indexOf(Math.max(...values));
    const t = Date.now();
    const program = await bestStaffing(ctx, products, shifts[bestShift], { top: flag('--top') ?? 48, shortlist: flag('--shortlist') ?? 18 });
    // The best recovery any resting operator gets in the plan, for everyone (optimistic, as a relaxation should be).
    const recovery = Math.max(...rec.shifts.flatMap((s: { rooms: Record<string, (string | null)[]> }) => Object.values(calculateBase({ ...ctx.base, assignments: slotted(s.rooms, () => true), factoryProducts: products, loginInterval: ctx.loginInterval, swapPolicy: 'onLogin' }).dormitoryRecoveryByFacility).flat().map(r => r.base + r.bonus)));
    const beds = facilities.filter(f => f.kind === 'dormitory').reduce((s, f) => s + f.capacity, 0);
    const refilled = new Set<string>(rec.shifts.flatMap((s: { refill?: string[] }) => s.refill ?? []));
    const mixOpts = { recovery, beds, refilled, iterations: flag('--iterations') ?? 12, top: flag('--top') ?? 48, shortlist: flag('--shortlist') ?? 18 };
    const own = await rotationMix(ctx, products, shifts, { ...mixOpts, price: false });
    const grown = await rotationMix(ctx, products, [...shifts, program.assignments], mixOpts);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const error = (additiveValue(ctx, products, program.assignments) - program.value) / program.value;
    relax.push((own.value - mean) / mean); slack.push((grown.value - own.value) / own.value);
    const name = String(run.account).split('/').pop()!.replace(/\.json$/, '');
    console.log([name, mean.toFixed(0), values[bestShift].toFixed(0), program.value.toFixed(0), own.value.toFixed(0), grown.value.toFixed(0), (100 * relax.at(-1)!).toFixed(2), (100 * slack.at(-1)!).toFixed(2), (100 * error).toFixed(2), grown.columns, ((Date.now() - t) / 1000).toFixed(0)].join('\t'));
  }
  const stat = (xs: number[]) => `mean ${(100 * xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)}%, smallest ${(100 * Math.min(...xs)).toFixed(2)}%, largest ${(100 * Math.max(...xs)).toFixed(2)}%`;
  if (runs.length > 1) console.log(`\nrelaxation (the program's mix of the plan's own setups over the plan): ${stat(relax)}\nslack (generated setups over the plan's own): ${stat(slack)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
