import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import {
  FACTORY_CANDIDATES,
  TP_CANDIDATES,
  initializeOptimizerData,
  runTradingPostSearch,
} from '../../lib/base/optimizerLogic';
import { runWholeBaseOptimizer } from '../../lib/base/wholeBaseOptimizer';
import {
  initializeRotationExperimentData,
  runRotationExperiment,
  type RoomAssignment,
} from '../../lib/base/baseRotationExperiment';
import { checkBaseRosters, toBaseRosters } from '../../lib/base/baseGroupRosters';
import rosterData from '../../data/base-group-rosters.json';

const releasedOperators = getAllOperators().filter((operator) => !operator.isFuture);
const releasedNames = new Set(releasedOperators.map((operator) => operator.name));
const baseOperators = releasedOperators.map(({ name, rarity, faction, baseSkills }) => ({
  name,
  rarity,
  faction,
  baseSkills,
}));

// The rosters the page reads from its props; this checkout's copy here.
const rosters = toBaseRosters(checkBaseRosters(rosterData));
initializeOptimizerData(baseOperators, rosters);
initializeRotationExperimentData(baseOperators, rosters);

function assertUnique(values: string[], context: string) {
  assert.equal(new Set(values).size, values.length, `${context} double-books an operator`);
}

function assertFiniteRoom(room: RoomAssignment) {
  for (const [label, value] of Object.entries({
    metricValue: room.metricValue,
    restingMetricValue: room.restingMetricValue,
    workWindowHours: room.workWindowHours,
    loginSnappedWorkWindowHours: room.loginSnappedWorkWindowHours,
    cycleLoginSnappedHours: room.cycleLoginSnappedHours,
    longRunDailyRate: room.longRunDailyRate,
    longRunWeeklyRate: room.longRunWeeklyRate,
    longRunMonthlyRate: room.longRunMonthlyRate,
    longRunYearlyRate: room.longRunYearlyRate,
  })) {
    assert(Number.isFinite(value), `${room.label} has a non-finite ${label}`);
    assert(value >= 0, `${room.label} has a negative ${label}`);
  }
}

test('candidate pools come from released operators and offer a disjoint fallback', () => {
  assert(Object.keys(TP_CANDIDATES).length > 20, 'Trading Post candidate pool is unexpectedly small');
  assert(Object.keys(FACTORY_CANDIDATES).length > 20, 'Factory candidate pool is unexpectedly small');

  for (const [facility, candidates] of Object.entries({
    'Trading Post': TP_CANDIDATES,
    Factory: FACTORY_CANDIDATES,
  })) {
    for (const candidate of Object.values(candidates)) {
      assert(releasedNames.has(candidate.operatorName), `${facility} includes unreleased ${candidate.operatorName}`);
      assert(candidate.skills.length > 0, `${facility} candidate ${candidate.operatorName} has no skill`);
    }
  }

  const groups = runTradingPostSearch(500);
  assert(groups.length > 1, 'Trading Post search returned no fallback groups');
  const first = [...groups[0].core, ...groups[0].options[0].fillers];
  assertUnique(first, 'top Trading Post recommendation');
  const used = new Set(first);
  const fallback = groups
    .flatMap((group) => group.options.map((option) => [...group.core, ...option.fillers]))
    .find((combo) => combo.every((operator) => !used.has(operator)));
  assert(fallback, 'removing the top recommendation leaves no fallback');
  assertUnique(fallback, 'fallback Trading Post recommendation');
});

test('whole-base recommendations fill six rooms without double-booking', () => {
  const results = runWholeBaseOptimizer();
  for (const result of [results.balanced, results.total]) {
    assert.equal(result.rooms.length, 6, `${result.strategy} strategy did not fill six production rooms`);
    const assigned = result.rooms.flatMap((room) => room.operators);
    assert(assigned.length > 0, `${result.strategy} strategy has no assignments`);
    assertUnique(assigned, `${result.strategy} whole-base recommendation`);
    for (const room of result.rooms) {
      assert(room.operators.length >= 1 && room.operators.length <= 3, `${room.label} has invalid capacity`);
      assert(Number.isFinite(room.value) && room.value >= 0, `${room.label} has an invalid output`);
      room.operators.forEach((operator) => assert(releasedNames.has(operator), `${room.label} uses unreleased ${operator}`));
    }
  }
});

test('rotation experiment respects each facility level and never double-books', () => {
  const levels = {
    tpLevels: [1, 3] as [number, number],
    factoryGoldLevels: [1, 2] as [number, number],
    factoryExpLevels: [2, 3] as [number, number],
  };
  const result = runRotationExperiment('eliteTwo', levels);
  const productionRooms = [...result.factory, ...result.tradingPost];
  const expectedCapacities = [1, 2, 2, 3, 1, 3];
  productionRooms.forEach((room, index) => {
    assert.equal(room.workingSet.length, expectedCapacities[index], `${room.label} working capacity drifted`);
    assert.equal(room.restingSet.length, expectedCapacities[index], `${room.label} resting capacity drifted`);
  });

  const optionalRooms = [result.receptionRoom, result.office, result.controlCenter].filter(
    (room): room is RoomAssignment => room !== null,
  );
  const allRooms = [...productionRooms, ...result.powerPlant, ...optionalRooms];
  allRooms.forEach(assertFiniteRoom);

  const assigned = [
    ...allRooms.flatMap((room) => [...room.workingSet, ...room.restingSet]),
    ...result.dormitoryPermanentStaff,
  ];
  assertUnique(assigned, 'rotation recommendation');
  assert.equal(result.totalOperatorsUsed, assigned.length, 'reported operator count differs from allocations');
  assigned.forEach((operator) => assert(releasedNames.has(operator), `rotation uses unreleased ${operator}`));
  assert(result.chosenScenario.length > 0, 'rotation did not report its Control Center scenario');
});
