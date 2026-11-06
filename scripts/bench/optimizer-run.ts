/**
 * One deterministic optimizer run, written as JSON for scripts/bench/compare-optimizer.ts to diff against the same
 * run in another checkout. Run from the checkout's root (the imports resolve against it): a copy of this file is
 * placed in the pre-table checkout by the comparison.
 *
 *   npx tsx scripts/bench/optimizer-run.ts <account> <rounds> <out.json> [--without Name,Name] [--interval 12] [--seeds yes|no|only] [--lns off|move] [--start 0] [--seconds 300] [--walks seats,noseats,seats:move:0.5]
 *
 * `--lns` sets the re-solve in both default walks; `--walks` sets it per walk and wins when both are given.
 *
 * `account` is `fixture` (tests/fixtures/base-account.json), `sheet252` or `sheet342` (the maxed catalogue roster the
 * reference sheets staff), or a saved Krooster profile (tests/fixtures/krooster/<user>.json, or a lookup page).
 * `rounds` is the anneal's round budget per layout (`annealRounds`): the cooling runs over rounds, so the walk is a
 * function of the seed alone. With `--seeds yes` or `only` the seed plans (every layout and product split, as the
 * search's first phase builds them) are recorded too, so a difference can be placed before or inside the anneal;
 * the comparison asks for them only once a run differs, since they cost about as much as the search.
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase, optimizerLayouts, productOptions } from '../../lib/base/accountOptimizer';
import { optimizeBase, sustainableOutput, type OptimizerResult, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { getFacilities } from '../../lib/base/baseConfig';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { parseKroosterPage, profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import { everyoneMaxed } from './sheet-342';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import type { AccountRecord } from '../../lib/account/accountStore';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';
import fixture from '../../tests/fixtures/base-account.json';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [account, roundsArg, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!account || !roundsArg || !out) throw new Error('usage: optimizer-run.ts <account> <rounds> <out.json> [--without a,b] [--interval 12]');
const rounds = Number(roundsArg), loginInterval = Number(flag('--interval') ?? 12), seedsMode = flag('--seeds') ?? 'yes';
const without = new Set((flag('--without') ?? '').split(',').filter(Boolean));
const lns = flag('--lns') as 'off' | 'move' | undefined;
// The walks' random seeds are 1 + i + 97 * start: another start is the same search from other seeds, which is the
// control any added walk has to beat (two more walks of the same kind find some of what a new move would).
const startArg = flag('--start');
// A run on the clock instead of a round budget, as the page runs it (base-optimizer-speed-target).
const secondsArg = flag('--seconds');
// Walks as `seats|noseats[:lns][:share]`, comma separated, in order; default is the search's own pair.
const walksArg = flag('--walks');
const walks = walksArg?.split(',').map(w => { const [seats, lns, share] = w.split(':'); return { countSeats: seats === 'seats', ...(lns ? { lns: lns as 'off' | 'move' } : {}), ...(share ? { share: Number(share) } : {}) }; })
  // `--lns` is the shorthand for the default pair with the re-solve on or off in both walks, the form the
  // 2026-11-05 baselines were run with. `--walks` sets it per walk instead.
  ?? (lns ? [{ countSeats: true, lns }, { countSeats: false, lns }] : undefined);

const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const known = new Set(operators.map(o => o.name));
function rosterOf(): Record<string, OwnedOperator> {
  if (account === 'fixture') return ownedBaseRoster(fixture as unknown as AccountRecord, known).roster;
  if (account === 'sheet252' || account === 'sheet342') return everyoneMaxed(operators);
  const text = fs.readFileSync(account, 'utf8');
  const profile = account.endsWith('.json') ? profileFromData(JSON.parse(text)) : parseKroosterPage(text);
  if (!profile) throw new Error(`${account}: not a public profile`);
  return ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
}
const roster = Object.fromEntries(Object.entries(rosterOf()).filter(([name]) => !without.has(name)));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never };

const staffing = (plan: OptimizerResult) => plan.shifts.map(s => ({
  refill: s.refill ?? [],
  rooms: Object.fromEntries(Object.entries(s.assignments).map(([id, slotsOf]) => [id, slotsOf.map(x => x?.operatorName ?? null)])),
}));
const started = Date.now();
// The seed phase, split by split, as the search's first phase builds them (every split, no time cut).
const seeds = seedsMode === 'no' ? [] : optimizerLayouts(undefined, true).flatMap(layout => productOptions(layout).map(products => {
  const t = Date.now();
  const plan = optimizeBase({ base: { ...base, facilities: getFacilities(layout.spots, layout.levels) }, roster, loginInterval, factoryProducts: products, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true });
  const output = sustainableOutput(plan.simulation.perDay, 0);
  return { layout: layout.id, products, score: output.lmd + output.exp, lmd: output.lmd, exp: output.exp, goldMade: output.goldMade, periodic: plan.simulation.periodic, exhausted: plan.simulation.events.some(e => e.kind === 'exhausted'), shifts: staffing(plan), seconds: (Date.now() - t) / 1000 };
}));
const seedSeconds = (Date.now() - started) / 1000;
const t = Date.now();
const r = seedsMode === 'only' ? { recommendations: [], searched: 0, rejected: 0 } : optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, searchSeconds: secondsArg ? Number(secondsArg) : 600, ...(secondsArg ? {} : { annealRounds: rounds }), ...(startArg ? { start: Number(startArg) } : {}), ...(walks ? { walks } : {}) });
const result = {
  account, rounds, loginInterval, without: [...without].sort(), ...(startArg ? { start: Number(startArg) } : {}), ...(walks ? { walks } : {}), rosterSize: Object.keys(roster).length,
  seeds, seedSeconds,
  recommendations: r.recommendations.map(x => ({ id: x.id, label: x.label, score: x.score, lmd: x.output.lmd, exp: x.output.exp, goldMade: x.output.goldMade, products: x.products, shifts: staffing(x.plan), notes: x.plan.notes })),
  searched: r.searched, rejected: r.rejected, searchSeconds: (Date.now() - t) / 1000,
};
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(`${account}: ${Object.keys(roster).length} operators, ${seeds.length} seeds in ${seedSeconds.toFixed(0)} s, search ${result.searchSeconds.toFixed(0)} s, best ${result.recommendations[0]?.label} ${result.recommendations[0]?.score.toFixed(0)}`);
