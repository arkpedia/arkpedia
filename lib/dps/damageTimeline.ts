import { calculate, mitigate, normalize, type Build, type Target } from './calculator';
import type { EnemyFightPhase } from './enemyFightPhases';
import type { EnemyDefenseForm } from './enemyDefenseForms';
import type { HealthPoint } from './survival';

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
  skill: { duration: number; dps: number; retreats: boolean } | null;
  opening: { label: string; damage: number } | null;
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
    return { attackDps: active.dps, skill: null, opening: null };
  }

  const rank = skill.ranks[b.rank - 1];
  const attackDps = calculate({ ...b, skill: 0 }, target).dps ?? 0;
  if (active.dps === null && ['attack', 'volley', 'cast'].includes(active.damageUnit)) {
    return { attackDps, skill: null, opening: { label: active.source, damage: active.damage } };
  }
  const duration = rank.duration > 0 ? rank.duration : rank.max_duration;
  if (!(duration > 0) || active.dps === null) return null;

  return {
    attackDps,
    skill: { duration, dps: active.dps, retreats: b.operator === 'amiya' && b.skill === 3 },
    // S3 applies the ATK buff before launching the anchor. The throw uses the
    // rank's atk_scale and is separate from the attacks during the stance.
    opening: b.operator === 'ulpia' && b.skill === 3
      ? { label: 'Anchor throw', damage: mitigate(active.atk * rank.atk_scale, 'Physical', target) }
      : null,
  };
}

export function damageAtTime(timeline: DamageTimeline, time: number, activation: number) {
  const phase = timeline.phases?.filter(phase => phase.start <= time).at(-1);
  const invulnerable = phase?.state === 'invulnerable';
  const depleted = phase?.state === 'depleted';
  const model = phase?.model ?? timeline;
  const elapsed = time - activation;
  const skill = model.skill;
  const skillActive = !!skill && elapsed >= 0 && elapsed < skill.duration;
  const retreated = !!skill?.retreats && elapsed >= skill.duration;
  let openingDamage = 0;
  if (!invulnerable && !depleted && elapsed >= 0 && elapsed < 1) {
    const openingPhase = timeline.phases?.filter(phase => phase.start <= activation).at(-1);
    const opening = openingPhase
      ? openingPhase.state === 'active' ? openingPhase.model.opening : null
      : timeline.opening;
    openingDamage = opening?.damage ?? 0;
  }
  const dps = invulnerable || depleted || retreated ? 0 : skillActive ? skill.dps : model.attackDps;
  return { dps: dps + openingDamage, skillActive, openingDamage, retreated, invulnerable, depleted };
}

export function simulateEnemyHp({
  build, target, maxHp, fight, activation, duration, manual,
}: {
  build: Build;
  target: Target;
  maxHp: number;
  fight?: EnemyFightPhase[];
  activation: number;
  duration: number;
  manual?: number;
}) {
  const frames = fight ?? [{ name: '', def: target.def, res: target.res }];
  const phases: DamageTargetPhase[] = [];
  const hpPoints: HealthPoint[] = [{ time: 0, hp: maxHp }];
  let time = 0;
  let hp = maxHp;
  let openingDamage: number | undefined;
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
    const skillEnds = activation + (model.skill?.duration ?? 0);

    // Integrate constant rates exactly between skill boundaries. Opening hits
    // change HP immediately and can only happen once, even when they end a phase.
    while (time < limit) {
      if (time === activation && model.opening && openingDamage === undefined) {
        openingDamage = state === 'active' && hp > 0 ? model.opening.damage : 0;
        hp = Math.max(0, hp - openingDamage);
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
      const sample = damageAtTime(model, time, activation);
      const rate = state === 'active' ? sample.dps - sample.openingDamage : 0;
      const next = Math.min(limit, time < activation ? activation : time < skillEnds ? skillEnds : Infinity);
      const reachesThreshold = rate > 0 && (hp - threshold) / rate <= next - time;
      if (reachesThreshold) {
        time += (hp - threshold) / rate;
        hp = threshold;
      } else {
        hp = Math.max(0, hp - rate * (next - time));
        time = next;
      }
      hpPoints.push({ time, hp });
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
  return { points: hpPoints, phases, openingDamage, defeatedAt, maxHp };
}
