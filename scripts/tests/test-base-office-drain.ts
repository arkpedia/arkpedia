import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

// A base-skill tester saw the optimizer report 1.00 Morale/h for every Office candidate, Brigid included, whose
// Restless Rover adds +1: the staffing ranker read the room's headcount rate, not the operator's own.
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
const alone = (name: string, eliteLevel: 'Base' | 'Elite 1' | 'Elite 2', level: number) =>
  calculateBase({ ...base, assignments: { office: [{ operatorName: name, eliteLevel, level }] }, factoryProducts: {}, loginInterval: 8 }).rooms.office;

test("an Office worker's own drain carries their skill's Morale cost", () => {
  const brigid = alone('Brigid', 'Elite 2', 60);
  assert.equal(brigid.combinedMoraleRate, 1);
  assert.equal(brigid.perOperatorMorale?.Brigid, 2);
  assert.ok((brigid.office?.speed ?? 0) > 0.05);
  const penance = alone('Penance', 'Elite 2', 60);
  assert.equal(penance.perOperatorMorale?.Penance, 1.5);
  const mulberry = alone('Mulberry', 'Elite 1', 1);
  assert.equal(mulberry.perOperatorMorale?.Mulberry, 0.75);
});
