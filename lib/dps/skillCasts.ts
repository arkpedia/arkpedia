export interface Cast { start: number; end: number }
export interface Cycle { cost: number; initial: number; limit?: number }
export type DamageRecovery = Cycle & {
  kind: 'time' | 'attack' | 'hit';
  automatic: boolean;
  nextAttack?: boolean;
};

export const framesPerSecond = 30;
export const frame = (time: number) => Math.round(time * framesPerSecond);

// The clock uses 1 SP/s outside the active window. The caller chooses whether
// the first cast can be delayed and whether a later cast becomes permanent.
export function planCasts(start: number, duration: number | null, end: number, cycle?: Cycle, permanentAfterFirst = false) {
  const casts: Cast[] = [];
  let ready = frame(cycle ? Math.max(start, cycle.cost - cycle.initial, 0) : start);
  while (ready <= end && casts.length < (cycle?.limit ?? Infinity)) {
    const stop = duration === null || permanentAfterFirst && casts.length > 0 ? Infinity : ready + frame(duration);
    casts.push({ start: ready, end: stop });
    if (!cycle || stop === Infinity) break;
    ready = stop + Math.max(1, frame(cycle.cost));
  }
  return casts;
}

// One SP per eligible event. Cadences are aligned to deployment, with the
// first action after one interval. The caller skips inactive encounter phases.
export function eventCastClock(
  recovery: DamageRecovery, earliest: number, duration: number, attackInterval: number, hitInterval: number,
) {
  const casts: Cast[] = [];
  const attackPeriod = frame(attackInterval);
  const chargePeriod = recovery.kind === 'attack' ? attackPeriod : hitInterval > 0 ? Math.max(1, frame(hitInterval)) : 0;
  const firstCast = recovery.automatic ? 0 : frame(earliest);
  let sp = Math.min(recovery.initial, recovery.cost);
  let cursor = 0;
  let activeUntil = 0;
  const onCadence = (at: number, period: number) =>
    period > 0 ? Math.max(1, Math.ceil(at / period)) * period : Infinity;

  function next(time: number) {
    if (casts.length >= (recovery.limit ?? Infinity)) return Infinity;
    const at = Math.max(Math.ceil(time * framesPerSecond - 1e-8), cursor, activeUntil);
    if (sp < recovery.cost) return onCadence(at, chargePeriod) / framesPerSecond;
    return (recovery.nextAttack ? onCadence(Math.max(at, firstCast), attackPeriod) : Math.max(at, firstCast))
      / framesPerSecond;
  }

  function advance(time: number) {
    const tick = frame(time);
    const charged = sp >= recovery.cost;
    if (!charged) sp++;
    cursor = tick + 1;
    // A charged strike replaces the next attack, never the attack that charged it.
    if (sp < recovery.cost || tick < firstCast || (recovery.nextAttack && !charged)) return;
    activeUntil = tick + frame(duration);
    casts.push({ start: time, end: activeUntil / framesPerSecond });
    sp = 0;
  }
  return { casts, next, advance };
}
