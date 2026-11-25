import { getBaseStats } from '../operators/operatorStats';
import { calculate, initialTarget, mitigate, normalize, type Build } from './calculator';
import type { AttackType, Defender, DefenderSkillRank, EnemyAbility, PatriotStances } from './survivalRoster';

export interface Defense {
  hp: number;
  def: number;
  res: number;
  dp: number;
  blocksDirectHealing: boolean;
}

interface Attack {
  atk: number;
  interval: number;
  type: AttackType;
  abilities?: EnemyAbility[];
  basicHits?: number;
}

interface EnemyPhase {
  name: 'Marching' | 'Revival' | 'Ruination';
  start: number;
  attack: Attack;
}

export type PatriotPosition = 'melee' | 'aura' | 'spear' | 'spear-aura';

export function patriotAttack(data: PatriotStances, basicInterval: number, stance: 'marching' | 'ruination', position: PatriotPosition): Attack {
  if (stance === 'marching') return { atk: data.marchingAtk, interval: basicInterval, type: 'Physical', basicHits: 4 };
  const abilities: EnemyAbility[] = [];
  if (position !== 'spear') abilities.push(data.aura);
  if (position === 'spear' || position === 'spear-aura') abilities.push(data.spear);
  return { atk: data.ruinationAtk, interval: data.ruinationInterval, type: 'Physical', basicHits: position === 'melee' ? 1 : 0, abilities };
}

export function patriotFight(data: PatriotStances, basicInterval: number, position: PatriotPosition, marchingEnds: number): EnemyPhase[] {
  const { revival } = data;
  const marching = patriotAttack(data, basicInterval, 'marching', position);
  const ruination = patriotAttack(data, basicInterval, 'ruination', position);
  const auraInterval = Math.max(1, frame(revival.interval));
  // Carry the aura clock through revival so a pulse on the boundary happens once.
  const nextPulse = (auraInterval - frame(revival.duration) % auraInterval) % auraInterval;
  return [
    { name: 'Marching', start: 0, attack: marching },
    { name: 'Revival', start: marchingEnds, attack: {
      atk: revival.atk, interval: basicInterval, type: 'Physical', basicHits: 0,
      abilities: position === 'spear' ? [] : [{ ...data.aura, firstReady: revival.interval, cooldown: revival.interval }],
    } },
    { name: 'Ruination', start: marchingEnds + revival.duration, attack: {
      ...ruination, abilities: ruination.abilities?.map(ability => ability.mode === 'aura'
        ? { ...ability, firstReady: nextPulse / framesPerSecond } : ability),
    } },
  ];
}

export interface ActiveDefense extends DefenderSkillRank {
  name: string;
  start: number;
  cycle?: boolean;
}

export interface SurvivalHealer {
  build: Build;
  delay: number;
  cycle?: boolean;
}

export interface HealthPoint {
  time: number;
  hp: number;
}

interface Restore { amount: number; belowHalf: number }
interface Hit { atk: number; type: EnemyAbility['type']; count?: number }
interface Event { hits: Hit[]; heals: Restore[]; regenerationChange: number }
interface Cast { start: number; end: number }
interface SkillWindow extends Cast { rank: DefenderSkillRank }
interface Cycle { cost: number; initial: number; limit?: number }

const framesPerSecond = 30;
const frame = (time: number) => Math.round(time * framesPerSecond);

export function defenderStats(operator: Defender, elite: number, level: number, potential: number): Defense {
  const base = getBaseStats(operator.stats.phases[elite], level);
  let { hp, def, res, dp } = base;
  hp += operator.stats.trust.hp;
  def += operator.stats.trust.def;
  for (const bonus of operator.potential.slice(0, potential - 1)) {
    hp += bonus.hp ?? 0;
    def += bonus.def ?? 0;
    res += bonus.res ?? 0;
    dp += bonus.dp ?? 0;
  }
  return { hp, def, res, dp, blocksDirectHealing: operator.blocksDirectHealing };
}

function activeAt(windows: SkillWindow[], tick: number) {
  return windows.find(window => tick >= window.start && tick < window.end)?.rank;
}

// This baseline assumes 1 SP/s and no SP recovery while the skill is active.
function planCasts(start: number, duration: number | null, end: number, cycle?: Cycle, permanentAfterFirst = false) {
  const casts: Cast[] = [];
  let ready = cycle ? frame(Math.max(0, cycle.cost - cycle.initial)) : frame(start);
  while (ready <= end && casts.length < (cycle?.limit ?? Infinity)) {
    const stop = duration === null || permanentAfterFirst && casts.length > 0 ? Infinity : ready + frame(duration);
    casts.push({ start: ready, end: stop });
    if (!cycle || stop === Infinity) break;
    ready = stop + Math.max(1, frame(cycle.cost));
  }
  return casts;
}

export function healerSkillCycle(b: Build): Cycle | undefined {
  const skill = b.character.skills.find(s => s.slot === b.skill);
  const rank = skill?.ranks[b.rank - 1];
  if (!rank?.sp || !(skill?.manual || b.operator === 'skadi2' && b.skill === 2)) return undefined;
  return { cost: rank.sp, initial: rank.initialSp, limit: rank.skill_max_trigger_time || undefined };
}

function damageTarget(defender: Defense, skill?: DefenderSkillRank) {
  return { ...initialTarget, def: defender.def * (1 + (skill?.def ?? 0)), res: defender.res * (1 + (skill?.res ?? 0)) };
}

function trace(events: Map<number, Event>, defender: Defense, windows: SkillWindow[]) {
  const initial = activeAt(windows, 0);
  let maxHp = defender.hp * (1 + (initial?.hp ?? 0));
  const points: HealthPoint[] = [{ time: 0, hp: maxHp }];
  let hp = maxHp;
  let lowest = maxHp;
  let previous = 0;
  let regeneration = 0;
  let selfRegeneration = 0;
  let defeatedAt: number | null = null;
  for (const [tick, event] of [...events].sort(([a], [b]) => a - b)) {
    const time = tick / framesPerSecond;
    if (defeatedAt !== null) {
      points.push({ time, hp: 0 });
      continue;
    }
    if (time > previous) {
      const rate = regeneration + selfRegeneration;
      const restored = rate * (time - previous);
      if (hp < maxHp && restored > maxHp - hp) {
        points.push({ time: previous + (maxHp - hp) / rate, hp: maxHp });
      }
      hp = Math.min(maxHp, hp + restored);
      points.push({ time, hp });
    }
    const active = activeAt(windows, tick);
    const nextMax = defender.hp * (1 + (active?.hp ?? 0));
    if (nextMax !== maxHp) {
      hp *= nextMax / maxHp;
      maxHp = nextMax;
      lowest = Math.min(lowest, hp);
      points.push({ time, hp });
    }
    if (event.hits.length) {
      const defenses = damageTarget(defender, active);
      const damage = event.hits.reduce((total, hit) => total + (hit.count ?? 1) * mitigate(hit.atk, hit.type, defenses), 0);
      hp = Math.max(0, hp - damage);
      lowest = Math.min(lowest, hp);
      points.push({ time, hp });
      if (hp === 0) {
        defeatedAt = time;
        continue;
      }
    }
    const belowHalf = hp < maxHp / 2;
    const healed = Math.min(maxHp, hp + event.heals.reduce((sum, heal) => sum + (belowHalf ? heal.belowHalf : heal.amount), 0));
    if (healed > hp) {
      hp = healed;
      points.push({ time, hp });
    }
    regeneration = Math.max(0, regeneration + event.regenerationChange);
    selfRegeneration = (active?.regeneration ?? 0) + maxHp * (active?.regenerationRatio ?? 0);
    previous = time;
  }
  return { points, lowest, finalHp: hp, defeatedAt };
}

export function simulateSurvival(enemy: Attack | EnemyPhase[], defender: Defense, healers: SurvivalHealer[], seconds: number, skill?: ActiveDefense) {
  const phases = 'atk' in enemy ? [] : enemy;
  const timeline = 'atk' in enemy ? [{ start: 0, attack: enemy }] : enemy;
  const reference = timeline.find((phase, i) => timeline[i + 1]?.start !== phase.start)!.attack;
  const basicHits = reference.basicHits ?? 1;
  const hitDamage = mitigate(reference.atk, reference.type, damageTarget(defender));
  const end = frame(seconds);
  const windows = skill ? planCasts(skill.duration === null ? 0 : skill.start, skill.duration, end, skill.cycle ? skill.sp : undefined)
    .map(cast => ({ ...cast, rank: skill })) : [];
  function eventAt(events: Map<number, Event>, tick: number) {
    let event = events.get(tick);
    if (!event) {
      event = { hits: [], heals: [], regenerationChange: 0 };
      events.set(tick, event);
    }
    return event;
  }

  const attacks = new Map<number, Event>();
  const abilityHits: { name: string; time: number; damage: number }[] = [];
  for (const [i, phase] of timeline.entries()) {
    const start = frame(phase.start);
    const next = timeline[i + 1];
    const stop = next ? Math.min(end, frame(next.start) - 1) : end;
    const { attack } = phase;
    const interval = Math.max(1, frame(attack.interval));
    const abilities = attack.abilities ?? [];
    const nextHit = abilities.find(ability => ability.mode === 'next-hit');
    const chargeWindows: { start: number; end: number }[] = [];
    let nextHitReady = nextHit ? start + frame(nextHit.firstReady) : Infinity;
    function abilityHit(tick: number, source: EnemyAbility) {
      const atk = attack.atk * source.scale;
      eventAt(attacks, tick).hits.push({ atk, type: source.type });
      if (source.mode !== 'aura') {
        abilityHits.push({ time: tick / framesPerSecond, name: source.name,
          damage: mitigate(atk, source.type, damageTarget(defender, activeAt(windows, tick))) });
      }
    }
    for (const ability of abilities) {
      if (ability.mode === 'next-hit') continue;
      const delay = frame(ability.delay);
      const cooldown = Math.max(1, frame(ability.cooldown));
      for (let cast = start + frame(ability.firstReady); cast <= stop; cast += cooldown) {
        const impact = cast + delay;
        if (ability.mode === 'charge') chargeWindows.push({ start: cast, end: impact });
        if (impact <= stop) abilityHit(impact, ability);
      }
    }
    const hits = attack.basicHits ?? 1;
    for (let tick = start + interval; hits > 0 && tick <= stop; tick += interval) {
      if (chargeWindows.some(charge => tick >= charge.start && tick <= charge.end)) continue;
      if (nextHit && tick >= nextHitReady) {
        abilityHit(tick, nextHit);
        nextHitReady = tick + Math.max(1, frame(nextHit.cooldown));
      } else {
        eventAt(attacks, tick).hits.push({ atk: attack.atk, type: attack.type, count: hits });
      }
    }
  }
  for (const window of windows) {
    eventAt(attacks, window.start);
    if (window.end <= end) eventAt(attacks, window.end);
  }
  eventAt(attacks, end);
  const alone = trace(attacks, defender, windows);

  const healerCycles: { id: number; name: string; casts: { start: number; end: number | null }[] }[] = [];
  for (const { build, delay, cycle } of healers) {
    const b = normalize({ ...build, lowCostHealingTarget: defender.dp <= 10, healingTargetBelowHalf: false });
    const basic = { ...b, skill: 0 };
    const duration = b.character.skills.find(s => s.slot === b.skill)?.ranks[b.rank - 1]?.duration ?? 0;
    const sp = cycle ? healerSkillCycle(b) : undefined;
    const harukaS2 = b.operator === 'haruka' && b.skill === 2;
    const permanent = duration < 0 || harukaS2 && !sp && !b.firstHealingCast;
    const casts = b.skill ? planCasts(delay, permanent ? null : duration, sp && harukaS2 ? Math.max(end, frame(120)) : end, sp, !!sp && harukaS2) : [];
    if (sp) healerCycles.push({ id: b.id, name: b.character.name,
      casts: casts.map(cast => ({ start: cast.start / framesPerSecond, end: cast.end === Infinity ? null : cast.end / framesPerSecond })) });
    const phases: [number, number, Build][] = [];
    let previousEnd = 0;
    for (const [i, cast] of casts.entries()) {
      if (cast.start >= end) break;
      phases.push([previousEnd, cast.start, basic]);
      const active = sp && harukaS2 ? { ...b, firstHealingCast: i === 0 } : b;
      previousEnd = Math.min(end, cast.end);
      phases.push([cast.start, previousEnd, active]);
    }
    phases.push([previousEnd, end, basic]);
    for (const [from, until, source] of phases) {
      if (from >= until) continue;
      const healing = calculate(source, initialTarget).healing;
      if (!healing) continue;
      if (healing.regeneration) {
        eventAt(attacks, from).regenerationChange += healing.regeneration;
        eventAt(attacks, until).regenerationChange -= healing.regeneration;
      }
      if (!healing.direct || defender.blocksDirectHealing) continue;
      const { amount, interval: healInterval } = healing.direct;
      const belowHalf = source.operator === 'susuro' && source.stage > 0
        ? calculate({ ...source, healingTargetBelowHalf: true }, initialTarget).healing?.direct?.amount ?? amount
        : amount;
      const step = Math.max(1, frame(healInterval));
      for (let tick = from + step; tick <= until; tick += step) {
        eventAt(attacks, tick).heals.push({ amount, belowHalf });
      }
    }
  }
  const peakHp = defender.hp * (1 + (windows[0]?.rank.hp ?? 0));
  const finalMaxHp = defender.hp * (1 + (activeAt(windows, end)?.hp ?? 0));
  const defenderWindows = windows.map(window => ({ start: window.start / framesPerSecond,
    end: window.end === Infinity ? null : window.end / framesPerSecond }));
  const auraAttack = timeline.find(phase => phase.attack.abilities?.some(ability => ability.mode === 'aura'))?.attack;
  const aura = auraAttack?.abilities?.find(ability => ability.mode === 'aura');
  return {
    alone, healed: healers.length ? trace(attacks, defender, windows) : alone,
    basicHits, hitDamage, dps: basicHits * hitDamage * framesPerSecond / Math.max(1, frame(reference.interval)),
    aura: aura && auraAttack ? { damage: auraAttack.atk * aura.scale, interval: aura.cooldown } : null,
    enemyPhases: phases.map(({ name, start }) => ({ name, start })),
    abilityHits: abilityHits.sort((a, b) => a.time - b.time), defenderWindows, defenderSkill: skill?.name, healerCycles, peakHp, finalMaxHp,
  };
}

export function hpAt(points: HealthPoint[], time: number) {
  const next = points.findIndex(point => point.time > time);
  if (next < 0) return points.at(-1)!.hp;
  if (next === 0) return points[0].hp;
  const before = points[next - 1], after = points[next];
  return before.hp + (after.hp - before.hp) * (time - before.time) / (after.time - before.time);
}
