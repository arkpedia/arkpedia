import test from 'node:test';
import assert from 'node:assert/strict';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { baseSnapshotFromGame, parseBaseSnapshot, GAME_BASE_SLOTS } from '../../lib/account/baseSnapshot';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { analyzeRotation, readRotationPlan, rotationClock } from '../../lib/base/baseRotationPlan';
import { defaultProductionSpots } from '../../lib/base/baseConfig';
import { basePresetConfiguration, readSavedBasePresets, type SavedBasePreset } from '../../lib/base/baseSavedPresets';
import type { GameAccountMap } from '../../lib/planner/gameAccount';
import type { BaseOperator } from '../../lib/operators/operatorTypes';

const map: GameAccountMap = { version: 1, chars: {
  char_silverash: { name: 'SilverAsh', modules: {} },
  char_lancet: { name: 'Lancet-2', modules: {} },
  char_amiya: { name: 'Amiya', modules: {} },
  char_amiya_guard: { name: 'Amiya (Guard)', formOf: 'char_amiya', modules: {} },
} };
const user = () => ({ troop: { chars: {
  '1': { charId: 'char_silverash', evolvePhase: 2, level: 40 },
  '2': { charId: 'char_lancet', evolvePhase: 0, level: 20 },
  '3': { charId: 'char_amiya_guard', evolvePhase: 2, level: 60 },
  '4': { charId: 'new_unknown', evolvePhase: 0, level: 1 },
} }, building: {
  roomSlots: {
    slot_24: { roomId: 'TRADING', level: 2, charInstIds: [1, -1] },
    slot_25: { roomId: 'MANUFACTURE', level: 3, charInstIds: [-1, -1, -1] },
    slot_5: { roomId: 'POWER', level: 1, charInstIds: [2] },
    slot_28: { roomId: 'DORMITORY', level: 4, charInstIds: [3, 4, -1, -1, -1] },
  },
  rooms: { MANUFACTURE: { slot_25: { formulaId: '4' } }, DORMITORY: { slot_28: { comfort: 3100 } } },
  chars: { '1': { ap: 12.5 * 360000 }, '2': { ap: 4 * 360000 }, '3': { ap: 0 } },
} });

test('account import keeps actual floor positions, staffing, levels, Morale and products', () => {
  const snapshot = baseSnapshotFromGame(user(), map)!;
  assert.equal(GAME_BASE_SLOTS.slot_24, 'prod1'); assert.equal(GAME_BASE_SLOTS.slot_5, 'prod7');
  assert.equal(snapshot.facilityLevels.prod1, 2); assert.equal(snapshot.facilityLevels.controlCenter, 0);
  assert.equal(snapshot.productionSpots.prod1, 'tradingPost'); assert.equal(snapshot.productionSpots.prod7, 'powerPlant');
  assert.deepEqual(snapshot.assignments.prod1, [{ operatorName: 'SilverAsh', eliteLevel: 'Elite 2', level: 40, morale: 12.5 }, null]);
  assert.equal(snapshot.assignments.dormitory1[0]?.operatorName, 'Amiya');
  assert.equal(snapshot.assignments.dormitory1[1], null); assert(snapshot.warnings.some(w => w.includes('not in the catalogue')));
  assert.equal(snapshot.factoryProducts.prod2, 'Precious Metals'); assert.equal(snapshot.dormitoryAmbience.dormitory1, 3100);
  assert.equal(snapshot.operatorProgress?.['Lancet-2'].level, 20);
  assert.equal(snapshot.operatorProgress?.Amiya.eliteLevel, 'Elite 2');
  assert.equal(snapshot.morale.Amiya, 0); assert.equal(snapshot.morale['Lancet-2'], 4);
  const record = accountFromGame(user(), map, 'en', new Date('2026-10-09T00:00:00Z'));
  record.operatorBuilds = { SilverAsh: { elite: 2, level: 40, skillLevel: 7, masteries: { 3: 3 } } };
  const restored = parseAccount(JSON.stringify(record));
  assert.deepEqual(restored?.base, parseBaseSnapshot(snapshot));
  assert.equal(restored?.operatorBuilds?.SilverAsh.level, 40);
  assert.equal(restored?.operatorBuilds?.SilverAsh.masteries[3], 3);
  assert.equal(baseSnapshotFromGame({ troop: user().troop }, map), undefined);
});

test('malformed account base fields are omitted or reported without inventing full Morale or room levels', () => {
  const raw = user();
  raw.building.roomSlots.slot_24.level = NaN;
  raw.building.chars['1'].ap = -100;
  raw.building.rooms.DORMITORY.slot_28.comfort = NaN;
  const snapshot = baseSnapshotFromGame(raw, map)!;
  assert.equal(snapshot.facilityLevels.prod1, 0);
  assert.equal(snapshot.morale.SilverAsh, undefined); assert.equal(snapshot.dormitoryAmbience.dormitory1, 0);
  assert(snapshot.warnings.some(w => w.includes('level unavailable')));
  assert.equal(parseBaseSnapshot({ ...snapshot, facilityLevels: { ...snapshot.facilityLevels, prod1: 99 } }), undefined);
  assert.equal(parseBaseSnapshot({ ...snapshot, assignments: { prod1: 'broken' } }), undefined);
  assert.equal(parseBaseSnapshot(null), undefined);
  assert.equal(parseBaseSnapshot({ version: 1 }), undefined);
  assert.deepEqual(parseBaseSnapshot({ ...snapshot, operatorProgress: { Fake: { eliteLevel: 'Elite 4', level: Infinity } } })?.operatorProgress, {});
});

test('imported operator level gates within-tier upgrades without locking earlier promotion skills', () => {
  const op = { name: 'Low level test', baseSkills: [
    { name: 'Early', facility: 'Factory', slot: 0, phase: 0, level: 1 },
    { name: 'Late E0', facility: 'Factory', slot: 0, phase: 0, level: 30 },
    { name: 'E1 upgrade', facility: 'Trading Post', slot: 0, phase: 1, level: 40 },
  ] } as unknown as BaseOperator;
  assert.deepEqual(activeBaseSkills(op, 'Factory', 'Base', {}, 20).map(s => s.name), ['Early']);
  assert.deepEqual(activeBaseSkills(op, 'Factory', 'Base', {}, 30).map(s => s.name), ['Late E0']);
  assert.deepEqual(activeBaseSkills(op, 'Factory', 'Elite 1', {}, 1).map(s => s.name), ['Late E0']);
  assert.deepEqual(activeBaseSkills(op, 'Trading Post', 'Elite 1', {}, 40).map(s => s.name), ['E1 upgrade']);
  assert.deepEqual(activeBaseSkills(op, 'Factory', 'Elite 1', {}, 40), []);
});

const preset = (id: string, room: string, rate: number): SavedBasePreset => ({ version: 1, id, name: id, savedAt: '2026-10-09T00:00:00Z', productionSpots: defaultProductionSpots(), facilityLevels: {}, assignments: { [room]: [{ operatorName: 'SilverAsh', eliteLevel: 'Elite 2' }] }, factoryProducts: {}, dormitoryAmbience: {}, clueExchangeActive: false, moraleAbove12: true, swapPolicy: 'onLogin', loginInterval: 12, trainingTarget: { class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false }, workshopSettings: { recipeId: '1', causality: 0, karma: 0, thornsFailures: 0, qualifyingDormOperators: 0 }, rotationRates: { SilverAsh: rate } });
test('rotation detects exhaustion on a return shift, permits dorm recovery and never recovers off-base', () => {
  const work = preset('Work', 'prod1', 1), rest = preset('Rest', 'dormitory1', -1), idle = { ...preset('Idle', 'prod1', 0), assignments: {} };
  const plan = readRotationPlan({ version: 1, startHour: 8, shifts: [{ id: 'a', presetId: 'Work', hours: 16 }, { id: 'b', presetId: 'Rest', hours: 4 }] });
  const stages = analyzeRotation(plan, [work, rest]);
  assert.deepEqual(stages[0].warnings, []); assert.equal(stages[1].moraleAfter.SilverAsh, 12);
  assert(stages[2].warnings.some(w => w.includes('after 12.0h')));
  const noRecovery = analyzeRotation({ ...plan, shifts: [plan.shifts[0], { ...plan.shifts[1], presetId: 'Idle' }] }, [work, idle]);
  assert.equal(noRecovery[1].moraleAfter.SilverAsh, 8);
  assert.equal(analyzeRotation(plan, [work, rest], { SilverAsh: 6 })[0].moraleAfter.SilverAsh, 0);
  assert.equal(rotationClock(8, 20), '04:00 (+1d)');
});
test('rotation safely handles deleted setups, old presets and unowned operators', () => {
  const work = preset('Work', 'prod1', 1), old = { ...work, rotationRates: undefined };
  const plan = readRotationPlan({ version: 1, startHour: 8, shifts: [{ id: 'a', presetId: 'Work', hours: 12 }] });
  assert(analyzeRotation(plan, [old], {}, new Set())[0].warnings.some(w => w.includes('not in the imported roster')));
  assert(analyzeRotation(plan, [old])[0].warnings.some(w => w.includes('rates are missing')));
  assert(analyzeRotation(plan, [])[0].warnings.some(w => w.includes('deleted')));
  assert.deepEqual(readRotationPlan({ version: 1, startHour: Infinity, shifts: [{ id: 'a', presetId: 'Work', hours: NaN }] }), { version: 1, startHour: 8, shifts: [] });
  assert.deepEqual(readSavedBasePresets([{ ...work, rotationRates: { SilverAsh: Infinity, Fake: 2 }, assignments: { prod1: [{ operatorName: 'SilverAsh', eliteLevel: 'Elite 2', level: 40 }] } }], new Set(['SilverAsh']))[0].rotationRates, {});
});


test('rotation rejects duplicate shift IDs and warns about changing buildings mid-rotation', () => {
  const parsed = readRotationPlan({ version: 1, startHour: 8, shifts: [{ id: 'a', presetId: 'Work', hours: 12 }, { id: 'a', presetId: 'Rest', hours: 12 }] });
  assert.equal(parsed.shifts.length, 1);
  const work = preset('Work', 'prod1', 1), rest = { ...preset('Rest', 'dormitory1', -1), facilityLevels: { prod1: 2 } };
  const stages = analyzeRotation({ ...parsed, shifts: [...parsed.shifts, { id: 'b', presetId: 'Rest', hours: 12 }] }, [work, rest]);
  assert(stages[1].warnings.some(w => w.includes('same layout')));
  assert.equal(readSavedBasePresets([{ ...work, rotationRates: 'bad' }], new Set(['SilverAsh']))[0].rotationRates, undefined);
});


test('preset dirty comparison ignores metadata and key order but retains all editable settings and slot order', () => {
  const original = preset('Work', 'prod1', 1);
  const same = { ...original, id: 'Copy', name: 'Other name', savedAt: 'later', rotationRates: { SilverAsh: 5 }, assignments: { prod1: [{ eliteLevel: 'Elite 2', operatorName: 'SilverAsh' }] } };
  assert.equal(basePresetConfiguration(original), basePresetConfiguration(same));
  for (const changed of [{ ...original, loginInterval: 24 }, { ...original, workshopSettings: { ...original.workshopSettings, karma: 3 } }, { ...original, trainingTarget: { ...original.trainingTarget, mastery: 2 } }, { ...original, assignments: { prod1: [null, ...original.assignments.prod1] } }, { ...original, dormitoryAmbience: { dormitory1: 4000 } }, { ...original, moraleAbove12: false }, { ...original, factoryProducts: { prod2: 'Precious Metals' } }]) {
    assert.notEqual(basePresetConfiguration(original), basePresetConfiguration(changed as SavedBasePreset));
  }
});
