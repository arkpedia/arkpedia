export const rotationSlots = ['header', 'mobile-menu'] as const;
export type RotationSlot = typeof rotationSlots[number];
export const rotationLabels = { header: 'Page banner', 'mobile-menu': 'Mobile menu' };
export const defaultTurnSeconds = 8;
export const maxTurnSeconds = 3600;

export interface RotationTurn { id: string; seconds: number; enabled: boolean }
export interface RotationPlan { revision: number; turns: RotationTurn[] }
export type RotationPlans = Partial<Record<RotationSlot, RotationPlan>>;

export function isRotationSlot(slot: unknown): slot is RotationSlot {
  return slot === 'header' || slot === 'mobile-menu';
}

export function validTurns(value: unknown): value is RotationTurn[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  const ids = new Set<string>();
  return value.every(turn => {
    if (!turn || typeof turn.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(turn.id) || ids.has(turn.id)
      || !Number.isInteger(turn.seconds) || turn.seconds < 1 || turn.seconds > maxTurnSeconds || typeof turn.enabled !== 'boolean') return false;
    ids.add(turn.id);
    return true;
  });
}

/** Keep existing preferences, then include newly eligible campaigns in their published order. */
export function rotationTurns(ids: string[], saved: RotationTurn[]): RotationTurn[] {
  const remaining = new Set(ids);
  return [...saved.filter(turn => remaining.delete(turn.id)),
    ...Array.from(remaining, id => ({ id, seconds: defaultTurnSeconds, enabled: true }))];
}

/** Only send settings for records already present in the public table. */
export function publicRotations(campaigns: { id: string }[], plans: RotationPlans) {
  const ids = new Set(campaigns.map(c => c.id));
  return Object.fromEntries(rotationSlots.flatMap(slot => plans[slot]
    ? [[slot, plans[slot].turns.filter(turn => ids.has(turn.id))]] : [])) as Partial<Record<RotationSlot, RotationTurn[]>>;
}
