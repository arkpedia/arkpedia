import type { BaseAssignments, ProductionSpots, FacilityLevels, FactoryProducts, DormitoryAmbience } from './baseTypes';
import type { TrainingTarget } from './trainingRoom';
import type { WorkshopSettings } from './workshop';
import { getFacilities, PRODUCTION_SPOT_IDS, PRODUCTION_KINDS, MAX_LEVEL_BY_KIND, MAX_PRODUCTION_BY_KIND } from './baseConfig';
export interface SavedBasePreset {
  id: string; name: string; savedAt: string; version: 1;
  productionSpots: ProductionSpots; facilityLevels: FacilityLevels; assignments: BaseAssignments;
  factoryProducts: FactoryProducts; dormitoryAmbience: DormitoryAmbience;
  clueExchangeActive: boolean; moraleAbove12: boolean; swapPolicy: 'onLogin' | 'onMoraleZero';
  loginInterval: number; trainingTarget: TrainingTarget; workshopSettings: WorkshopSettings;
  /** Net Morale/h at save time: positive drains, negative recovers. A planning estimate. */
  rotationRates?: Record<string, number>;
}
export const SAVED_BASE_PRESETS_KEY = 'baseSavedPresets_v1';
/** Local storage is untrusted. Restore only valid operators, once, within room capacities. */
export function readSavedBasePresets(value: unknown, operatorNames: ReadonlySet<string>): SavedBasePreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || raw.version !== 1 || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name.trim()) return [];
    if (!PRODUCTION_SPOT_IDS.every(id => PRODUCTION_KINDS.includes(raw.productionSpots?.[id]))) return [];
    if (PRODUCTION_KINDS.some(kind => PRODUCTION_SPOT_IDS.filter(id => raw.productionSpots[id] === kind).length > MAX_PRODUCTION_BY_KIND[kind])) return [];
    const facilities = getFacilities(raw.productionSpots, {});
    const facilityLevels: FacilityLevels = Object.fromEntries(facilities.map(f => [f.id, Math.min(MAX_LEVEL_BY_KIND[f.kind], Math.max(0, Math.floor(Number(raw.facilityLevels?.[f.id] ?? f.level))))]));
    if (Object.values(facilityLevels).some(v => !Number.isFinite(v))) return [];
    const seen = new Set<string>();
    const assignments: BaseAssignments = Object.fromEntries(getFacilities(raw.productionSpots, facilityLevels).map(f => [f.id, Array.from({ length: f.capacity }, (_, i) => {
      const slot = raw.assignments?.[f.id]?.[i];
      if (!slot || !operatorNames.has(slot.operatorName) || seen.has(slot.operatorName)) return null;
      seen.add(slot.operatorName);
      return { ...(typeof slot.level === 'number' && Number.isInteger(slot.level) && slot.level >= 1 && slot.level <= 90 ? { level: slot.level } : {}), operatorName: slot.operatorName, eliteLevel: ['Base', 'Elite 1', 'Elite 2', 'Level 30'].includes(slot.eliteLevel) ? slot.eliteLevel : 'Base', ...(Number.isFinite(slot.morale) ? { morale: Math.min(24, Math.max(0, slot.morale)) } : {}), ...(Number.isFinite(slot.manualValue) ? { manualValue: Math.max(0, slot.manualValue) } : {}) };
    })]));
    const trainingTarget: TrainingTarget = { operatorName: operatorNames.has(raw.trainingTarget?.operatorName) && !seen.has(raw.trainingTarget.operatorName) ? raw.trainingTarget.operatorName : '', class: typeof raw.trainingTarget?.class === 'string' ? raw.trainingTarget.class : 'Guard', branch: typeof raw.trainingTarget?.branch === 'string' ? raw.trainingTarget.branch : '', mastery: Math.min(3, Math.max(1, Math.floor(Number(raw.trainingTarget?.mastery)) || 1)), timeReductionActive: raw.trainingTarget?.timeReductionActive === true, instantTrainingReady: raw.trainingTarget?.instantTrainingReady === true };
    const workshopSettings: WorkshopSettings = { overrideDormCount: raw.workshopSettings?.overrideDormCount === true, recipeId: String(raw.workshopSettings?.recipeId ?? '1'), qualifyingDormOperators: Math.min(20, Math.max(0, Number(raw.workshopSettings?.qualifyingDormOperators) || 0)), causality: Math.min(40, Math.max(0, Number(raw.workshopSettings?.causality) || 0)), karma: Math.min(80, Math.max(0, Number(raw.workshopSettings?.karma) || 0)), thornsFailures: Math.max(0, Number.isFinite(raw.workshopSettings?.thornsFailures) ? Math.floor(raw.workshopSettings.thornsFailures) : 0) };
    const rotationRates = raw.rotationRates && typeof raw.rotationRates === 'object' ? Object.fromEntries(Object.entries(raw.rotationRates).filter(([name, rate]) => operatorNames.has(name) && typeof rate === 'number' && Number.isFinite(rate) && Math.abs(rate) <= 100)) : undefined;
    return [{ ...raw, name: raw.name.trim().slice(0, 80), facilityLevels, assignments, rotationRates, loginInterval: Number.isFinite(raw.loginInterval) ? Math.min(168, Math.max(1, raw.loginInterval)) : 24, factoryProducts: Object.fromEntries(Object.entries(raw.factoryProducts ?? {}).filter(([id, v]) => facilities.some(f => f.id === id) && ['Battle Records', 'Precious Metals', 'Originium Shards'].includes(v as string))), dormitoryAmbience: Object.fromEntries(Object.entries(raw.dormitoryAmbience ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0)), clueExchangeActive: raw.clueExchangeActive === true, moraleAbove12: raw.moraleAbove12 !== false, swapPolicy: raw.swapPolicy === 'onLogin' ? 'onLogin' : 'onMoraleZero', trainingTarget, workshopSettings } as SavedBasePreset];
  });
}

/** Ignore saved metadata and estimated rates; object insertion order is not an edit.
 * Array order stays significant because Dormitory targeting follows slot order. */
export function basePresetConfiguration(preset: SavedBasePreset): string {
  const { id: _id, name: _name, savedAt: _savedAt, version: _version, rotationRates: _rates, ...configuration } = preset;
  return JSON.stringify(configuration, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}
