import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRotation } from '../../lib/base/calculateRotation';
import { calculateBase } from '../../lib/base/calculateBase';
import { defaultProductionSpots, getFacilities } from '../../lib/base/baseConfig';
import type { SavedBasePreset } from '../../lib/base/baseSavedPresets';
import type { BaseRotationPlan } from '../../lib/base/baseRotationPlan';
import { buildSheetCase, sheetCases } from './helpers/baseCombinationCases';

const input = buildSheetCase(sheetCases[0]).input;
function preset(id: string, worker = 'FEater', resting = 'Spot'): SavedBasePreset {
  return { version: 1, id, name: id, savedAt: '', productionSpots: defaultProductionSpots(), facilityLevels: {},
    assignments: { prod2: [{ operatorName: worker, eliteLevel: 'Elite 2' }], dormitory1: [{ operatorName: resting, eliteLevel: 'Elite 2' }] },
    factoryProducts: { prod2: 'Battle Records' }, dormitoryAmbience: { dormitory1: 5000 },
    clueExchangeActive: false, moraleAbove12: true, swapPolicy: 'onMoraleZero', loginInterval: 24,
    trainingTarget: { class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false },
    workshopSettings: { recipeId: '1', causality: 0, karma: 0, thornsFailures: 0, qualifyingDormOperators: 0 },
  };
}
const near = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plan: BaseRotationPlan = { version: 1, startHour: 8, shifts: [{ id: 'a', presetId: 'A', hours: 6 }, { id: 'b', presetId: 'B', hours: 12 }] };

test('rotation weights complete saved bases by duration, normalizes a non-24h cycle, and uses fresh rates for old presets', () => {
  const a = preset('A'), b = preset('B', 'Spot', 'FEater');
  const rate = (p: SavedBasePreset, hours: number) => calculateBase({ ...input, ...p, facilities: getFacilities(p.productionSpots, p.facilityLevels), loginInterval: hours });
  const result = calculateRotation(input, plan, [a, b], 24);
  assert(result.totals);
  near(result.totals.dailyExpGreen, (rate(a, 6).dailyExpGreen * 6 + rate(b, 12).dailyExpGreen * 12) / 18);
  assert.equal(result.stages.length, 4);
  assert(result.stages.every(s => !s.warnings.some(w => w.includes('rates are missing'))));
  assert(result.stages[1].moraleAfter.FEater === 24);
  assert.equal(result.totals.dailyGoldWorthGreen, 0);
});

test('rotation carries exhaustion into the second cycle instead of refreshing Morale at each saved shift', () => {
  const p = { ...preset('A'), assignments: { prod2: [{ operatorName: 'FEater', eliteLevel: 'Elite 2', morale: 24 }] } };
  const result = calculateRotation(input, { ...plan, shifts: [{ ...plan.shifts[0], hours: 24 }] }, [p], 24);
  assert.equal(result.totals!.dailyExpGreen, 0);
  assert(result.stages[1].warnings.some(w => w.includes('0 Morale after 0.0h')));
  assert.equal(result.stages[1].moraleAfter.FEater, 0);
});

test('rotation recalculates complete cross-room skills and collection windows, preserving the source presets', () => {
  const original = buildSheetCase(sheetCases.find(c => c.id === 'TP:30')!).input;
  const p = { ...preset('A'), assignments: original.assignments, factoryProducts: original.factoryProducts,
    productionSpots: Object.fromEntries(original.facilities.filter(f => f.id.startsWith('prod')).map(f => [f.id, f.kind])) as SavedBasePreset['productionSpots'],
    facilityLevels: Object.fromEntries(original.facilities.map(f => [f.id, f.level])),
  };
  const saved = JSON.stringify(p);
  const result = calculateRotation(input, { ...plan, shifts: [{ ...plan.shifts[0], hours: 2 }] }, [p], 24);
  const direct = calculateBase({ ...input, ...p, facilities: getFacilities(p.productionSpots, p.facilityLevels), loginInterval: 2, swapPolicy: 'onLogin' });
  near(result.totals!.dailyGoldWorthGreen, direct.dailyGoldWorthGreen);
  assert(result.totals!.dailyGoldWorthGreen > 0);
  assert.equal(JSON.stringify(p), saved);
});

test('rotation reports incomplete or incompatible shifts instead of substituting current-base output', () => {
  assert.equal(calculateRotation(input, { ...plan, shifts: [] }, [], 24).totals, null);
  assert.equal(calculateRotation(input, plan, [preset('A')], 24).totals, null);
  const incompatible = { ...preset('B'), facilityLevels: { prod2: 2 } };
  const result = calculateRotation(input, plan, [preset('A'), incompatible], 24);
  assert.equal(result.totals, null);
  assert.match(result.problem!, /same room types and levels/);
});
