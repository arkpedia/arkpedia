import { calculate, mitigate, normalize, type Build, type Target } from './calculator';
import type { PatriotDefenseTiming } from './enemyDefenseForms';

export interface PatriotTimelinePreset {
  name: string;
  timing: PatriotDefenseTiming;
  marching: Pick<Target, 'def' | 'res'>;
  ruination: Pick<Target, 'def' | 'res'>;
}

export interface DamageTargetPhase {
  start: number;
  name: 'Marching' | 'Revival' | 'Ruination';
  target: Target;
  invulnerable: boolean;
}

export interface DamageTimeline {
  attackDps: number;
  skill: { duration: number; dps: number; retreats: boolean } | null;
  opening: { label: string; damage: number } | null;
  phases?: { start: number; model: DamageTimeline | null }[];
}

export function patriotDamagePhases(preset: PatriotTimelinePreset, target: Target, marchingEnds: number): DamageTargetPhase[] {
  const { revivalDuration, ruinationInvulnerability } = preset.timing;
  const ruinationStarts = Math.round((marchingEnds + revivalDuration) * 10) / 10;
  const damageResumes = Math.round((marchingEnds + revivalDuration + ruinationInvulnerability) * 10) / 10;
  const marching = { ...target, def: preset.marching.def, res: preset.marching.res };
  const ruination = { ...target, def: preset.ruination.def, res: preset.ruination.res };
  const phases: DamageTargetPhase[] = [
    { start: 0, name: 'Marching', target: marching, invulnerable: false },
    { start: marchingEnds, name: 'Revival', target: marching, invulnerable: true },
  ];
  if (damageResumes > ruinationStarts) {
    phases.push({ start: ruinationStarts, name: 'Ruination', target: ruination, invulnerable: true });
  }
  phases.push({ start: damageResumes, name: 'Ruination', target: ruination, invulnerable: false });
  return phases;
}

export function fullFightDamageTimeline(build: Build, phases: DamageTargetPhase[]) {
  const marching = damageTimeline(build, phases[0].target);
  const ruination = damageTimeline(build, phases[phases.length - 1].target);
  if (!marching || !ruination) return null;
  return {
    ...marching,
    phases: phases.map(({ start, name, invulnerable }) => ({
      start,
      model: invulnerable ? null : name === 'Marching' ? marching : ruination,
    })),
  };
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
  const invulnerable = phase?.model === null;
  const model = phase?.model ?? timeline;
  const elapsed = time - activation;
  const skill = model.skill;
  const skillActive = !!skill && elapsed >= 0 && elapsed < skill.duration;
  const retreated = !!skill?.retreats && elapsed >= skill.duration;
  let openingDamage = 0;
  if (!invulnerable && elapsed >= 0 && elapsed < 1) {
    const openingPhase = timeline.phases?.filter(phase => phase.start <= activation).at(-1);
    const opening = openingPhase ? openingPhase.model?.opening : timeline.opening;
    openingDamage = opening?.damage ?? 0;
  }
  const dps = invulnerable || retreated ? 0 : skillActive ? skill.dps : model.attackDps;
  return { dps: dps + openingDamage, skillActive, openingDamage, retreated, invulnerable };
}
