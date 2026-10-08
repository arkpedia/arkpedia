import { dormitoryRecoveryRates, type DormRecoveryProvider } from '../../lib/base/dormitoryRecovery';
import { capacityForLevel, canSetSpotKind } from '../../lib/base/baseConfig';
import { CONTROL_CENTER_SPECIAL_SKILLS as cc } from '../../lib/base/controlCenterSpecialSkills';
import { calcDormitoryRecovery, calcTradingPostGoldAndLmdPerHour, calcTradingPostFullTime, tradingPostExpectedMinutes, goldOrderTier } from '../../lib/base/baseProductivity';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { BaseSkill } from '../../lib/operators/operatorTypes';
import { getAllOperators } from '../../lib/operators/operators';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { trainingResult, trainingSkillContribution } from '../../lib/base/trainingRoomSkills';
import { workshopResult } from '../../lib/base/workshopSkills';
import { crossFacilityMoraleRelief } from '../../lib/base/crossFacilityMorale';
import { jayeContribution } from '../../lib/base/jaye';
import { toBaseRosters, checkBaseRosters } from '../../lib/base/baseGroupRosters';
import { TRADING_POST_SPECIAL_SKILLS as tp, type TradingPostContext } from '../../lib/base/tradingPostSpecialSkills';
import { FACTORY_SPECIAL_SKILLS as factory, type FactorySkillContext } from '../../lib/base/factorySpecialSkills';
import { OFFICE_SPECIAL_SKILLS as office, type OfficeContext } from '../../lib/base/officeSpecialSkills';
import { DORMITORY_SPECIAL_SKILLS as dorm } from '../../lib/base/dormitorySpecialSkills';
import { computeResourcePools, type BaseResourceState } from '../../lib/base/baseResources';
import { readSavedBasePresets } from '../../lib/base/baseSavedPresets';
import { defaultProductionSpots, getFacilities } from '../../lib/base/baseConfig';
import fixture from './fixtures/base-skill-source.json';
import rosterData from '../../data/base-group-rosters.json';
import recipes from '../../data/base-workshop-recipes.json';
const ops = new Map(getAllOperators().map(op => [op.name, op]));
const rosters = toBaseRosters(checkBaseRosters(rosterData));
const near = (actual: number | undefined, expected: number) => assert(Math.abs((actual ?? NaN) - expected) < 1e-8, `${actual} != ${expected}`);
const training = (name: string, className = 'Guard', mastery = 1, placed = [name], branch = '') => trainingResult(name, activeBaseSkills(ops.get(name)!, 'Training Room', 'Elite 2'), { target: { class: className, branch, mastery, timeReductionActive: false, instantTrainingReady: false }, allPlacedNames: placed, rosters, worldlyPlight: 0 }, 0);

test('all 429 game operators and 921 source steps match IDs, unlocks, facilities and Global descriptions', () => {
  assert.equal(fixture.operators.length, 429);
  assert.equal(fixture.operators.reduce((s, op) => s + op.steps.length, 0), 921);
  for (const expected of fixture.operators) {
    const op = ops.get(expected.name)!;
    assert(op, expected.name);
    assert.equal(op.internalName, expected.internalName);
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
test('actual TP/RR levels and exact Taraxacum quoted name', () => {
  const ctx = { rosters, tradingPostLevel: 1, receptionRoomLevel: 1, totalDormitoryLevels: 4, allPlacedNames: [], sameRoomOperatorNames: [], facilitiesWithSuiOperator: 3 } as unknown as TradingPostContext;
  for (let level = 1; level <= 3; level++) near(tp['Rose Salt|Time Is Money']({ ...ctx, tradingPostLevel: level }).orderLimit, level);
  const vigil = Object.keys(tp).find(key => key.startsWith('Vigil|') && tp[key](ctx).orderEfficiency === 0.3)!;
  assert(vigil); near(tp[vigil]({ ...ctx, receptionRoomLevel: 3 }).orderEfficiency, 0.4);
  near(tp["Taraxacum|'The Best of Students!'"](ctx).orderEfficiency, 0.12);
});
test('recruitment slots scale with Office level', () => {
  const ctx = { officeLevel: 1, totalDormitoryLevels: 4, resourceBonuses: {} } as OfficeContext;
  for (let level = 1; level <= 3; level++) {
    near(office['Lin|Meritocracy']({ ...ctx, officeLevel: level }).hrSpeed, 0.1 * (level - 1));
    const state = { officeLevel: level, czernyDormitoryLevel: 2, irisDormitoryLevel: 3, dormitoryOperatorCount: 0, virtuosaRoomOperatorCount: 0, totalDormitoryLevels: 0, moraleAbove12: true } as unknown as BaseResourceState;
    const pools = computeResourcePools(state, new Set(['Whisperain|Itinerant', 'Mulberry|Rescue Team - Post-Catastrophe Census', 'Czerny|Adagio', 'Iris|Bedtime Story']));
    near(pools.measure, 2); near(pools.dreamland, 3); near(pools.memoryFragments, 10 * (level - 1)); near(pools.worldlyPlight, 10 * (level - 1));
  }
});
test('spreadsheet regressions use actual room levels and distinguish base-wide from same-room effects', () => {
  const fc = { selectedProduct: 'Precious Metals', totalDormitoryLevels: 5, totalFacilityLevels: 44 } as FactorySkillContext;
  near(factory['Narantuya|Union of Desert Bandits'](fc).productivity, 0.05);
  near(factory['Narantuya|Union of Desert Bandits']({ ...fc, selectedProduct: 'Battle Records' }).productivity, 0);
  near(factory['Minimalist|Machine Assistance α'](fc).productivity, 0.1);
  near(factory['Minimalist|Machine Assistance β'](fc).productivity, 0.25);
  near(factory['Minimalist|Machine Assistance β']({ ...fc, totalFacilityLevels: 80 }).productivity, 0.4);
  const oc = { officeLevel: 1, totalDormitoryLevels: 4 } as OfficeContext;
  near(office['Tin Man|Maylander Detective β'](oc).hrSpeed, 0.13);
  for (let level = 1; level <= 3; level++) for (const key of ['Mr. Nothing|Nosy', "Tsukinogi|Empath's Insight", 'Ukusik|Law of the Streets']) {
    near(office[key]({ ...oc, officeLevel: level }).receptionRoomClueSpeed, 0.05 * (level - 1));
  }
  const tc = { receptionRoomLevel: 0, allPlacedNames: [], sameRoomOperatorNames: ['Bellone'] } as unknown as TradingPostContext;
  for (let level = 0; level <= 3; level++) {
    near(tp['Vigil|New City Trade']({ ...tc, receptionRoomLevel: level }).orderEfficiency, 0.25 + 0.05 * level);
    near(tp['Mitm|Gifted Adviser']({ ...tc, receptionRoomLevel: level }).orderEfficiency, 0.15 + 0.05 * level);
  }
  near(tp['Bellone|Famiglia Business β'](tc).orderEfficiency, 0.3);
  // Game text says Vigil anywhere in the base; the spreadsheet's separate-room 30% omits this.
  const separate = { ...tc, allPlacedNames: ['Bellone', 'Vigil'] };
  near(tp['Bellone|Famiglia Business β'](separate).orderEfficiency, 0.4);
  assert.equal(tp['Bellone|Outstanding Debt'](separate).orderLimit, undefined);
  const together = { ...separate, sameRoomOperatorNames: ['Bellone', 'Vigil'] };
  near(tp['Bellone|Outstanding Debt'](together).orderLimit, 2);
  near(tp['Bellone|Outstanding Debt'](together).selfMorale, -0.1);
});
test('cross-facility morale keeps strongest matching scope, never stacks banners', () => {
  near(crossFacilityMoraleRelief('factory', 0.2, 0.15, true, ['Capable Assistance', 'Chief Engineer']), 0.2);
  near(crossFacilityMoraleRelief('office', 0.1, 0.15, true, ['Capable Assistance', 'Chief Engineer']), 0.2);
  for (const kind of ['trainingRoom', 'workshop', 'dormitory', 'controlCenter'] as const) near(crossFacilityMoraleRelief(kind, 0.2, 0.2, true, ['Chief Engineer']), 0);
});
test('Fiammetta exclusive recovery and Recon target membership', () => {
  near(dorm['Fiammetta|Self-Discipline']({} as never).exclusiveRecovery, 2);
  near(dorm['Rhodes Island Recon|Hunting Helper']({ rosters, targetIfSelected: 'Terra Research Commission' } as never).singleTargetBonus, 1);
  near(dorm['Rhodes Island Recon|Hunting Helper']({ rosters, targetIfSelected: 'Amiya' } as never).singleTargetBonus, 0.55);
});
test('Jaye E0 depends on collection interval and TP level; E1 skills cancel queue dependence and Snowsant feedback', () => {
  const short = jayeContribution(10, 0, 0, false, 1.01, 1, 3), long = jayeContribution(10, 0, 0, false, 1.01, 24, 3);
  near(short.jaye, 0.4); assert(long.jaye < short.jaye && long.jaye > 0);
  assert(jayeContribution(6, 0, 0, false, 1.01, 12, 1).jaye < jayeContribution(10, 0, 0, false, 1.01, 12, 3).jaye);
  near(jayeContribution(10, 0.3, 0.35, true, 1.03, 24, 3).jaye, 0.16);
  near(jayeContribution(10, 0, 0.35, true, 1.02, 24, 3).snowsant, 0);
  near(jayeContribution(10, 0.3, 0.35, true, 1.03, 1, 3).snowsant, 0.3);
});
const craft = (name: string, recipeName: string, extra = {}) => {
  const recipe = recipes.find(r => r.name === recipeName)!; assert(recipe, recipeName);
  return workshopResult(name, activeBaseSkills(ops.get(name)!, 'Workshop', 'Elite 2'), { recipe, qualifyingDormOperators: 0, dormitoryOperatorCount: 20, stainlessInDorm: false, intelligenceReserve: 0, ursusBeverages: 0, causality: 0, karma: 0, thornsFailures: 0, ...extra });
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
  for (const op of ops.values()) for (const recipe of recipes) {
    const result = workshopResult(op.name, activeBaseSkills(op, 'Workshop', 'Elite 2'), { recipe, qualifyingDormOperators: 20, dormitoryOperatorCount: 20, stainlessInDorm: true, intelligenceReserve: 5, ursusBeverages: 4, causality: 0, karma: 0, thornsFailures: 0 });
    assert(Number.isFinite(result.morale) && result.morale >= 0, `${op.name}: ${recipe.name}`);
    assert(result.chance >= 0 && result.chance <= 1);
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
  assert.equal(goldOrderTier([{ operatorName: 'Jacinta', skillName: "An Heiress's Eye" }]), 'lower');
  const a = jayeContribution(1, 0, 0, false, 1.01, 24, 1);
  // A full queue's idle hours must not reduce his productive-hour bonus twice.
  near(a.jaye, 0.04);
});
test('dorm conditional recovery respects full recipients, thresholds and Coldshot herself', () => {
  const ctx = { sameRoomOperatorNames: ['Coldshot', 'Amiya', 'Vendela'], moraleByOperator: { Coldshot: 0, Amiya: 24, Vendela: 18 } } as never;
  const result = dorm['Coldshot|Wet Your Whistles'](ctx).distributedBonus!;
  assert.deepEqual(result.recipients, ['Coldshot', 'Vendela']); near(result.amount, 0.4);
  assert.deepEqual(dorm['Perfumer the Distilled|Pure Breath'](ctx).conditionalGroupBonus, { below: 20, amount: 0.1 });
  assert.deepEqual(dorm['Vendela|Aroma Convalescence β'](ctx).conditionalGroupBonus, { below: 18, amount: 0.1 });
  near(dorm['Bobbing|Conversationalist'](ctx).allOperatorsBonus, 0.22);
  near(cc['Gladiia|Tide Observation']({ abyssalHuntersInNonDormFacilities: 1, abyssalHuntersRestingInDormitories: 3, abyssalHuntersRestingAtFullMorale: 2 } as never).selfMorale, -2);
});

test('dorm recovery groups compete per recipient; Senshi/Morgan and Fiammetta use their actual recipients', () => {
  const p = (name: string, extra: Partial<DormRecoveryProvider> = {}): DormRecoveryProvider => ({ name, selfBonus: 0, allOperatorsBonus: 0, allOthersBonus: 0, singleTargetBonus: 0, targetIfSelected: null, ...extra });
  const rates = dormitoryRecoveryRates([p('Bagpipe', { selfBonus: 0.55, allOthersBonus: 0.1 }), p('Durin', { selfBonus: -0.1, allOperatorsBonus: 0.25 }), p('Muelsyse', { selfBonus: 0.55, allOthersBonus: 0.1 }), p('Fiammetta', { exclusiveRecovery: 2 })], 4, rosters, {}, false);
  near(rates[0].bonus, 0.8); near(rates[1].bonus, 0.15); near(rates[2].bonus, 0.8); near(rates[3].base + rates[3].bonus, 2);
  const party = dormitoryRecoveryRates([p('Senshi', { allOperatorsBonus: 0.15 }), p('Laios'), p('Amiya')], 4, rosters, {}, false);
  near(party[0].bonus, 0.3); near(party[1].bonus, 0.3); near(party[2].bonus, 0.15);
  const glasgow = dormitoryRecoveryRates([p('Siege', { allOperatorsBonus: 0.2 }), p('Morgan'), p('Amiya')], 4, rosters, {}, true);
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
