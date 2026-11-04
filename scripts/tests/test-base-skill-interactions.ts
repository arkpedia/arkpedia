import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

/*
 * Marcille's and Closure's interactions, each to the number the game text gives (a tester reported both as "not
 * working" in the optimizer; the calculator reads them as below, and the Krooster harness shows where the
 * optimizer places them).
 */
const near = (actual: number | null | undefined, expected: number, what: string) => assert.ok(Math.abs((actual ?? NaN) - expected) < 1e-9, `${what}: ${actual} != ${expected}`);
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
const maxed = (name: string) => ({ operatorName: name, eliteLevel: 'Elite 2' as const, level: 90 });
const calc = (assignments: BaseAssignments, factoryProducts: FactoryProducts = {}) => calculateBase({ ...base, assignments, factoryProducts, loginInterval: 12, explain: true });
const dormLevel = facilities.find(f => f.id === 'dormitory1')!.level;
const line = (r: ReturnType<typeof calc>, room: string, skill: string) => r.rooms[room].facilityBreakdown!.lines.find(l => l.skillName === skill)!;

test("Marcille's Unexpectedly Delicious counts Senshi's Monster Meal, one per Dormitory level, beside Familiar Dispatch β", () => {
  const r = calc({ dormitory1: [maxed('Senshi')], prod2: [maxed('Marcille')], prod1: [maxed('Chilchuck')], receptionRoom: [maxed('Laios')] }, { prod2: 'Battle Records' });
  near(r.totalMonsterMeal, dormLevel, 'Monster Meal from Senshi');
  near(line(r, 'prod2', 'Familiar Dispatch β').rawValue, 0.3, 'Familiar Dispatch β');
  near(line(r, 'prod2', 'Unexpectedly Delicious').rawValue, 0.01 * dormLevel, 'Unexpectedly Delicious, +1% per Monster Meal');
  near(r.rooms.prod2.productivity.yellow, 0.3 + 0.01 * dormLevel, 'Marcille in a Factory');
  // The same meal feeds Chilchuck's Familiar Flavors (+1% order efficiency each) and Laios's Gourmand (+2% clue speed each).
  near(line(r, 'prod1', 'Familiar Flavors').rawValue, 0.01 * dormLevel, 'Familiar Flavors');
  near(r.rooms.receptionRoom.clueSpeed!, 0.1 + 0.02 * dormLevel + 0.1, "Laios's Curiosity (+10%) and Gourmand (+2% per meal) over the room's 10% base");
  const without = calc({ prod2: [maxed('Marcille')] }, { prod2: 'Battle Records' });
  near(without.rooms.prod2.productivity.yellow, 0.3, 'nothing from the meal without Senshi in a Dormitory');
});

test("Closure's Special Order: +10% order acquisition, fixed 2-gold 1200-LMD orders every 144 minutes, never Defaulted", () => {
  const r = calc({ prod1: [maxed('Closure'), maxed('Proviso')] });
  near(line(r, 'prod1', 'Special Order').rawValue, 0.1, 'Special Order efficiency');
  // Proviso's Damages for Breach pays per Defaulted trade; Closure's orders are not Defaulted, so it gives nothing here.
  assert.equal(line(r, 'prod1', 'Damages for Breach β').included, false, 'Damages for Breach excluded beside Special Order');
  // Two operators at +10% on a level 3 post: 1.01 + 0.01 + 0.10 = 1.12 effective, 144 min a fixed order: 1.12 / 2.4 orders per hour.
  const ordersPerDay = (1.01 + 0.01 + 0.1) / 2.4 * 24;
  near(r.roomDailyOutput.prod1.goldSold, 2 * ordersPerDay, 'gold sold per day');
  near(r.roomDailyOutput.prod1.extraLmd, 200 * ordersPerDay, 'LMD beyond 500 per gold (1200 for 2 gold)');
  const alone = calc({ prod1: [maxed('Proviso')] });
  assert.ok(alone.roomDailyOutput.prod1.goldSold > r.roomDailyOutput.prod1.goldSold, "Proviso's Defaulted-trade gold is worth more than Closure's fixed orders on his own");
});

test("Closure's Chief Engineer adds +0.05 Morale per hour to everyone in the Control Center, stacking with others", () => {
  const r = calc({ controlCenter: [maxed('Closure'), maxed('Amiya')] });
  near(r.ccEffects.ccMoraleBonus, 0.05, 'Chief Engineer');
  const both = calc({ controlCenter: [maxed('Closure'), maxed('Dobermann')] });
  near(both.ccEffects.ccMoraleBonus, 0.05 + 0.05, "with Dobermann's Capable Assistance");
  near(r.rooms.controlCenter.perOperatorMorale!.Amiya, 1 - 0.05 * 2 - 0.05 * 2, 'Amiya: 1 base, 0.05 per Control Center operator for everyone, 0.05 per Chief Engineer');
});
