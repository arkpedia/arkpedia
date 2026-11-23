import { calculate, mitigate, profile, threshold, type Build, type Target } from './calculator';

// First event starts on first contact. This is a source breakpoint, independent
// of deployment animation and SP warmup. No second gauge fills during fallout.
export function firstBurst(b: Build, target: Target) {
  const t = { ...target, burst: 'None' },
    r = calculate(b, t),
    goal = threshold(t.tier);
  if (r.summon) {
    const count = r.summon.ticksToBurst;
    return {
      count: count && count <= r.summon.ticks ? count : null,
      unit: 'ticks',
      amount: r.summon.injury,
      limited: true,
    };
  }
  if (b.operator === 'phatm2' && b.skill === 1 && r.empowered && r.interval) {
    const sk = profile(b).skills[0].ranks[b.rank - 1];
    const normal = calculate({ ...b, skill: 0 }, t).injury;
    if (!normal) return { count: null, unit: 'attacks', amount: 0, limited: false };
    let gauge = 0,
      sp = sk.initialSp,
      boundUntil = -1;
    for (let attack = 1; attack <= 20000; attack++) {
      const time = (attack - 1) * r.interval;
      if (sp >= sk.sp) {
        gauge += r.empowered.injuryPerHit * r.empowered.hits;
        boundUntil = time + sk.unmove;
        sp = 0;
      } else {
        gauge += normal * (time < boundUntil ? sk.ep_damage_scale : 1);
        sp++;
      }
      if (gauge >= goal - 1e-8) return { count: attack, unit: 'attacks', amount: r.injury, limited: false };
    }
  }
  if (r.periodic && r.interval && r.attacks) {
    for (let n = 1; n <= r.attacks; n++) {
      const nextAttack = n * r.interval;
      const ticksBeforeNext = Math.ceil(nextAttack - 1e-8) - 1;
      if (n * r.injury + ticksBeforeNext * r.periodic >= goal - 1e-8)
        return { count: n, unit: 'attacks', amount: r.injury, limited: false };
    }
  }
  return { count: r.attacks, unit: 'actions', amount: r.injury, limited: false };
}
export function fallout(element: string | undefined, t: Target) {
  const damage = { Necrosis: 800, Burn: 7000, Corrosion: 5000, 'Nervous Impairment': 6000 }[element ?? ''];
  if (!damage) return null;
  return { perHit: mitigate(damage, 'Elemental', t), count: element === 'Necrosis' ? 15 : 1 };
}
