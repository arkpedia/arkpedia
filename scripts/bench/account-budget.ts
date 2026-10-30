/** The account page's whole search (optimizeAccountBase: 243 and both 252 layouts, every product split) at a
 * given search time, on the 2-5-2 sheet's operators or every operator maxed.
 * Usage: [FORMATIONS=0|1] npx tsx scripts/bench/account-budget.ts [roster=sheet252|maxed] [seconds=60] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { everyoneMaxed } from './sheet-342';
import { SHEET252_NAMES } from './sheet-252';

const which = process.argv[2] ?? 'sheet252';
const seconds = Number(process.argv[3] ?? 60);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const maxed = everyoneMaxed(operators);
const roster = which === 'maxed' ? maxed : Object.fromEntries(SHEET252_NAMES.filter(n => maxed[n]).map(n => [n, maxed[n]]));
const t = Date.now();
const r = optimizeAccountBase({ base: { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes }, roster, loginInterval: 8, objective: 'balanced', externalGold: 0, compareLayouts: true, searchSeconds: seconds, ...(process.env.FORMATIONS ? { formations: process.env.FORMATIONS === '1' } : {}) });
const best = r.recommendations[0];
console.log(`${which} ${seconds} s${process.env.FORMATIONS ? ` formations=${process.env.FORMATIONS}` : ''}: ${best.label} ${best.score.toFixed(0)} (${best.plan.shape}, core [${(best.plan.shifts[0].refill ?? []).join(', ')}]) in ${((Date.now() - t) / 1000).toFixed(0)} s, ${r.searched} plans`);
