/** Does an unskilled operator in Office or Reception Room add ANY value over an empty room?
 * Phase 3 check: "declined on merit" is only a real judgment if the answer is no.
 * Usage: npx tsx scripts/bench/unskilled-office-reception.ts */
import { calculateBase } from '../../lib/base/calculateBase';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const base = { operators, rosters: toBaseRosters(require('../../data/base-group-rosters.json')), skillSlots: slots, workshopRecipes: recipes, facilities };

// A generic, no-base-skill 3-star: nothing to contribute beyond a body in the slot.
const unskilled = operators.find(o => (o.rarity ?? 0) === 2)?.name ?? operators[0].name;
console.log('using unskilled test operator:', unskilled);

const run = (room: 'office' | 'receptionRoom', names: string[]) => calculateBase({
  ...base, factoryProducts: {}, assignments: { [room]: names.map(n => ({ operatorName: n, eliteLevel: 'Elite 2' as const, level: 90 })) },
});

const officeEmpty = run('office', []).rooms['office'] as { office?: { speed: number } };
const officeWithUnskilled = run('office', [unskilled]).rooms['office'] as { office?: { speed: number } };
console.log('Office HR speed, empty:         ', officeEmpty.office?.speed);
console.log('Office HR speed, + unskilled op:', officeWithUnskilled.office?.speed);

const receptionEmpty = run('receptionRoom', []).rooms['receptionRoom'] as { clueSpeed?: number; clueSpeedBase?: number };
const receptionWithUnskilled = run('receptionRoom', [unskilled]).rooms['receptionRoom'] as { clueSpeed?: number; clueSpeedBase?: number };
console.log('Reception clue speed, empty:         ', receptionEmpty.clueSpeed, 'base', receptionEmpty.clueSpeedBase);
console.log('Reception clue speed, + unskilled op:', receptionWithUnskilled.clueSpeed, 'base', receptionWithUnskilled.clueSpeedBase);
