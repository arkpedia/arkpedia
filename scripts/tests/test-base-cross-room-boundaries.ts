import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBase } from '../../lib/base/calculateBase';
import { buildSheetCase, sheetCases } from './helpers/baseCombinationCases';

const scenario = (id: string) => buildSheetCase(sheetCases.find(c => c.id === id)!).input;
const near = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const ling of [12, 12.01]) for (const dusk of [12, 12.01]) {
  test(`complete base Worldly Plight: Ling ${ling}, Dusk ${dusk}, concurrent consumers`, () => {
    const input = scenario('Advanced:24');
    input.importedMorale = { Ling: ling, Dusk: dusk };
    input.assignments.prod1 = [{ operatorName: 'Jieyun', eliteLevel: 'Elite 2' }];
    const result = calculateBase(input);
    // Twenty resting workers + five non-dorm Sui + two extra Office slots.
    const wp = 20 + 25 + 20 + (ling > 12 ? 15 : 0) + (dusk <= 12 ? 15 : 0);
    near(result.resourcePools.worldlyPlight, wp);
    near(result.resourcePools.witchcraftCrystal, Math.floor(wp / 5));
    near(result.rooms.prod1.productivity!.yellow, Math.floor(wp / 5) * 0.02);
    const withoutJieyun = calculateBase({ ...input, assignments: { ...input.assignments, prod1: [] } });
    near(result.rooms.prod5.productivity!.yellow, withoutJieyun.rooms.prod5.productivity!.yellow);
    near(result.resourcePools.perceptionInformation, (ling <= 12 ? 10 : 0) + (dusk > 12 ? 10 : 0));
  });
}

for (const officeLevel of [1, 2, 3]) test(`shared PI conversions: Office ${officeLevel}, different dorm levels`, () => {
  const input = scenario('Advanced:3');
  input.facilities = input.facilities.map(f => f.id === 'office' ? { ...f, level: officeLevel } : f.id === 'dormitory1' ? { ...f, level: 2 } : f.id === 'dormitory2' ? { ...f, level: 4 } : f);
  // Swap Iris into another dorm without changing either dorm's occupancy.
  [input.assignments.dormitory1[2], input.assignments.dormitory2[0]] = [input.assignments.dormitory2[0], input.assignments.dormitory1[2]];
  const result = calculateBase(input);
  const pi = 20 + 20 + 10 + 2 + 4 + 10 * (officeLevel - 1);
  near(result.resourcePools.memoryFragments, 10 * (officeLevel - 1));
  near(result.resourcePools.measure, 2);
  near(result.resourcePools.dreamland, 4);
  near(result.resourcePools.perceptionInformation, pi);
  near(result.resourcePools.chainOfThought, pi);
  near(result.resourcePools.soundlessResonance, pi + 5);
  near(result.rooms.prod1.productivity!.yellow, pi * 0.01);
  near(result.rooms.prod5.productivity!.yellow, Math.floor((pi + 5) / 2) * 0.01);
});

for (const trainer of ['Ela', 'Doc', 'Iana', 'Fuze']) for (const eliteLevel of ['Base', 'Elite 1', 'Elite 2']) {
  test(`complete base ${trainer} ${eliteLevel}: correct R6 subgroup across rooms`, () => {
    const input = scenario('FAC:3');
    const defending = ['Ela', 'Doc', 'Frost', 'Tachanka'];
    const attacking = ['Iana', 'Fuze', 'Blitz', 'Ash'];
    const own = defending.includes(trainer) ? defending : attacking;
    const other = defending.includes(trainer) ? attacking : defending;
    input.assignments = {
      trainingRoom: [{ operatorName: trainer, eliteLevel }],
      dormitory1: own.filter(n => n !== trainer).map(operatorName => ({ operatorName, eliteLevel: 'Base', morale: 0 })),
      controlCenter: other.map(operatorName => ({ operatorName, eliteLevel: 'Base' })),
      prod1: [{ operatorName: 'Amiya', eliteLevel: 'Base' }],
    };
    near(calculateBase(input).rooms.trainingRoom.trainingSpeed!, 1.45);
    input.assignments.dormitory1 = [];
    near(calculateBase(input).rooms.trainingRoom.trainingSpeed!, 1.15);
  });
}

test('complete base awake imported morale reproduces the manual plan; exhausted plant and Office skills stop', () => {
  const input = scenario('FAC:3');
  input.assignments = {
    prod7: [{ operatorName: 'Greyy', eliteLevel: 'Base' }],
    office: [{ operatorName: 'Orchid', eliteLevel: 'Base' }],
  };
  const manual = calculateBase(input);
  const awake = calculateBase({ ...input, importedMorale: { Greyy: 24, Orchid: 24 } });
  near(manual.rooms.prod7.droneRate!, awake.rooms.prod7.droneRate!);
  near(manual.rooms.office.office!.speed, awake.rooms.office.office!.speed);
  const tired = calculateBase({ ...input, importedMorale: { Greyy: 0, Orchid: 0 } });
  near(tired.rooms.prod7.droneRate!, 0);
  near(tired.rooms.office.office!.speed, 0);
});

test('complete base counts no more operators than a room has places', () => {
  const input = scenario('FAC:3');
  const plant = input.facilities.find(f => f.kind === 'powerPlant' && f.capacity === 1)!;
  input.assignments = { [plant.id]: [{ operatorName: 'Greyy', eliteLevel: 'Base' }] };
  const alone = calculateBase(input);
  // A second name in a one-place Power Plant (a downgraded room, a hand-written plan) adds nothing.
  const over = calculateBase({ ...input, assignments: { [plant.id]: [{ operatorName: 'Greyy', eliteLevel: 'Base' }, { operatorName: 'Lancet-2', eliteLevel: 'Base' }] } });
  assert(alone.rooms[plant.id].droneRate! > 0);
  near(over.rooms[plant.id].droneRate!, alone.rooms[plant.id].droneRate!);
});
