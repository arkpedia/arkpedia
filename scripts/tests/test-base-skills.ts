import { dormitoryRecoveryRates, type DormRecoveryProvider } from '../../lib/base/dormitoryRecovery';
import { capacityForLevel, canSetSpotKind } from '../../lib/base/baseConfig';
import { calcDormitoryRecovery, calcTradingPostGoldAndLmdPerHour, calcTradingPostFullTime, tradingPostExpectedMinutes } from '../../lib/base/baseProductivity';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { BaseSkill } from '../../lib/operators/operatorTypes';
import { getAllOperators } from '../../lib/operators/operators';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { resolveTrainingTarget, canTrainMastery, type TrainingTarget } from '../../lib/base/trainingRoom';
import { calculateBase } from '../../lib/base/calculateBase';
import { presetLevels, presetSpots } from '../../lib/base/baseConfig';
import slots from '../../data/base-skill-slots.json';
import { crossFacilityMoraleRelief } from '../../lib/base/crossFacilityMorale';
import { jayeContribution } from '../../lib/base/jaye';
import { toBaseRosters, checkBaseRosters } from '../../lib/base/baseGroupRosters';
import { computeResourcePools } from '../../lib/base/baseResources';
import { CUSTOM_HANDLERS, type CustomContext } from '../../lib/base/customSkillHandlers';
import { evalSkill } from './skill-eval-helper';
import { readSavedBasePresets } from '../../lib/base/baseSavedPresets';
import { defaultProductionSpots, getFacilities } from '../../lib/base/baseConfig';
import fixture from './fixtures/base-skill-source.json';
import rosterData from '../../data/base-group-rosters.json';
import recipes from '../../data/base-workshop-recipes.json';
const ops = new Map(getAllOperators().map(op => [op.name, op]));
// The fixture's operators by the game's character id, not the name it recorded on 2026-10-09: a CN
// operator's name is our translation until Global ships it, and Global renames some on the day
// (Gallus² became GALLUS² on 2026-10-14, Kal'tsit - Esperanta became Kal'tsit Esperanta), which
// failed both fixture tests in that night's content run.
const byId = new Map(getAllOperators().map(op => [op.internalName, op]));
const fixtureOperator = (expected: { name: string; internalName: string }) => {
  const op = byId.get(expected.internalName);
  assert(op, `${expected.name} (${expected.internalName}) has a record`);
  return op;
};
const rosters = toBaseRosters(checkBaseRosters(rosterData));
const emptyCustomContext = (operatorName: string): CustomContext => ({ operatorName, roomNames: [operatorName], rampWindowHours: 24, rampStartHours: 0, selfMoraleRate: 1, othersProductivitySum: 0, capacityByOperator: {}, groupHuntingInControlCenter: false, othersOrderEfficiencySum: 0, othersOrderLimitRawSum: 0, abyssalHunters: { working: 0, resting: 0, restingAtFullMorale: 0, perFactory: [], totalInFactories: 0 }, fractionAbove12: 1, ccFamilyCount: () => 0 });
const near = (actual: number | undefined, expected: number) => assert(Math.abs((actual ?? NaN) - expected) < 1e-8, `${actual} != ${expected}`);
// The Training Room and Workshop through the calculator, as the page runs them: the trainer or crafter in the room,
// anyone else named in a Dormitory (with a Morale level where a Workshop skill counts by it).
const roomFacilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const dormIds = roomFacilities.filter(f => f.kind === 'dormitory').map(f => f.id);
const maxedSlot = (name: string, morale?: number) => ({ operatorName: name, eliteLevel: 'Elite 2' as const, level: 90, ...(morale !== undefined ? { morale } : {}) });
const inDorms = (names: string[], morale: (i: number) => number | undefined = () => undefined) => Object.fromEntries(dormIds.map((id, d) => [id, names.slice(d * 5, d * 5 + 5).map((n, i) => maxedSlot(n, morale(d * 5 + i)))]));
const calcRoom = (assignments: Record<string, ReturnType<typeof maxedSlot>[]>, more: { trainingTarget?: TrainingTarget; workshopSettings?: { recipeId: string; overrideDormCount?: boolean; qualifyingDormOperators: number; causality: number; karma: number; thornsFailures: number } }) =>
  calculateBase({ operators: [...ops.values()], rosters, skillSlots: slots, workshopRecipes: recipes, facilities: roomFacilities, assignments, factoryProducts: {}, loginInterval: 8, ...more });
const training = (name: string, className = 'Guard', mastery = 1, placed = [name], branch = '') => {
  const others = [...new Set(placed)].filter(n => n !== name && ops.has(n));
  const room = calcRoom({ trainingRoom: [maxedSlot(name)], ...inDorms(others) }, { trainingTarget: { class: className, branch, mastery, timeReductionActive: false, instantTrainingReady: false } }).rooms.trainingRoom;
  return { speed: room.trainingSpeed!, hours: room.trainingHours!, morale: room.perOperatorMorale![name] - room.combinedMoraleRate };
};
const FILLERS = [...ops.keys()].filter(n => !/^Amiya \(/.test(n)).sort().slice(0, 40);

test('all 429 game operators and 921 source steps match IDs, unlocks, facilities and Global descriptions', () => {
  assert.equal(fixture.operators.length, 429);
  assert.equal(fixture.operators.reduce((s, op) => s + op.steps.length, 0), 921);
  for (const expected of fixture.operators) {
    const op = fixtureOperator(expected);
    assert.equal(op.baseSkills?.length, expected.steps.length, expected.name);
    for (const [i, row] of expected.steps.entries()) {
      const actual: BaseSkill = op.baseSkills![i];
      assert.deepEqual([actual.buffId, actual.slot, actual.phase, actual.level, actual.facility], row.slice(0, 5), `${expected.name}/${i}`);
      if (row[5]) assert.equal(createHash('sha256').update(actual.description!).digest('hex'), row[5], `${expected.name}: source description`);
    }
    for (let phase = 0; phase <= 2; phase++) {
      const best = new Map<number, typeof expected.steps[number]>();
      for (const row of expected.steps) {
        if (Number(row[2]) > phase) continue;
        const prior = best.get(Number(row[1]));
        if (!prior || Number(row[2]) > Number(prior[2]) || Number(row[2]) === Number(prior[2]) && Number(row[3]) > Number(prior[3])) best.set(Number(row[1]), row);
      }
      for (const room of ['Control Center', 'Dormitory', 'Office', 'Factory', 'Reception Room', 'Power Plant', 'Trading Post', 'Training Room', 'Workshop']) {
        const actual = activeBaseSkills(op, room, ['Base', 'Elite 1', 'Elite 2'][phase]).map(skill => skill.buffId).sort();
        assert.deepEqual(actual, [...best.values()].filter(row => row[4] === room).map(row => row[0]).sort(), `${op.name} E${phase} ${room}`);
      }
    }
  }
});
test('R6 defense/offense includes self and dorm staff, excludes wrong subgroup and unrelated operators, deduplicates', () => {
  for (const trainer of ['Ela', 'Doc']) near(training(trainer, 'Medic', 1, [trainer, 'Tachanka', 'Frost', 'Ash', 'Amiya', 'Frost']).speed, 1.35);
  for (const trainer of ['Iana', 'Fuze']) near(training(trainer, 'Guard', 1, [trainer, 'Ash', 'Blitz', 'Doc', 'Amiya']).speed, 1.35);
  near(training('Ela', 'Caster', 3, ['Ela', 'Doc', 'Frost', 'Tachanka']).speed, 1.45);
});
test('training class, branch, mastery, morale and replacement gates', () => {
  near(training('Warfarin', 'Medic').speed, 1.55); near(training('Warfarin', 'Guard').speed, 1.05);
  near(training('Akafuyu', 'Guard', 1).speed, 1.8); near(training('Akafuyu', 'Guard', 2).speed, 1.35);
  near(training('Qiubai', 'Guard', 1, ['Qiubai'], 'Lord').speed, 1.8);
  near(training('Qiubai', 'Guard', 1, ['Qiubai'], 'Fighter').speed, 1.35);
  near(training("Ch'en the Holungday", 'Sniper', 1).morale, 1);
  near(training("Ch'en the Holungday", 'Guard', 1).morale, 0);
  near(training('Skadi the Corrupting Heart', 'Supporter', 3).speed, 2);
  near(training('Skadi the Corrupting Heart', 'Supporter', 2).morale, 0);
  near(training('Viy', 'Guard').speed, 1.5); near(training('Viy', 'Medic').speed, 1.05);
  near(training('Warfarin', 'Medic', 2).hours, 16 / 1.55);
});
test('named trainee traits override stale preset metadata, while manual and legacy targets remain usable', () => {
  const saved = { operatorName: 'Warfarin', class: 'Guard', branch: 'Fighter', mastery: 1, timeReductionActive: false, instantTrainingReady: false };
  const roster = [...ops.values()];
  const medic = resolveTrainingTarget(saved, roster);
  assert.equal(medic.class, 'Medic');
  near(training('Warfarin', medic.class, medic.mastery, ['Warfarin'], medic.branch).speed, 1.55);
  assert.equal(resolveTrainingTarget({ ...saved, operatorName: 'Qiubai' }, roster).branch, 'Lord');
  assert.deepEqual(resolveTrainingTarget({ ...saved, operatorName: '' }, roster), { ...saved, operatorName: '' });
  assert.deepEqual(resolveTrainingTarget(saved, [{ name: 'Warfarin' }]), saved);
  const doc = resolveTrainingTarget({ ...saved, operatorName: 'Doc', class: 'Medic' }, roster);
  assert.equal(doc.class, 'Guard'); assert.equal(doc.branch, 'Instructor');
});
test('only operators who can train mastery can occupy the named trainee slot', () => {
  const target = { operatorName: 'Lancet-2', class: 'Medic', branch: 'Medic', mastery: 1, timeReductionActive: false, instantTrainingReady: false };
  for (const expected of fixture.operators) {
    const op = fixtureOperator(expected);
    const hasElite2 = op.promotion.some(row => row.tier === 'Elite 2');
    assert.equal(canTrainMastery(op), hasElite2, op.name);
    const resolved = resolveTrainingTarget({ ...target, operatorName: op.name }, [...ops.values()]);
    assert.equal(resolved.operatorName, hasElite2 ? op.name : '', op.name);
  }
  const invalid = resolveTrainingTarget({ ...target, timeReductionActive: true, instantTrainingReady: true }, [...ops.values()]);
  assert.equal(invalid.timeReductionActive, false); assert.equal(invalid.instantTrainingReady, false);
  assert(!canTrainMastery({ rarity: null }));
  assert(!canTrainMastery({}));
});
test('actual TP/RR levels and exact Taraxacum quoted name', () => {
  for (let level = 1; level <= 3; level++) near(evalSkill('Rose Salt', 'Time Is Money', { levels: { room: level } }).orderLimit, level);
  near(evalSkill('Vigil', 'New City Trade', { levels: { receptionRoom: 1 } }).orderEfficiency, 0.3);
  near(evalSkill('Vigil', 'New City Trade', { levels: { receptionRoom: 3 } }).orderEfficiency, 0.4);
  near(evalSkill('Taraxacum', "'The Best of Students!'", { counts: { 'base.facilitiesWithRoster:SUI': 3 } }).orderEfficiency, 0.12);
});
test('recruitment slots scale with Office level', () => {
  for (let level = 1; level <= 3; level++) {
    near(evalSkill('Lin', 'Meritocracy', { levels: { office: level } }).hrSpeed, 0.1 * (level - 1));
    // What the generators make at this Office level, Czerny in a level 2 Dormitory and Iris in a level 3 one, pooled.
    const generated: Record<string, number> = {};
    for (const [op, skill, facts] of [['Whisperain', 'Itinerant', { levels: { office: level } }], ['Mulberry', 'Rescue Team - Post-Catastrophe Census', { levels: { office: level } }], ['Czerny', 'Adagio', { levels: { room: 2 } }], ['Iris', 'Bedtime Story', { levels: { room: 3 } }]] as const) {
      for (const [name, amount] of Object.entries(evalSkill(op, skill, facts).resources)) generated[name] = (generated[name] ?? 0) + amount;
    }
    const pools = computeResourcePools(generated, new Set());
    near(pools.measure, 2); near(pools.dreamland, 3); near(pools.memoryFragments, 10 * (level - 1)); near(pools.worldlyPlight, 10 * (level - 1));
  }
});
test('spreadsheet regressions use actual room levels and distinguish base-wide from same-room effects', () => {
  near(evalSkill('Narantuya', 'Union of Desert Bandits', { product: 'Precious Metals', counts: { 'base.dormLevels': 5 } }).productivity, 0.05);
  near(evalSkill('Narantuya', 'Union of Desert Bandits', { product: 'Battle Records', counts: { 'base.dormLevels': 5 } }).productivity, 0);
  // Graphic Design supplies one Engineering Robot per facility level, capped at 64; Machine Assistance converts complete groups of 16 or 8.
  const robots = (levels: number) => evalSkill('Minimalist', 'Graphic Design', { counts: { 'base.facilityLevels': levels } }).resources.engineeringRobots;
  near(evalSkill('Minimalist', 'Machine Assistance α', { resources: { engineeringRobots: robots(44) } }).productivity, 0.1);
  near(evalSkill('Minimalist', 'Machine Assistance β', { resources: { engineeringRobots: robots(44) } }).productivity, 0.25);
  near(evalSkill('Minimalist', 'Machine Assistance β', { resources: { engineeringRobots: robots(80) } }).productivity, 0.4);
  near(evalSkill('Tin Man', 'Maylander Detective β', { counts: { 'base.dormLevels': 4 } }).hrSpeed, 0.13);
  for (let level = 1; level <= 3; level++) for (const [op, skill] of [['Mr. Nothing', 'Nosy'], ['Tsukinogi', "Empath's Insight"], ['Ukusik', 'Law of the Streets']] as const) {
    near(evalSkill(op, skill, { levels: { office: level } }).cc.receptionClue, 0.05 * (level - 1));
  }
  for (let level = 0; level <= 3; level++) {
    near(evalSkill('Vigil', 'New City Trade', { levels: { receptionRoom: level } }).orderEfficiency, 0.25 + 0.05 * level);
    near(evalSkill('Mitm', 'Gifted Adviser', { levels: { receptionRoom: level } }).orderEfficiency, 0.15 + 0.05 * level);
  }
  near(evalSkill('Bellone', 'Famiglia Business β', { roomNames: ['Bellone'] }).orderEfficiency, 0.3);
  // Game text says Vigil anywhere in the base; the spreadsheet's separate-room 30% omits this.
  near(evalSkill('Bellone', 'Famiglia Business β', { roomNames: ['Bellone'], placedNames: ['Bellone', 'Vigil'] }).orderEfficiency, 0.4);
  assert.equal(evalSkill('Bellone', 'Outstanding Debt', { roomNames: ['Bellone'], placedNames: ['Bellone', 'Vigil'] }).orderLimit, 0);
  const together = evalSkill('Bellone', 'Outstanding Debt', { roomNames: ['Bellone', 'Vigil'], placedNames: ['Bellone', 'Vigil'] });
  near(together.orderLimit, 2);
  near(together.selfMorale, -0.1);
});
test('cross-facility morale keeps strongest matching scope, never stacks banners', () => {
  // Młynar with two qualifying Control Center skills: +0.1 in his own rooms and +0.05 per skill everywhere.
  const mlynar = { ownRooms: 0.1, everyRoom: 0.1 };
  near(crossFacilityMoraleRelief('factory', 0.2, 0.15, mlynar), 0.2);
  near(crossFacilityMoraleRelief('office', 0.1, 0.15, mlynar), 0.2);
  for (const kind of ['trainingRoom', 'workshop', 'dormitory', 'controlCenter'] as const) near(crossFacilityMoraleRelief(kind, 0.2, 0.2, { ownRooms: 0.1, everyRoom: 0.05 }), 0);
});
test('Fiammetta exclusive recovery and Recon target membership', () => {
  near(evalSkill('Fiammetta', 'Self-Discipline').recovery.exclusive, 2);
  near(evalSkill('Rhodes Island Recon', 'Hunting Helper', { rosters, target: 'Terra Research Commission' }).recovery.single, 1);
  near(evalSkill('Rhodes Island Recon', 'Hunting Helper', { rosters, target: 'Amiya' }).recovery.single, 0.55);
});
test('Jaye E0 depends on collection interval and TP level; E1 skills cancel queue dependence and Snowsant feedback', () => {
  const short = jayeContribution(10, 0, 0, false, 1.01, 1, 3), long = jayeContribution(10, 0, 0, false, 1.01, 24, 3);
  near(short.jaye, 0.4); assert(long.jaye < short.jaye && long.jaye > 0);
  assert(jayeContribution(6, 0, 0, false, 1.01, 12, 1).jaye < jayeContribution(10, 0, 0, false, 1.01, 12, 3).jaye);
  near(jayeContribution(10, 0.3, 0.35, true, 1.03, 24, 3).jaye, 0.16);
  near(jayeContribution(10, 0, 0.35, true, 1.02, 24, 3).snowsant, 0);
  near(jayeContribution(10, 0.3, 0.35, true, 1.03, 1, 3).snowsant, 0.3);
});
const craft = (name: string, recipeName: string, extra: { qualifyingDormOperators?: number; dormMorale?: number[]; causality?: number; karma?: number; thornsFailures?: number; residents?: string[] } = {}) => {
  const recipe = recipes.find(r => r.name === recipeName)!; assert(recipe, recipeName);
  // The reader's own count stands in for 20 residents; a Morale list seats that many residents at those levels.
  const residents = (extra.residents ?? FILLERS).filter(n => n !== name).slice(0, extra.qualifyingDormOperators !== undefined ? 20 : extra.dormMorale?.length ?? 0);
  const r = calcRoom({ workshop: [maxedSlot(name)], ...inDorms(residents, i => extra.dormMorale?.[i] ?? 0) }, { workshopSettings: { recipeId: recipe.id, overrideDormCount: extra.qualifyingDormOperators !== undefined, qualifyingDormOperators: extra.qualifyingDormOperators ?? 0, causality: extra.causality ?? 0, karma: extra.karma ?? 0, thornsFailures: extra.thornsFailures ?? 0 } });
  return r.rooms.workshop.workshop!;
};
test('workshop recipe category/family, costs, dorm thresholds and guarantee counters', () => {
  near(craft('Mudrock', 'Orirock Concentration').chance, 0.19); near(craft('Mudrock', 'Orirock Concentration').morale, 2);
  near(craft('Nian', 'Orirock Concentration').chance, 0.2); near(craft('Nian', 'Orirock Concentration').morale, 6);
  near(craft('Aosta', 'Orirock Concentration').chance, 0.1); near(craft('Aosta', 'Polyester Lump').chance, 0.19);
  near(craft('Arene', 'Orirock Concentration', { qualifyingDormOperators: 20 }).chance, 0.2);
  near(craft('Stainless', 'Orirock Concentration', { qualifyingDormOperators: 20 }).morale, 2);
  near(craft('Stainless', 'Orirock Cluster', { qualifyingDormOperators: 20 }).morale, 2);
  near(craft('Stainless', recipes.find(r => r.category === 'Elite materials' && r.morale === 8)!.name, { qualifyingDormOperators: 20 }).morale, 8);
  near(craft('Vetochki', 'Oriron Cluster').morale, 1);
  near(craft('Vetochki', 'Oriron').morale, 1);
  near(craft('Vetochki', 'Oriron Block').morale, 4);
  near(craft('Nine-Colored Deer', 'Orirock Concentration', { causality: 40 }).chance, 1);
  near(craft('Blemishine', 'Orirock Concentration').lmd, 0);
  const crew = ['Stainless', 'Ash', 'Blitz', 'Frost', 'Tachanka', ...FILLERS];
  for (const op of ops.values()) {
    if (!activeBaseSkills(op, 'Workshop', 'Elite 2').length) continue;
    for (const recipe of recipes) {
      const result = craft(op.name, recipe.name, { qualifyingDormOperators: 20, residents: crew });
      assert(Number.isFinite(result.morale) && result.morale >= 0, `${op.name}: ${recipe.name}`);
      assert(result.chance >= 0 && result.chance <= 1);
    }
  }
});
test('saved presets survive changed capacity and reject malformed/duplicate workers', () => {
  const spots = defaultProductionSpots();
  const room = getFacilities(spots, {}).find(f => f.kind === 'tradingPost')!;
  const raw = { version: 1, id: 'one', name: 'Gold', productionSpots: spots, facilityLevels: { [room.id]: 1 }, assignments: { [room.id]: [{ operatorName: 'Amiya', eliteLevel: 'Elite 2' }, { operatorName: 'Amiya', eliteLevel: 'Base' }] } };
  const preset = readSavedBasePresets([raw], new Set(ops.keys()))[0];
  assert(preset); assert.equal(preset.assignments[room.id].length, 1); assert.equal(preset.assignments[room.id][0]?.operatorName, 'Amiya');
  assert.deepEqual(readSavedBasePresets([{ ...raw, productionSpots: {} }], new Set(ops.keys())), []);
});

test('room staffing, construction and dorm recovery match game levels', () => {
  for (let level = 1; level <= 3; level++) {
    assert.equal(capacityForLevel('receptionRoom', level), 2);
    assert.equal(capacityForLevel('office', level), 1);
    assert.equal(capacityForLevel('tradingPost', level), level);
  }
  for (let level = 1; level <= 5; level++) assert.equal(capacityForLevel('controlCenter', level), level);
  near(calcDormitoryRecovery(5, 5000), 4); near(calcDormitoryRecovery(5, 9000), 4);
  near(calcDormitoryRecovery(0, 5000), 0);
  const spots = defaultProductionSpots();
  assert(!canSetSpotKind(spots, 'prod1', 'powerPlant'));
});
test('TP level changes order distribution, Proviso output and fill time', () => {
  near(tradingPostExpectedMinutes('base', 1), 144);
  near(tradingPostExpectedMinutes('base', 2), 170.4);
  near(tradingPostExpectedMinutes('base', 3), 203.4);
  const at2 = calcTradingPostGoldAndLmdPerHour(1, 2, 500, 'base', 2);
  near(at2.goldPerHour, 4.4 / 2.84); near(at2.extraLmdPerHour, 0);
  near(calcTradingPostFullTime(8, 1, 2)!, 8 * 2.84);
  assert.equal(evalSkill('Jacinta', "An Heiress's Eye").entry.interaction?.goldOrderTier, 'lower');
  const a = jayeContribution(1, 0, 0, false, 1.01, 24, 1);
  // A full queue's idle hours must not reduce his productive-hour bonus twice.
  near(a.jaye, 0.04);
});
test('dorm conditional recovery respects full recipients, thresholds and Coldshot herself', () => {
  // Coldshot shares 0.8 among the roommates below full Morale, herself included; the room splits it (calculateBase).
  near(evalSkill('Coldshot', 'Wet Your Whistles', { roomNames: ['Coldshot', 'Amiya', 'Vendela'] }).recovery.distributed, 0.8);
  assert.deepEqual(evalSkill('Perfumer the Distilled', 'Pure Breath').recovery.conditionalGroup, { below: 20, amount: 0.1 });
  assert.deepEqual(evalSkill('Vendela', 'Aroma Convalescence β').recovery.conditionalGroup, { below: 18, amount: 0.1 });
  near(evalSkill('Bobbing', 'Conversationalist', { counts: { 'room.belowFullMorale': 2 } }).recovery.all, 0.22);
  const tide = evalSkill('Gladiia', 'Tide Observation').custom!;
  near(CUSTOM_HANDLERS[tide.handler](tide.params, { ...emptyCustomContext('Gladiia'), abyssalHunters: { working: 1, resting: 3, restingAtFullMorale: 2, perFactory: [], totalInFactories: 0 } }).selfMorale, -2);
});
test('dorm recovery groups compete per recipient; Senshi/Morgan and Fiammetta use their actual recipients', () => {
  const p = (name: string, extra: Partial<DormRecoveryProvider> = {}): DormRecoveryProvider => ({ name, selfBonus: 0, allOperatorsBonus: 0, allOthersBonus: 0, singleTargetBonus: 0, targetIfSelected: null, ...extra });
  const rates = dormitoryRecoveryRates([p('Bagpipe', { selfBonus: 0.55, allOthersBonus: 0.1 }), p('Durin', { selfBonus: -0.1, allOperatorsBonus: 0.25 }), p('Muelsyse', { selfBonus: 0.55, allOthersBonus: 0.1 }), p('Fiammetta', { exclusiveRecovery: 2 })], 4, rosters, {});
  near(rates[0].bonus, 0.8); near(rates[1].bonus, 0.15); near(rates[2].bonus, 0.8); near(rates[3].base + rates[3].bonus, 2);
  const senshi = evalSkill('Senshi', 'Veteran Cook');
  const party = dormitoryRecoveryRates([p('Senshi', { allOperatorsBonus: senshi.recovery.all, recipientBonus: senshi.entry.interaction?.recipientBonus }), p('Laios'), p('Amiya')], 4, rosters, {});
  near(party[0].bonus, 0.3); near(party[1].bonus, 0.3); near(party[2].bonus, 0.15);
  const morgan = evalSkill('Morgan', 'No.1 Practice Partner').entry.interaction!.providerBonus!;
  const glasgow = dormitoryRecoveryRates([p('Siege', { allOperatorsBonus: 0.2 }), p('Morgan'), p('Amiya')], 4, rosters, {}, [morgan]);
  near(glasgow[0].bonus, 0.5); near(glasgow[1].bonus, 0.5); near(glasgow[2].bonus, 0.2);
});
test('crafting reads each actual dorm threshold and Deer guarantees on the craft that crosses the counter', () => {
  const values = [4, 12, 19, 20, 21];
  near(craft('Arene', 'Orirock Concentration', { dormMorale: values }).boost, 0.2);
  near(craft('Stainless', 'Orirock Concentration', { dormMorale: values }).boost, 0.1);
  near(craft('Nine-Colored Deer', 'Orirock Concentration', { causality: 36 }).chance, 1);
  near(craft('Nine-Colored Deer', 'Orirock Concentration', { causality: 35 }).chance, 0.1);
  const tier5 = recipes.find(r => r.category === 'Elite materials' && r.morale === 8)!;
  near(craft('Nine-Colored Deer', tier5.name, { causality: 40, karma: 0 }).chance, tier5.baseChance);
  near(craft('Nine-Colored Deer', tier5.name, { karma: 72 }).chance, 1);
});
