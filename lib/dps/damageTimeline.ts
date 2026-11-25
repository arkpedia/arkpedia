import { calculate, mitigate, normalize, type Build, type Target } from './calculator';

export interface DamageTimeline {
  attackDps: number;
  skill: { duration: number; dps: number; retreats: boolean } | null;
  opening: { label: string; damage: number } | null;
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
  const elapsed = time - activation;
  const skill = timeline.skill;
  const skillActive = !!skill && elapsed >= 0 && elapsed < skill.duration;
  const retreated = !!skill?.retreats && elapsed >= skill.duration;
  const openingDamage = elapsed >= 0 && elapsed < 1 ? timeline.opening?.damage ?? 0 : 0;
  const dps = skillActive ? skill.dps : retreated ? 0 : timeline.attackDps;
  return { dps: dps + openingDamage, skillActive, openingDamage, retreated };
}
