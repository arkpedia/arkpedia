import type { Build, calculate } from './calculator';

type DamageSource = Pick<ReturnType<typeof calculate>, 'damageUnit' | 'empowered'>;

export function damageBasis(source: DamageSource) {
  return source.empowered ? 'per attack (cycle average)' : 'per ' + source.damageUnit;
}

export function sharedDamageBasis(sources: DamageSource[]) {
  const bases = new Set(sources.map(damageBasis));
  return bases.size === 1 ? damageBasis(sources[0]) : 'per attack, tick or use';
}

export function dpsLabel(builds: readonly Pick<Build, 'skill'>[]) {
  if (builds.every(build => build.skill > 0)) return 'Skill DPS';
  if (builds.every(build => build.skill === 0)) return 'Attack DPS';
  return 'DPS';
}
