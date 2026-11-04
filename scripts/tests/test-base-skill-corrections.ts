import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { BaseAssignments, FactoryProducts } from '../../lib/base/baseTypes';
import { KNOWN_DEVIATIONS } from './base-skill-deviations';
import { evalSkill } from './skill-eval-helper';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

/*
 * The skills the table reads differently from the handlers it replaced (test-base-skill-parity.ts, KNOWN_DEVIATIONS):
 * each held here to the number the game text gives.
 */
const near = (actual: number | null | undefined, expected: number, what: string) => assert.ok(Math.abs((actual ?? NaN) - expected) < 1e-9, `${what}: ${actual} != ${expected}`);
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
const maxed = (name: string) => ({ operatorName: name, eliteLevel: 'Elite 2' as const, level: 90 });
const calc = (assignments: BaseAssignments, factoryProducts: FactoryProducts = {}) => calculateBase({ ...base, assignments, factoryProducts, loginInterval: 8 });

test('every deviating operator is a released one with a record', () => {
  for (const name of Object.keys(KNOWN_DEVIATIONS)) assert.ok(operators.some(o => o.name === name), name);
});

test("Raidian's Drip-Fed Care recovers +0.05 for the Control Center", () => {
  near(evalSkill('Raidian', 'Drip-Fed Care').cc.morale, 0.05, 'Drip-Fed Care');
  const r = calc({ controlCenter: [maxed('Raidian')] });
  near(r.ccEffects.ccMoraleBonus, 0.05, 'Control Center Morale');
});

test("Firewhistle's Warm-Up and Wind Chimes' letters lower the whole Trading Post's rate", () => {
  near(evalSkill('Firewhistle', 'Warm-Up').roomMorale, -0.1, 'Warm-Up');
  near(evalSkill('Wind Chimes', 'Hell and High Water', { resources: { worldlyPlight: 30 } }).selfMorale, -0.13, 'Hell and High Water at 30 Worldly Plight');
  const room = calc({ prod1: [maxed('Firewhistle'), maxed('Cuora')] }).rooms.prod1;
  near(room.morale.yellow, -0.1, 'shared rate change');
  near(room.perOperatorMorale?.Cuora, 0.95 - 0.1, 'Cuora');
});

test('THRM-EX and Spuria spend less Morale in a Power Plant, as their skills say', () => {
  near(evalSkill('THRM-EX', 'Enthusiasm').selfMorale, -0.52, 'Enthusiasm');
  near(evalSkill('Spuria', 'Take-Away Fruit Tarts').selfMorale, -0.3, 'Take-Away Fruit Tarts');
  near(calc({ prod3: [maxed('THRM-EX')] }).rooms.prod3.perOperatorMorale?.['THRM-EX'], 0.48, 'THRM-EX alone');
  const alpha = evalSkill('Spuria', 'Technology Exchange α').custom!;
  assert.equal(alpha.handler, 'ramp'); assert.deepEqual(alpha.params, { base: 0.1, perHour: 0.01, cap: 0.15 });
});

test('Ripresa, Harmonie, Odda and Ho\'olheyak get their bonus and pay their Morale only while alone', () => {
  for (const [op, skill, clue, morale] of [['Ripresa', 'Professional Manager β', 0.35, 1], ['Harmonie', 'Double Agent', 0.5, 2], ['Odda', '"Professional Ethics" β', 0.35, 1], ["Ho'olheyak", '"Professional Ethics" β', 0.35, 1]] as const) {
    const alone = evalSkill(op, skill, { roomNames: [op] }), together = evalSkill(op, skill, { roomNames: [op, 'Amiya'] });
    near(alone.clueSpeed, clue, `${op} alone`); near(alone.selfMorale, morale, `${op} alone Morale`);
    near(together.clueSpeed, 0, `${op} with company`); near(together.selfMorale, 0, `${op} with company Morale`);
  }
  const room = calc({ receptionRoom: [maxed('Harmonie')] }).rooms.receptionRoom;
  near(room.perOperatorMorale?.Harmonie, 3, 'Harmonie alone, whole calculator');
});

test("Ukusik's 'Extra, Extra!' feeds the Reception Room per extra recruit slot", () => {
  const r = evalSkill('Ukusik', "'Extra, Extra!'", { levels: { office: 3 } });
  near(r.hrSpeed, 0.3, 'HR speed'); near(r.cc.receptionClue, 0.1, 'Reception Room clue speed');
});

test("Zima the Raging Tide counts Ursus students in the Reception Room and needs one beside her in the Factory", () => {
  const rosters = toBaseRosters(groups);
  const boss = evalSkill('Zima the Raging Tide', "'Got It, Boss!'", { counts: { 'reception.roster:URSUS_STUDENT_SELF_GOVERNING_GROUP': 2 } });
  near(boss.selfMorale, 0.5, 'Got It, Boss! Morale'); near(boss.cc.clue, 0.2, 'Got It, Boss! clue');
  near(evalSkill('Zima the Raging Tide', 'Friends Forever', { rosters, product: 'Battle Records', roomNames: ['Zima the Raging Tide'] }).productivity, 0.3, 'Friends Forever alone');
  near(evalSkill('Zima the Raging Tide', 'Friends Forever', { rosters, product: 'Battle Records', roomNames: ['Zima the Raging Tide', 'Rosa'] }).productivity, 0.4, 'Friends Forever with Rosa');
});

test('Waai Fu and Snowsant count every full 5% the others provide', () => {
  const factory = calc({ prod2: [maxed('Waai Fu'), maxed('Executor the Ex Foedere')] }, { prod2: 'Battle Records' }).rooms.prod2;
  const waaiFu = factory.facilityBreakdown!.lines.find(l => l.skillName === 'Cooperative Will')!;
  near(waaiFu.rawValue, 0.3, 'Cooperative Will beside a +30% Notarial Hall Instructor β');
  const post = calc({ prod1: [maxed('Snowsant'), maxed('Haze')] }).rooms.prod1;
  near(post.facilityBreakdown!.lines.find(l => l.skillName === 'Heavenly Reward β')!.rawValue, 0.3, 'Heavenly Reward β beside a +30% Order Distribution β');
});
