/** The account page's whole search (optimizeAccountBase: 243 and both 252 layouts, every product split) at a
 * given search time. Both sheets use their own operators and exact imported layout (252 max right / 342);
 * maxed compares the standard layouts. The score is funded LMD + EXP. The weighted diagnostic also values
 * unsold gold and must not be used to claim that the funded optimizer matches a sheet.
 * Usage: [FORMATIONS=0|1] npx tsx scripts/bench/account-budget.ts [roster=sheet252|sheet342|maxed] [seconds=60] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import type { AccountRecord } from '../../lib/account/accountStore';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS as SHEET342_FORMATIONS, SHEET_LEVELS, SHEET_SPOTS, everyoneMaxed } from './sheet-342';
import { SHEET252_NAMES } from './sheet-252';
import { presetLevels, presetSpots } from '../../lib/base/baseConfig';

const which = process.argv[2] ?? 'sheet252';
const seconds = Number(process.argv[3] ?? 60);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const maxed = everyoneMaxed(operators);
const names = which === 'sheet342' ? [...new Set([...SHEET342_FORMATIONS.flatMap(f => Object.values(f.teams).flat()), 'Fiammetta'])] : SHEET252_NAMES;
const roster = which === 'maxed' ? maxed : Object.fromEntries(names.filter(n => maxed[n]).map(n => [n, maxed[n]]));
// Both answer-sheet comparisons use their exact layouts. In particular, do not let a
// max-left 252 beat the max-right sheet merely by providing larger factories.
const snapshot = (which === 'sheet342'
  ? { productionSpots: SHEET_SPOTS, facilityLevels: SHEET_LEVELS }
  : which === 'sheet252' ? { productionSpots: presetSpots('2-5-2-right'), facilityLevels: presetLevels('2-5-2-right') }
  : undefined) as AccountRecord['base'];
const t = Date.now();
const r = optimizeAccountBase({ base: { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes }, roster, snapshot, loginInterval: 8, objective: 'balanced', externalGold: 0, compareLayouts: which === 'maxed', searchSeconds: seconds, ...(process.env.FORMATIONS ? { formations: process.env.FORMATIONS === '1' } : {}) });
const best = r.recommendations[0];
console.log(`${which} ${seconds} s${process.env.FORMATIONS ? ` formations=${process.env.FORMATIONS}` : ''}: ${best.label} ${best.score.toFixed(0)} (${best.plan.shape}, ${best.plan.shifts.length} shifts, core [${(best.plan.shifts[0].refill ?? []).join(', ')}]) in ${((Date.now() - t) / 1000).toFixed(0)} s, ${r.searched} plans; products ${Object.values(best.products).map(p => p === "Precious Metals" ? "gold" : "EXP").join("/")}; weighted diagnostic ${(best.plan.simulation.perDay.lmd + best.plan.simulation.perDay.exp + 500 * best.plan.simulation.perDay.goldMade).toFixed(0)}`);
