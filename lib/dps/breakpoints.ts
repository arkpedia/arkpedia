import {
  calculate,
  mitigate,
  profile,
  burstThreshold,
  hitsRequired,
  type Build,
  type Target,
} from './calculator';

// Enemy-side durations from the game's ba.dt.*2 glossary entries.
export const recoverySeconds: Record<string, number> = {
  Necrosis: 15,
  Burn: 10,
  Corrosion: 8,
  'Nervous Impairment': 10,
  Rampage: 15,
};
const EPS = 1e-8;
export function firstBurst(b: Build, target: Target, source: 'build' | 'summon' = 'summon') {
  const t = { ...target, burst: 'None' },
    goal = burstThreshold(t);
  let r = calculate(b, t);
  const skill = profile(b).skills.find((s) => s.slot === b.skill)?.ranks[b.rank - 1];
  const summon = r.summon && (source === 'summon' || b.plotSummon) ? r.summon : null;
  const interval = summon ? skill!.interval_damage : r.interval;
  const injury = summon ? summon.injury / summon.ticks : r.injury;
  const out = {
    count: null as number | null,
    seconds: null as number | null,
    repeat: null as number | null,
    recovery: null as number | null,
    unit: summon ? 'ticks' : 'actions',
    amount: summon?.injury ?? injury,
    limited: false,
    summon: !!summon,
  };
  if (!r.element || !(injury > 0)) return out;
  if (b.operator === 'cello' && skill && (b.skill === 1 || b.skill === 2)) {
    // Both streams hit one surviving target. S1 holds charges through Necrosis fallout.
    const charged = b.skill === 1;
    const end = charged ? Infinity : skill.duration;
    const capacity = (skill.charges ?? 1) * skill.sp;
    let sp = capacity,
      previous = 0,
      nextCast = 0,
      nextAura = 0;
    let gauge = 0,
      ready = 0,
      events = 0;
    out.unit = 'injury events';
    while (Math.min(nextCast, nextAura) < end - EPS) {
      const time = Math.min(nextCast, nextAura);
      sp = Math.min(capacity, sp + time - previous);
      previous = time;
      const open = time >= ready - EPS;
      if (nextCast <= time + EPS) {
        if (!charged || open) {
          if (open) {
            gauge += injury;
            events++;
          }
          if (charged) sp -= skill.sp;
          nextCast = time + Math.max(r.attackInterval, charged ? skill.sp - sp : 0);
        } else nextCast = ready;
      }
      if (nextAura <= time + EPS) {
        if (open && gauge < goal - EPS) {
          gauge += r.periodic;
          events++;
        }
        nextAura++;
      }
      if (gauge < goal - EPS) continue;
      if (out.seconds !== null) {
        out.repeat = time - out.seconds;
        return out;
      }
      out.count = events;
      out.seconds = time;
      out.recovery = recoverySeconds.Necrosis;
      ready = time + out.recovery;
      gauge = 0;
    }
    out.limited = true;
    return out;
  }
  const needed = hitsRequired(goal, injury)!;
  if (!interval) {
    // Botani's extra packet only lands on an empty Corrosion gauge.
    const partialGaugeHit =
      b.operator === 'botany' && b.skill === 1 && skill
        ? (injury * skill.ep_damage_ratio) /
          (skill.ep_damage_ratio + skill['botany_s1_extra.ep_damage_ratio'])
        : injury;
    out.count = needed === 1 ? 1 : 1 + hitsRequired(goal - injury, partialGaugeHit)!;
    if (needed === 1) out.seconds = 0;
    return out;
  }

  // Timestamp zero is first contact. Include exactly the archived number of
  // summon ticks. Timed skill sources are measured over one active window.
  const window = summon
    ? summon.ticks * interval
    : b.operator === 'phonor'
      ? r.firstTalent.duration
      : skill && skill.duration > 0
        ? skill.duration
        : skill?.max_duration || Infinity;
  const cooldown =
    recoverySeconds[r.element] /
    (1 + (skill?.['talent@ep_break_recover_speed'] ?? skill?.['attack@ep_break_recover_speed'] ?? 0));
  const reducePerHit = b.operator === 'thumpy' ? (r.firstTalent.duration_dec ?? 0) : 0;
  const normal = r.empowered ? calculate({ ...b, skill: 0 }, t).injury : injury;
  let sp = skill?.initialSp ?? 0,
    boundUntil = -1;
  let gauge = 0,
    cadence = interval,
    hit = 0,
    nextHit = 0,
    nextTick = Infinity,
    ready = 0;
  let perHit = injury;
  // Track attacks through fallout for offensive SP, on-hit recovery and
  // cadence alignment. Independent ticks stop on burst and rearm on contact.
  while (Math.min(nextHit, nextTick) < window - EPS) {
    let time = Math.min(nextHit, nextTick);
    const locked = time < ready - EPS;
    if (!locked && !r.empowered && !r.periodic) {
      const skip = hitsRequired(goal - gauge, perHit)! - 1;
      nextHit += skip * cadence;
      hit += skip;
      gauge += skip * perHit;
      time = nextHit;
      if (time >= window - EPS) break;
    }
    if (Math.abs(time - nextHit) < EPS) {
      hit++;
      let packet = perHit;
      if (r.empowered && skill) {
        if (sp >= skill.sp) {
          packet = r.empowered.injuryPerHit * r.empowered.hits;
          boundUntil = time + skill.unmove;
          sp = 0;
        } else {
          packet = normal * (time < boundUntil ? skill.ep_damage_scale : 1);
          sp++;
        }
      }
      if (locked) ready = Math.max(time, ready - reducePerHit);
      else {
        gauge += packet;
        if (r.periodic && nextTick === Infinity) nextTick = time + skill!.interval;
      }
      nextHit = time + cadence;
    }
    if (Math.abs(time - nextTick) < EPS) {
      if (!locked) gauge += r.periodic * skill!.interval;
      nextTick += skill!.interval;
    }
    if (out.seconds !== null) out.recovery = ready - out.seconds;
    if (gauge + EPS < goal) continue;
    if (out.seconds !== null) {
      out.repeat = time - out.seconds;
      return out;
    }
    out.count = hit;
    out.seconds = time;
    ready = time + cooldown;
    out.recovery = cooldown;
    gauge = 0;
    nextTick = Infinity;
    if (r.element === 'Corrosion') {
      r = calculate(b, { ...t, def: Math.max(0, t.def - 120) }, 1);
      perHit = r.injury;
      cadence = r.interval!;
      nextHit = time + cadence;
    }
  }
  out.limited = Number.isFinite(window);
  return out;
}

export function fallout(element: string | undefined, t: Target) {
  const damage = { Necrosis: 800, Burn: 7000, Corrosion: 5000, 'Nervous Impairment': 6000 }[element ?? ''];
  if (!damage) return null;
  return { perHit: mitigate(damage, 'Elemental', t), count: element === 'Necrosis' ? 15 : 1 };
}
