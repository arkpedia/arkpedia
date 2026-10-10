import type { SavedBasePreset } from './baseSavedPresets';
import { getFacilities } from './baseConfig';
export const BASE_ROTATION_PLAN_KEY = 'baseRotationPlan_v1';
export interface BaseShift { id: string; presetId: string; hours: number }
export interface BaseRotationPlan { version: 1; startHour: number; shifts: BaseShift[] }
export function readRotationPlan(value: unknown): BaseRotationPlan {
  const raw = value as Partial<BaseRotationPlan> | null;
  const ids = new Set<string>();
  return { version: 1, startHour: raw?.version === 1 && Number.isInteger(raw.startHour) && raw.startHour! >= 0 && raw.startHour! < 24 ? raw.startHour! : 8,
    shifts: raw?.version === 1 && Array.isArray(raw.shifts) ? raw.shifts.slice(0, 24).flatMap(s => s && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 100 && !ids.has(s.id) && typeof s.presetId === 'string' && s.presetId.length <= 100 && typeof s.hours === 'number' && Number.isFinite(s.hours) && s.hours >= 0.25 && s.hours <= 48 ? (ids.add(s.id), [{ id: s.id, presetId: s.presetId, hours: s.hours }]) : []) : [] };
}
export interface RotationStage {
  shiftId: string; name: string; start: number; end: number;
  working: string[]; resting: string[]; changed: number;
  warnings: string[]; moraleAfter: Record<string, number>;
}
/** Two cycles, so an apparently safe first pass cannot hide an exhausted return shift.
 * Rates are a captured estimate from each saved setup, not a chronological game engine.
 * Outside the base Morale does not recover. Workshops perform discrete crafts, not shifts. */
export function analyzeRotation(plan: BaseRotationPlan, presets: SavedBasePreset[], initial: Record<string, number> = {}, owned?: ReadonlySet<string>): RotationStage[] {
  const morale: Record<string, number> = { ...initial }, stages: RotationStage[] = [];
  const baseline = presets.find(p => p.id === plan.shifts[0]?.presetId);
  let time = 0, previous: Record<string, string> = {};
  for (let cycle = 0; cycle < 2; cycle++) for (const shift of plan.shifts) {
    const preset = presets.find(p => p.id === shift.presetId), warnings = new Set<string>();
    const working: string[] = [], resting: string[] = [], placed: Record<string, string> = {};
    if (!preset) warnings.add('This saved setup was deleted. Choose another setup.');
    if (preset && baseline && getFacilities(preset.productionSpots, preset.facilityLevels).some(f => { const first = getFacilities(baseline.productionSpots, baseline.facilityLevels).find(room => room.id === f.id); return first?.kind !== f.kind || first?.level !== f.level; })) warnings.add('This shift changes room types or levels. Use the same layout for a staffing rotation.');
    if (preset) for (const f of getFacilities(preset.productionSpots, preset.facilityLevels)) for (const s of preset.assignments[f.id] ?? []) {
      if (!s) continue;
      const name = s.operatorName;
      if (placed[name]) { warnings.add(`${name} is assigned twice.`); continue; }
      placed[name] = f.id;
      if (owned && !owned.has(name)) warnings.add(`${name} is not in the imported roster.`);
      (f.kind === 'dormitory' ? resting : working).push(name);
      if (morale[name] === undefined) morale[name] = s.morale ?? 24;
      if (f.kind === 'workshop') continue;
      const rate = preset.rotationRates?.[name];
      if (rate === undefined) { warnings.add('Morale rates are missing. Load and update this saved setup.'); continue; }
      if (rate > 0 && morale[name] < rate * shift.hours - 0.0001) warnings.add(`${name} reaches 0 Morale after ${(morale[name] / rate).toFixed(1)}h.`);
      morale[name] = Math.min(24, Math.max(0, morale[name] - rate * shift.hours));
    }
    const changed = Object.keys({ ...previous, ...placed }).filter(name => previous[name] !== placed[name]).length;
    stages.push({ shiftId: shift.id, name: preset?.name ?? 'Missing setup', start: time, end: time + shift.hours, working, resting, changed, warnings: [...warnings], moraleAfter: { ...morale } });
    previous = placed; time += shift.hours;
  }
  return stages;
}
export function rotationClock(startHour: number, elapsed: number): string {
  const minutes = Math.round((startHour + elapsed) * 60), days = Math.floor(minutes / 1440);
  return `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}${days ? ` (+${days}d)` : ''}`;
}
