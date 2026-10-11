import { calculateBase, type BaseCalculationInput } from './calculateBase';
import { getFacilities } from './baseConfig';
import { analyzeRotation, type BaseRotationPlan } from './baseRotationPlan';
import type { SavedBasePreset } from './baseSavedPresets';

const TOTAL_KEYS = [
  'dailyExpGreen', 'dailyExpRed', 'dailyGoldMadeGreen', 'dailyGoldMadeRed',
  'dailyGoldSoldGreen', 'dailyGoldSoldRed', 'dailyGoldFromProvisoGreen', 'dailyGoldFromProvisoRed',
  'dailyExtraLmdFromOrdersGreen', 'dailyExtraLmdFromOrdersRed', 'dailyGoldWorthGreen', 'dailyGoldWorthRed',
] as const;
export type BaseProductionTotals = Pick<ReturnType<typeof calculateBase>, typeof TOTAL_KEYS[number]>;

/** Recalculate every complete saved base, carrying Morale through two cycles.
 * Show the second cycle as a daily average, so the first shift's full Morale
 * cannot hide an exhausted return. Collection also happens at shift changes.
 * Uses the room calculator's conservative first-exhaustion cutoff; thresholds
 * within a shift and one-off skills are not a chronological game simulation. */
export function calculateRotation(input: Pick<BaseCalculationInput, 'operators' | 'rosters' | 'skillSlots' | 'workshopRecipes'>,
  plan: BaseRotationPlan, presets: SavedBasePreset[], loginInterval: number,
  initialMorale: Record<string, number> = {}, owned?: ReadonlySet<string>) {
  const duration = plan.shifts.reduce((n, s) => n + s.hours, 0);
  const totals = Object.fromEntries(TOTAL_KEYS.map(key => [key, 0])) as BaseProductionTotals;
  const missing = plan.shifts.some(s => !presets.some(p => p.id === s.presetId));
  let index = 0;
  const stages = analyzeRotation(plan, presets, initialMorale, owned, (preset, morale, hours) => {
    const facilities = getFacilities(preset.productionSpots, preset.facilityLevels);
    const result = calculateBase({ ...input, facilities, assignments: preset.assignments,
      factoryProducts: preset.factoryProducts, dormitoryAmbience: preset.dormitoryAmbience,
      clueExchangeActive: preset.clueExchangeActive, moraleAbove12: preset.moraleAbove12,
      trainingTarget: preset.trainingTarget, workshopSettings: preset.workshopSettings,
      swapPolicy: 'onLogin', loginInterval: Math.min(loginInterval, hours), importedMorale: morale,
    });
    if (index >= plan.shifts.length) for (const key of TOTAL_KEYS) totals[key] += result[key] * hours / duration;
    index++;
    const rates: Record<string, number> = {};
    for (const f of facilities) for (const slot of preset.assignments[f.id] ?? []) if (slot) {
      const recovery = result.dormitoryRecoveryByFacility[f.id]?.find(r => r.name === slot.operatorName);
      if (recovery) rates[slot.operatorName] = -(recovery.base + recovery.bonus);
      else if (f.kind !== 'workshop') rates[slot.operatorName] = result.rooms[f.id].perOperatorMorale?.[slot.operatorName] ?? result.rooms[f.id].combinedMoraleRate;
    }
    return rates;
  });
  const incompatible = stages.some(s => s.warnings.some(w => w.includes('same layout')));
  return { totals: duration > 0 && !missing && !incompatible ? totals : null, stages,
    problem: !duration ? 'Add saved shifts in Rotation to calculate their output.' : missing ? 'Choose an existing preset for every rotation shift.' : incompatible ? 'Use the same room types and levels in every rotation shift.' : null };
}
