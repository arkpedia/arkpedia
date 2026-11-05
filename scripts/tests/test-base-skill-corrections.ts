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

test("Taraxacum counts Dormitories among the facilities with a Sui operator", () => {
  // Ling and Chongyue in two Dormitories, Nian in a Factory: three facilities, 12%.
  const room = calc({ prod1: [maxed('Taraxacum')], dormitory1: [maxed('Ling')], dormitory2: [maxed('Chongyue')], prod2: [maxed('Nian')] }, { prod2: 'Battle Records' }).rooms.prod1;
  near(room.facilityBreakdown!.lines.find(l => l.skillName?.includes('Best of Students'))!.rawValue, 0.12, "'The Best of Students!' over three facilities");
});

const trainee = (className: string, mastery: number, branch = '') => ({ class: className, branch, mastery, timeReductionActive: false, instantTrainingReady: false });
const trainingSpeed = (trainer: string, target: ReturnType<typeof trainee>) => calculateBase({ ...base, assignments: { trainingRoom: [maxed(trainer)] }, factoryProducts: {}, loginInterval: 8, trainingTarget: target }).rooms.trainingRoom;
test('the conditional training bonuses apply only at their stated Specialization, branch and class', () => {
  near(trainingSpeed('Heavyrain', trainee('Defender', 1)).trainingSpeed, 1.35, 'Heavyrain at M1');
  near(trainingSpeed('Heavyrain', trainee('Defender', 2)).trainingSpeed, 1.8, 'Heavyrain at M2');
  near(trainingSpeed('Aurora', trainee('Defender', 1)).trainingSpeed, 1.8, 'Aurora at M1');
  near(trainingSpeed('Aurora', trainee('Defender', 3)).trainingSpeed, 1.35, 'Aurora at M3');
  near(trainingSpeed('Mint', trainee('Caster', 2)).trainingSpeed, 1.8, 'Mint at M2');
  near(trainingSpeed('Mint', trainee('Caster', 3)).trainingSpeed, 1.35, 'Mint at M3');
  const skadi2 = trainingSpeed('Skadi the Corrupting Heart', trainee('Supporter', 2)), skadi3 = trainingSpeed('Skadi the Corrupting Heart', trainee('Supporter', 3));
  near(skadi2.trainingSpeed, 1.35, 'Skadi at M2'); near(skadi3.trainingSpeed, 2, 'Skadi at M3');
  near(skadi2.perOperatorMorale!['Skadi the Corrupting Heart'] - skadi2.combinedMoraleRate, 0, 'Mutation at M2'); near(skadi3.perOperatorMorale!['Skadi the Corrupting Heart'] - skadi3.combinedMoraleRate, 1, 'Mutation at M3');
  const necrass = trainingSpeed('Necrass', trainee('Caster', 2));
  near(necrass.perOperatorMorale!.Necrass - necrass.combinedMoraleRate, 0, 'Why Cry For Freedom? at M2');
  near(trainingSpeed('Talulah', trainee('Guard', 1, 'Lord')).trainingSpeed, 1.35, 'Talulah with a Lord');
  near(trainingSpeed('Talulah', trainee('Guard', 1, 'Primal Guard')).trainingSpeed, 1.8, 'Talulah with a Primal Guard');
  near(trainingSpeed('Talulah', trainee('Sniper', 1, 'Marksman')).trainingSpeed, 1.05, 'Talulah with a Sniper');
});

const crafting = (crafter: string, recipeName: string) => {
  const recipe = recipes.find(r => r.name === recipeName)!;
  return calculateBase({ ...base, assignments: { workshop: [maxed(crafter)] }, factoryProducts: {}, loginInterval: 8, workshopSettings: { recipeId: recipe.id, qualifyingDormOperators: 0, causality: 0, karma: 0, thornsFailures: 0 } }).rooms.workshop.workshop!;
};
test("Caleido's and Homebound's Workshop skills apply to their recipes alone", () => {
  near(crafting('Caleido', 'Orirock Concentration').boost, 0.8, 'Caleido on an Elite material');
  near(crafting('Caleido', 'Light Building Material').boost, 0, 'Caleido on a Building material');
  near(crafting('Homebound', 'Orirock Concentration').boost, 0, 'Homebound on Orirock');
  near(crafting('Homebound', 'Chiral Refractor').boost, 0.9, 'Homebound on a Chiral Refractor');
});

test("Bubble's Bigger is Better! pays 1% a point up to a 16-point capacity increase", () => {
  // Vulcan's Craftsmanship Spirit α adds exactly +16: 16 points at 1% each, not 3% (which the old handler paid from 16).
  const room = calc({ prod2: [maxed('Bubble'), { operatorName: 'Vulcan', eliteLevel: 'Base', level: 30 }] }, { prod2: 'Battle Records' }).rooms.prod2;
  const bubble = room.facilityBreakdown!.lines.find(l => l.skillName === 'Bigger is Better!')!;
  near(bubble.rawValue, 0.01 * 16 + 0.01 * 10, 'Vulcan +16 at 1% and Hoarder +10 at 1%');
});

// The game's glossary: a name the text wraps in a term (cc.angel, cc.gvial) means every form of it, as one condition.
test("Lemuen's Amicus pays its +25% once for either Exusiai", () => {
  near(evalSkill('Lemuen', 'Amicus', { roomNames: ['Lemuen', 'Exusiai'] }).orderEfficiency, 0.45, 'with Exusiai');
  near(evalSkill('Lemuen', 'Amicus', { roomNames: ['Lemuen', 'Exusiai the New Covenant'] }).orderEfficiency, 0.45, 'with Exusiai the New Covenant');
  near(evalSkill('Lemuen', 'Amicus', { roomNames: ['Lemuen', 'Exusiai', 'Exusiai the New Covenant'] }).orderEfficiency, 0.45, 'with both: once, not +70%');
  near(evalSkill('Lemuen', 'Amicus', { roomNames: ['Lemuen', 'Texas'] }).orderEfficiency, 0.2, 'without');
  const both = calc({ prod1: [maxed('Lemuen'), maxed('Exusiai'), maxed('Exusiai the New Covenant')] }).rooms.prod1;
  near(both.facilityBreakdown!.lines.find(l => l.skillName === 'Amicus')!.rawValue, 0.45, 'Amicus in the Trading Post with both');
});

test("Tomimi's Barbecue Master pays for Gavial the Invincible as for Gavial", () => {
  near(evalSkill('Tomimi', 'Barbecue Master', { target: 'Gavial' }).recovery.single, 1, 'Gavial');
  near(evalSkill('Tomimi', 'Barbecue Master', { target: 'Gavial the Invincible' }).recovery.single, 1, 'Gavial the Invincible');
  near(evalSkill('Tomimi', 'Barbecue Master', { target: 'Cuora' }).recovery.single, 0.55, 'anyone else');
  const r = calc({ dormitory1: [maxed('Tomimi'), maxed('Gavial the Invincible')] });
  const gavial = r.dormitoryRecoveryByFacility.dormitory1.find(x => x.name === 'Gavial the Invincible')!;
  near(gavial.bonus, 1, 'Gavial the Invincible recovers +1 from Tomimi');
  // The preferred target is either Gavial, ahead of a roommate who needs more; between the two, the one who needs more.
  const preferred = calc({ dormitory1: [maxed('Tomimi'), { ...maxed('Gavial the Invincible'), morale: 20 }, { ...maxed('Cuora'), morale: 5 }] });
  near(preferred.dormitoryRecoveryByFacility.dormitory1.find(x => x.name === 'Gavial the Invincible')!.bonus, 1, 'Gavial the Invincible preferred over Cuora');
  near(preferred.dormitoryRecoveryByFacility.dormitory1.find(x => x.name === 'Cuora')!.bonus, 0, 'Cuora gets nothing from Tomimi');
  const both = calc({ dormitory1: [maxed('Tomimi'), { ...maxed('Gavial the Invincible'), morale: 20 }, { ...maxed('Gavial'), morale: 5 }] });
  near(both.dormitoryRecoveryByFacility.dormitory1.find(x => x.name === 'Gavial')!.bonus, 1, 'Gavial, who needs more, is the target');
  near(both.dormitoryRecoveryByFacility.dormitory1.find(x => x.name === 'Gavial the Invincible')!.bonus, 0, 'Gavial the Invincible waits');
});

// Held to the game server's own numbers (a raw save's room buffs, scripts/bench/game-buff-check.ts, 2026-11-05).
const roomOf = (kind: string) => facilities.find(f => f.kind === kind)!.id;

test("Shamare's Whispers raises every operator's Morale use in the Trading Post, not hers alone", () => {
  // 全体心情每小时消耗+0.25; the server applies it as the post's shared rate (TRADING buff.apCost.all -25).
  const post = roomOf('tradingPost');
  const room = calc({ [post]: [maxed('Shamare'), maxed('Bibeak'), maxed('Tequila')] }).rooms[post];
  near(room.morale.yellow, 0.25, 'shared rate change');
  // 0.90 for three in a room, +0.25 Whispers, -0.25 each for Tailoring and Investment: what the save shows less its Control Center.
  for (const name of ['Shamare', 'Bibeak', 'Tequila']) near(room.perOperatorMorale?.[name], 0.9, name);
});

test("Greyy the Lightningbearer's Line Patrol Frame counts whole tens of drone capacity", () => {
  // The server gives her plant 0.28 on a base of 235 drone capacity: 5% innate and 23%, not 23.5%.
  const plant = roomOf('powerPlant');
  near(calc({ [plant]: [maxed('Greyy the Lightningbearer')] }).rooms[plant].droneRate, 0.28, 'drone rate');
});
