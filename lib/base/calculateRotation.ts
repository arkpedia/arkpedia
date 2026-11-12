import type { BaseCalculationInput, calculateBase } from './calculateBase';
import { getFacilities } from './baseConfig';
import { analyzeRotation, type BaseRotationPlan } from './baseRotationPlan';
import type { SavedBasePreset } from './baseSavedPresets';
import { simulateBase } from './baseSimulation';
import { sustainableOutput } from './baseOptimizer';

const TOTAL_KEYS = [
  'dailyExpGreen', 'dailyExpRed', 'dailyGoldMadeGreen', 'dailyGoldMadeRed',
  'dailyGoldSoldGreen', 'dailyGoldSoldRed', 'dailyGoldFromProvisoGreen', 'dailyGoldFromProvisoRed',
  'dailyExtraLmdFromOrdersGreen', 'dailyExtraLmdFromOrdersRed', 'dailyGoldWorthGreen', 'dailyGoldWorthRed',
] as const;
export type BaseProductionTotals = Pick<ReturnType<typeof calculateBase>, typeof TOTAL_KEYS[number]>;

/** Same repeating chronological model and gold funding as the account optimizer.
 * Saved shift settings are recalculated; no cached recommendation totals are trusted. */
export function calculateRotation(input: Pick<BaseCalculationInput, 'operators' | 'rosters' | 'skillSlots' | 'workshopRecipes'>,
  plan: BaseRotationPlan, presets: SavedBasePreset[], loginInterval: number,
  initialMorale: Record<string, number> = {}, owned?: ReadonlySet<string>) {
  const duration = plan.shifts.reduce((n, s) => n + s.hours, 0);
  const saved = plan.shifts.map(s => presets.find(p => p.id === s.presetId));
  const diagnosticStages = analyzeRotation(plan, presets, initialMorale, owned);
  const incompatible = diagnosticStages.some(s => s.warnings.some(w => w.includes('same layout')));
  const problem = !duration ? 'Add saved shifts in Rotation to calculate their output.' : saved.some(p => !p) ? 'Choose an existing preset for every rotation shift.' : incompatible ? 'Use the same room types and levels in every rotation shift.' : null;
  if (problem) return { totals: null, stages: diagnosticStages, problem };
  const first = saved[0]!;
  const facilities = getFacilities(first.productionSpots, first.facilityLevels);
  const simulation = simulateBase({
    base: { ...input, facilities }, loginInterval, initialMorale: { ...initialMorale, ...plan.parked }, refillPolicy: plan.refillPolicy,
    // A rotation saved from the optimizer counts drones (and their gold funding) exactly as the optimizer did.
    ...(plan.drones ? { drones: true, droneWeights: plan.drones, droneFunding: { externalGold: plan.externalGold ?? 0 } } : {}),
    shifts: saved.map((p, i) => ({ assignments: p!.assignments, factoryProducts: p!.factoryProducts, hours: plan.shifts[i].hours,
      ...(plan.shifts[i].refill ? { refill: plan.shifts[i].refill } : {}), ...(plan.shifts[i].reseat ? { reseat: plan.shifts[i].reseat } : {}),
      settings: { dormitoryAmbience: p!.dormitoryAmbience, clueExchangeActive: p!.clueExchangeActive, moraleAbove12: p!.moraleAbove12, trainingTarget: p!.trainingTarget, workshopSettings: p!.workshopSettings } })),
  });
  const output = sustainableOutput(simulation.perDay, plan.externalGold ?? 0);
  const totals = Object.fromEntries(TOTAL_KEYS.map(key => [key, 0])) as BaseProductionTotals;
  totals.dailyExpGreen = totals.dailyExpRed = output.exp;
  totals.dailyGoldMadeGreen = totals.dailyGoldMadeRed = output.goldMade;
  totals.dailyGoldSoldGreen = totals.dailyGoldSoldRed = output.goldSold;
  totals.dailyGoldWorthGreen = totals.dailyGoldWorthRed = output.lmd;
  const stages = diagnosticStages.slice(0, plan.shifts.length).map(stage => ({ ...stage,
    warnings: [...stage.warnings.filter(w => !w.includes('rates are missing') && !w.includes('0 Morale after')),
      ...simulation.events.filter(e => e.kind === 'exhausted' && e.time >= stage.start && e.time < stage.end).map(e => e.detail)],
    moraleAfter: Object.fromEntries(Object.entries(simulation.moraleTrace).map(([name, trace]) => [name, [...trace].reverse().find(p => p.time <= stage.end + 1e-8)?.morale ?? 24])),
  }));
  return { totals, stages, problem: null, warnings: simulation.warnings, simulation };
}
