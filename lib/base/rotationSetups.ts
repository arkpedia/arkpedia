import type { SimulationShift } from './baseSimulation';

/** The most distinct staffing setups a rotation may use: the game stores three base presets, so a plan that
 * needs more cannot be set up as one-tap presets in the base. Shifts that place everyone the same way share a
 * preset, so a rotation may have more shifts than this (a duty of A, A, A, B needs two). Every shape, the
 * genome, the annealing moves, the staffing completion and the account search read this one bound. */
export const MAX_ROTATION_SETUPS = 3;

/** What a saved base preset holds of a shift: who sits where (rooms with nobody in them do not count), the
 * factory products and the room settings. Fiammetta's refills, reseats and the shift's length are actions at
 * the login, not part of the preset, so two shifts that differ only there share one. */
export function setupKey(shift: SimulationShift): string {
  const rooms = Object.keys(shift.assignments).sort().flatMap(room => {
    const slots = (shift.assignments[room] ?? []).map(x => x ? `${x.operatorName}/${x.eliteLevel}/${x.level ?? ''}/${x.manualValue ?? ''}` : '');
    return slots.some(Boolean) ? [[room, slots]] : [];
  });
  return JSON.stringify([rooms, Object.entries(shift.factoryProducts ?? {}).sort(), shift.settings ?? null]);
}

/** The shifts grouped by setup, each group in order of first appearance: one saved preset per group. */
export function setupGroups(shifts: readonly SimulationShift[]): number[][] {
  const groups = new Map<string, number[]>();
  shifts.forEach((shift, index) => {
    const key = setupKey(shift);
    const group = groups.get(key);
    if (group) group.push(index); else groups.set(key, [index]);
  });
  return [...groups.values()];
}

export const distinctSetups = (shifts: readonly SimulationShift[]): number => setupGroups(shifts).length;
/** Whether a rotation needs more presets than the game stores. */
export const exceedsSetups = (shifts: readonly SimulationShift[]): boolean => distinctSetups(shifts) > MAX_ROTATION_SETUPS;
/** The letter a setup goes by on the page: A, B, C. */
export const setupLabel = (index: number): string => String.fromCharCode(65 + index);
