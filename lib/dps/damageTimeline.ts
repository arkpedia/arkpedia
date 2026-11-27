import { calculate, mitigate, normalize, type Build, type Target } from './calculator';
import type { EnemyFightPhase } from './enemyFightPhases';
import type { EnemyDefenseForm } from './enemyDefenseForms';
import type { HealthPoint } from './survival';
import { eventCastClock, frame, framesPerSecond, planCasts, type Cast, type DamageRecovery } from './skillCasts';

export interface DamageEnemy {
  name: string;
  hp: number;
  fight?: EnemyFightPhase[];
  forms?: EnemyDefenseForm[];
  selectedForm?: string;
}

export interface DamageTargetPhase {
  start: number;
  name: string;
  target: Target;
  state: 'active' | 'invulnerable' | 'depleted';
}

export interface DamageTimeline {
  attackDps: number;
  attackInterval: number;
  skill: { duration: number; dps: number; retreats: boolean } | null;
  opening: { label: string; damage: number; replacesAttack?: boolean } | null;
  recovery?: DamageRecovery;
  phases?: { start: number; model: DamageTimeline; state: DamageTargetPhase['state'] }[];
}

export function fullFightDamageTimeline(build: Build, phases: DamageTargetPhase[]): DamageTimeline | null {
  if (!phases.length) return null;
  const models = new Map<string, DamageTimeline>();
  const timeline = [];
  for (const { start, target, state } of phases) {
    const key = target.def + '/' + target.res;
    const model = models.get(key) ?? damageTimeline(build, target);
    if (!model) return null;
    models.set(key, model);
    timeline.push({ start, model, state });
  }
  return { ...timeline[0].model, phases: timeline };
}

export function damageTimeline(build: Build, target: Target, active = calculate(build, target)): DamageTimeline | null {
  const b = normalize(build);
  const skill = b.character.skills.find(s => s.slot === b.skill);
  if (skill?.token || b.plotSummon || active.hps !== null || active.damage <= 0) return null;
  if (!skill) {
    if (active.dps === null) return null;
    return { attackDps: active.dps, attackInterval: active.attackInterval, skill: null, opening: null };
  }

  const rank = skill.ranks[b.rank - 1];
  const retreats = b.operator === 'amiya' && b.skill === 3;
  const timing = b.character.skillTiming?.[b.skill];
  const recovery: DamageRecovery | undefined = !retreats && (skill.eventRecovery || timing || skill.manual) && !(rank.charges > 1)
    && rank.sp > 0 && Number.isFinite(rank.initialSp)
    ? { cost: rank.sp, initial: rank.initialSp, limit: rank.skill_max_trigger_time || undefined,
      ...(skill.eventRecovery ?? { kind: 'time', automatic: timing === 'auto' }) }
    : undefined;
  const normal = calculate({ ...b, skill: 0 }, target);
  const attackDps = normal.dps ?? 0;
  const attackInterval = normal.damage > 0 ? normal.attackInterval : 0;
  const base = { attackDps, attackInterval, recovery };
  if (skill.eventRecovery?.nextAttack && active.empowered) {
    return { ...base, skill: null, opening: {
      label: skill.name, damage: active.empowered.hits * active.empowered.damagePerHit, replacesAttack: true,
    } };
  }
  if (active.dps === null && ['attack', 'volley', 'cast'].includes(active.damageUnit)) {
    return { ...base, skill: null, opening: {
      label: active.source, damage: active.damage, replacesAttack: skill.eventRecovery?.nextAttack,
    } };
  }
  const permanent = b.operator === 'hsgma2' && b.skill === 1 && rank.duration === -1;
  const duration = permanent ? Infinity : rank.duration > 0 ? rank.duration : rank.max_duration;
  if (!(duration > 0) || active.dps === null) return null;

  return {
    ...base,
    skill: { duration, dps: active.dps, retreats },
    // S3 applies the ATK buff before launching the anchor. The throw uses the
    // rank's atk_scale and is separate from the attacks during the stance.
    opening: b.operator === 'ulpia' && b.skill === 3
      ? { label: 'Anchor throw', damage: mitigate(active.atk * rank.atk_scale, 'Physical', target) }
      : null,
  };
}

function damageEventClock(timeline: DamageTimeline, start: number, repeat: boolean, hitInterval: number) {
  const recovery = timeline.recovery;
  return repeat && recovery && recovery.kind !== 'time'
    ? eventCastClock(recovery, start, timeline.skill?.duration ?? 0, timeline.attackInterval, hitInterval)
    : undefined;
}

export function damageCasts(timeline: DamageTimeline, start: number, duration: number, repeat = false, hitInterval = 0): Cast[] {
  if (!timeline.opening && !timeline.skill) return [];
  if (!repeat || !timeline.recovery) return [{ start, end: start + (timeline.skill?.duration ?? 0) }];
  const clock = damageEventClock(timeline, start, repeat, hitInterval);
  if (clock) {
    const phases = timeline.phases ?? [{ start: 0, state: 'active' }];
    for (const [i, phase] of phases.entries()) {
      if (phase.state !== 'active') continue;
      const end = Math.min(duration, phases[i + 1]?.start ?? duration);
      for (let time = clock.next(phase.start); time < end; time = clock.next(time)) clock.advance(time);
    }
    return clock.casts;
  }
  return planCasts(timeline.recovery.automatic ? 0 : start, timeline.skill?.duration ?? 0, frame(duration) - 1, timeline.recovery)
    .map(cast => ({ start: cast.start / framesPerSecond, end: cast.end / framesPerSecond }));
}

export function openingWindow(timeline: DamageTimeline) {
  return timeline.opening?.replacesAttack && timeline.attackInterval > 0 ? Math.min(1, timeline.attackInterval) : 1;
}

function openingBonus(timeline: DamageTimeline) {
  const opening = timeline.opening;
  if (!opening) return 0;
  return opening.damage - (opening.replacesAttack ? timeline.attackDps * timeline.attackInterval : 0);
}

export function damageAtTime(timeline: DamageTimeline, time: number, casts: readonly Cast[] | number) {
  const phase = timeline.phases?.filter(phase => phase.start <= time).at(-1);
  const invulnerable = phase?.state === 'invulnerable';
  const depleted = phase?.state === 'depleted';
  const model = phase?.model ?? timeline;
  const cast = typeof casts === 'number'
    ? time >= casts ? { start: casts, end: casts + (model.skill?.duration ?? 0) } : undefined
    : casts.findLast(cast => cast.start <= time);
  const skill = model.skill;
  const skillActive = !!skill && !!cast && time < cast.end;
  const retreated = !!skill?.retreats && !!cast && time >= cast.end;
  let openingDamage = 0;
  let openingDps = 0;
  if (!invulnerable && !depleted && cast && time < cast.start + openingWindow(timeline)) {
    const openingPhase = timeline.phases?.findLast(phase => phase.start <= cast.start);
    if (!openingPhase || openingPhase.state === 'active') {
      const openingModel = openingPhase?.model ?? timeline;
      openingDamage = openingModel.opening?.damage ?? 0;
      openingDps = openingBonus(openingModel) / openingWindow(openingModel);
    }
  }
  const dps = invulnerable || depleted || retreated ? 0 : skillActive ? skill.dps : model.attackDps;
  return { dps: Math.max(0, dps + openingDps), skillActive, openingDamage, openingDps, retreated, invulnerable, depleted };
}

export function simulateEnemyHp({
  build, target, maxHp, fight, activation, duration, manual, repeat = false, hitInterval = 0,
}: {
  build: Build;
  target: Target;
  maxHp: number;
  fight?: EnemyFightPhase[];
  activation: number;
  duration: number;
  manual?: number;
  repeat?: boolean;
  hitInterval?: number;
}) {
  const frames = fight ?? [{ name: '', def: target.def, res: target.res }];
  const timingModel = damageTimeline(build, target);
  if (!timingModel) return null;
  const clock = damageEventClock(timingModel, activation, repeat, hitInterval);
  const casts = clock?.casts ?? damageCasts(timingModel, activation, duration, repeat, hitInterval);
  const boundaries = [...new Set(casts.flatMap(cast => [cast.start, cast.end]))].sort((a, b) => a - b);
  const openingHits = new Map<number, number>();
  const phases: DamageTargetPhase[] = [];
  const hpPoints: HealthPoint[] = [{ time: 0, hp: maxHp }];
  let time = 0;
  let hp = maxHp;
  let defeatedAt: number | undefined;

  for (const [index, form] of frames.entries()) {
    const phaseTarget = { ...target, def: form.def, res: form.res };
    const model = damageTimeline(build, phaseTarget);
    if (!model) return null;
    const state = form.invulnerable ? 'invulnerable' : 'active';
    phases.push({ start: time, name: form.name, target: phaseTarget, state });
    if (form.restore !== undefined) {
      hp = maxHp * form.restore;
      hpPoints.push({ time, hp });
    }
    const deadline = index === 0 && manual !== undefined && form.ends
      ? manual : form.ends && 'duration' in form.ends
        ? Math.round((time + form.ends.duration) * 1e9) / 1e9
        : Infinity;
    const hasNext = index < frames.length - 1;
    const threshold = deadline === Infinity && form.ends && 'hpRatio' in form.ends
      ? maxHp * form.ends.hpRatio : 0;
    const limit = Math.min(deadline, duration);
    // Integrate constant rates between cast boundaries, applying each opening hit once.
    while (time < limit) {
      if (clock && state === 'active' && hp > threshold && clock.next(time) === time) {
        const count = casts.length;
        clock.advance(time);
        if (casts.length !== count && hpPoints.at(-1)?.time !== time) hpPoints.push({ time, hp });
      }
      const cast = casts.at(-1);
      const startsNow = clock ? cast?.start === time : casts.some(entry => entry.start === time);
      if (model.opening && startsNow && !openingHits.has(time)
        && (state !== 'active' || hp > threshold)) {
        openingHits.set(time, state === 'active' ? model.opening.damage : 0);
        if (state === 'active') hp = Math.max(0, Math.min(maxHp, hp - openingBonus(model)));
        hpPoints.push({ time, hp });
      }
      if (state === 'active' && hp <= threshold) {
        if (!hasNext) defeatedAt = time;
        if (deadline === Infinity) break;
        phases.push({ start: time, name: form.name, target: phaseTarget, state: 'depleted' });
        time = limit;
        hpPoints.push({ time, hp });
        break;
      }
      const sample = damageAtTime(model, time, casts);
      const rate = state === 'active' ? (sample.retreated ? 0 : sample.skillActive ? model.skill!.dps : model.attackDps) : 0;
      const boundary = clock
        ? Math.min(state === 'active' ? clock.next(time) : Infinity, cast && cast.end > time ? cast.end : Infinity)
        : boundaries.find(boundary => boundary > time) ?? Infinity;
      const next = Math.min(limit, boundary);
      const reachesThreshold = rate > 0 && (hp - threshold) / rate <= next - time;
      if (reachesThreshold) {
        time += (hp - threshold) / rate;
        hp = threshold;
      } else {
        hp = Math.max(0, hp - rate * (next - time));
        time = next;
      }
      // Charging events leave the DPS unchanged and need no additional chart points.
      if (!clock || reachesThreshold || time === limit || time === cast?.end) hpPoints.push({ time, hp });
    }
    if (!hasNext && hp === 0 && defeatedAt === undefined) defeatedAt = time;
    if (defeatedAt !== undefined) {
      phases.push({ start: defeatedAt, name: 'HP depleted', target: phaseTarget, state: 'depleted' });
      break;
    }
    const phaseEnded = deadline === Infinity ? state === 'active' && hp <= threshold : time >= deadline;
    if (!phaseEnded) break;
    if (index === 0 && manual !== undefined && form.ends && 'hpRatio' in form.ends && form.ends.hpRatio === 0 && hp > 0) {
      hp = 0;
      hpPoints.push({ time, hp });
    }
  }
  if (time < duration) hpPoints.push({ time: duration, hp });
  return { points: hpPoints, phases, casts, openingHits, openingDamage: openingHits.get(casts[0]?.start ?? Infinity), defeatedAt, maxHp };
}
