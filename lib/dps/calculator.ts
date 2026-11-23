import { elements, sourceAction } from './sources';
import { additionalEffects } from './effects';

type Values = Record<string, number>;
interface Candidate {
  elite: number;
  level: number;
  potential: number;
  values: Values;
}
export interface Profile {
  id: string;
  name: string;
  region: string;
  branch: string;
  rarity: number;
  trust: number;
  phases: { maxLevel: number; start: number; end: number; interval: number }[];
  potential: Values[];
  talents: Candidate[][];
  skills: {
    manual: boolean;
    token: null | { id: string; name: string; phases: Profile['phases'] };
    slot: number;
    name: string;
    elite: number;
    ranks: Values[];
  }[];
  alternateModule: Profile['module'];
  module: null | {
    name: string;
    level: number;
    stages: {
      stats: Values;
      tokenStats: Record<string, Values>;
      trait: Values;
      talents: Record<string, Candidate[]>;
    }[];
  };
}

export interface Build {
  character: Profile;
  id: number;
  operator: string;
  elite: number;
  level: number;
  potential: number;
  skill: number;
  rank: number;
  stage: number;
  tenacity: boolean;
  lastStand: boolean;
  plotSummon: boolean;
  trapInRange: boolean;
  alternateModule: boolean;
  traitActive: boolean;
  control: 'none' | 'one' | 'both';
  stacked: boolean;
  penetrationStacks?: number;
}
export interface Target {
  def: number;
  res: number;
  elementalRes: number;
  injuryRes: number;
  thresholdOverride?: number;
  tier: 'Grunt' | 'Elite' | 'Boss';
  burst: string;
}
export const initialTarget: Target = {
  def: 400,
  res: 20,
  elementalRes: 0,
  injuryRes: 0,
  tier: 'Boss',
  burst: 'None',
};
export function profile(b: Build) {
  return b.character;
}
export function createBuild(p: Profile, id: number): Build {
  const operator = p.id;
  return {
    id,
    character: p,
    operator,
    elite: p.phases.length - 1,
    level: p.phases.at(-1)!.maxLevel,
    potential: 1,
    skill: ['phatm2', 'phatom'].includes(operator) ? 2 : (p.skills.at(-1)?.slot ?? 0),
    rank: [4, 7, 10][p.phases.length - 1],
    stage: ['mlyss', 'ifrit', 'logos', 'ebnhlz', 'thorns', 'vvana'].includes(operator) ? 3 : 0,
    tenacity: false,
    lastStand: false,
    plotSummon: false,
    trapInRange: false,
    alternateModule: false,
    traitActive: false,
    control: 'none',
    stacked: true,
  };
}
export function selectedModule(b: Build) {
  return (b.alternateModule && b.character.alternateModule) || b.character.module;
}
export function normalize(b: Build): Build {
  const p = profile(b);
  const level = Math.min(p.phases[b.elite].maxLevel, Math.max(1, Math.round(b.level)));
  const sk = p.skills.find((s) => s.slot === b.skill && s.elite <= b.elite);
  return {
    ...b,
    level,
    skill: sk?.slot ?? 0,
    rank: Math.min(b.rank, [4, 7, 10][b.elite], sk?.ranks.length ?? 10),
    stage: b.elite === 2 && level >= (selectedModule(b)?.level ?? Infinity) ? b.stage : 0,
  };
}
export const rankLabel = (n: number) => (n > 7 ? 'M' + (n - 7) : 'Lv ' + n);
export function buildLabel(b: Build) {
  return [
    'E' + b.elite + ' Lv ' + b.level,
    'P' + b.potential,
    b.skill ? 'S' + b.skill + ' ' + rankLabel(b.rank) : 'Normal attack',
    b.stage ? selectedModule(b)!.name + b.stage : 'No module',
  ].join(' · ');
}
export type DamageType = 'Physical' | 'Arts' | 'True' | 'Elemental';
function resist(amount: number, resistance: number) {
  return amount * Math.max(0.05, 1 - resistance / 100);
}
export function mitigate(amount: number, type: DamageType, target: Target) {
  switch (type) {
    case 'Physical':
      return Math.max(amount * 0.05, amount - target.def);
    case 'Arts':
      return resist(amount, target.res);
    case 'Elemental':
      return resist(amount, target.elementalRes);
    case 'True':
      return amount;
  }
}
export const threshold = (tier: Target['tier']) => (tier === 'Boss' ? 2000 : 1000);
export function burstThreshold(target: Target) {
  return target.thresholdOverride ?? threshold(target.tier);
}
export const hitsRequired = (gauge: number, amount: number) =>
  amount > 0 ? Math.ceil(gauge / amount - 1e-10) : null;
export function calculate(build: Build, t: Target, priorBursts = 0) {
  const b = normalize(build),
    p = profile(b),
    phase = p.phases[b.elite];
  const mod = selectedModule(b)?.stages[b.stage - 1];
  const potential = p.potential.slice(0, b.potential - 1);
  const potStat = (key: string) => potential.reduce((sum, x) => sum + (x[key] ?? 0), 0);
  const base =
    Math.round(phase.start + ((phase.end - phase.start) * (b.level - 1)) / Math.max(1, phase.maxLevel - 1)) +
    p.trust +
    potStat('ATK') +
    (mod?.stats.atk ?? 0);
  function talent(index: number): Values {
    const upgraded = mod?.talents[index];
    const candidates = upgraded?.length ? upgraded : (p.talents[index] ?? []);
    return (
      candidates
        .filter(
          (c) =>
            (c.elite < b.elite || (c.elite === b.elite && c.level <= b.level)) && c.potential <= b.potential,
        )
        .at(-1)?.values ?? {}
    );
  }
  const first = talent(0),
    second = talent(1);
  const skill = p.skills.find((s) => s.slot === b.skill)?.ranks[b.rank - 1] ?? {};
  let buff = ['philae', 'deepcl', 'folivo', 'lasher'].includes(p.id) ? 0 : (skill.atk ?? 0);
  if (['skadi', 'graceb'].includes(p.id)) buff += first.atk ?? 0;
  if (p.id === 'phatom' && b.skill === 2) buff += (skill.times - 1) * skill.atk;
  if (p.id === 'phatom' && b.traitActive) buff += mod?.trait.atk ?? 0;
  if (p.id === 'angel' || p.id === 'threye' || p.id === 'chen') buff += second.atk ?? 0;
  let speed = 100 + potStat('ATTACK_SPEED') + (mod?.stats.attack_speed ?? 0) + (skill.attack_speed ?? 0);
  if (p.id === 'skadi' && b.traitActive) speed += mod?.trait.attack_speed ?? 0;
  if (p.id === 'angel') {
    speed += first.attack_speed ?? 0;
    if (b.traitActive) speed += mod?.trait.attack_speed ?? 0;
  }
  if (p.id === 'melan') buff += first.atk ?? 0;
  if (p.id === 'kaitou' && t.burst === 'Necrosis') buff += first.atk ?? 0;
  if (p.id === 'hsgma2' && b.tenacity) buff += (second.min_atk ?? 0) + (second.atk ?? 0);
  if (p.id === 'threye') speed += second.attack_speed ?? 0;
  if (p.id === 'botany')
    speed +=
      Math.min(first.max_stack_cnt ?? 0, Math.max(priorBursts, t.burst === 'Corrosion' ? 1 : 0)) *
      (first.attack_speed ?? 0);
  if (p.id === 'qiubai' && b.skill === 3)
    speed += ((b.stacked ? skill.max_stack_cnt : 0) - 1) * skill.attack_speed;
  const burstAtk =
    p.id === 'thumpy' ? Math.min(priorBursts, second.max_stack_cnt ?? 0) * (second.atk ?? 0) : 0;
  const atk = (base + burstAtk) * (1 + buff);
  const interval =
    Math.max(
      1,
      Math.round(
        (30 * (phase.interval + (skill.base_attack_time ?? 0)) * 100) / Math.min(600, Math.max(10, speed)),
      ),
    ) / 30;
  const packet = (scale: number, type: DamageType) => mitigate(atk * scale, type, t);
  let primary: DamageType = [
    'ritualist',
    'primcaster',
    'corecaster',
    'blastcaster',
    'mystic',
    'summoner',
    'artsfghter',
  ].includes(p.branch)
    ? 'Arts'
    : 'Physical';
  if ((p.id === 'hsgma2' && b.skill) || (p.id === 'qiubai' && b.skill === 3)) primary = 'Arts';
  if (p.id === 'amiya' && b.skill === 3) primary = 'True';
  const hits = p.id === 'hsgma2' && b.skill === 3 ? (b.lastStand ? 4 : 2) : 1;
  const components: Record<DamageType, number> = { Physical: 0, Arts: 0, True: 0, Elemental: 0 };
  components[primary] =
    hits * packet(p.id === 'skadi' && b.traitActive ? (mod?.trait.atk_scale ?? 1) : 1, primary);
  if (p.id === 'hsgma2') components.Arts += hits * packet(mod?.trait.atk_scale ?? 0, 'Arts');
  if (p.id === 'qiubai') {
    if (b.control !== 'none') {
      components.Arts += packet(
        (first.atk_scale_t ?? first.atk_scale ?? 0) * (skill.talent_scale ?? 1),
        'Arts',
      );
      const amp = b.control === 'both' ? (first.value ?? 1) : 1;
      components[primary] *= amp;
      if (primary !== 'Arts') components.Arts *= amp;
    }
    components.Arts += packet(mod?.trait.atk_scale_m ?? 0, 'Arts');
  }
  let injury = 0,
    splash = 0,
    periodic = 0;
  let summon: { ticks: number; damage: number; injury: number; ticksToBurst: number | null } | null = null;
  let empowered: { damagePerHit: number; injuryPerHit: number; hits: number } | null = null;
  const scale = p.id === 'phatm2' && t.tier !== 'Grunt' ? (mod?.trait.ep_damage_scale ?? 1) : 1;
  const buildup = (raw: number) => (t.burst !== 'None' ? 0 : resist(raw * scale, t.injuryRes));
  if (p.id === 'phatm2') {
    injury = buildup(atk * (first['attack@ep_damage_ratio'] ?? 0));
    splash = buildup(atk * (first.ep_damage_ratio ?? 0));
    if (b.skill === 1) {
      // One empowered attack follows sp ordinary attacks (offensive recovery, no external SP).
      const cycle = 1 + skill.sp;
      empowered = {
        damagePerHit: packet(skill.atk_scale, 'Arts'),
        injuryPerHit: injury * skill.ep_damage_scale,
        hits: skill.times,
      };
      components.Arts = (skill.sp * components.Arts + skill.times * empowered.damagePerHit) / cycle;
      const boundNormals = Math.min(skill.sp, Math.max(0, Math.ceil(skill.unmove / interval) - 1));
      injury =
        (injury * (skill.sp + boundNormals * (skill.ep_damage_scale - 1)) +
          skill.times * empowered.injuryPerHit) /
        cycle;
      // Splash lands on adjacent, unbound enemies.
      splash *= (skill.sp + skill.times) / cycle;
    }
    if (b.skill === 2) {
      const ticks = Math.round(skill.buff_time / skill.interval_damage);
      const perTick = buildup(atk * skill.ep_damage_ratio_token);
      summon = {
        ticks,
        damage: ticks * packet(skill.atk_scale, 'Arts'),
        injury: ticks * perTick,
        ticksToBurst: hitsRequired(burstThreshold(t), perTick),
      };
    }
    if (b.skill === 3) periodic = buildup(atk * skill.ep_damage_ratio) / skill.interval;
  }
  const token = p.skills.find((s) => s.slot === b.skill)?.token;
  let sourceAtk = atk;
  let source = sourceAction({
    id: p.id,
    slot: b.skill,
    atk,
    interval,
    target: t,
    skill,
    talent: first,
    second,
    trait: mod?.trait ?? {},
    proc: b.lastStand,
    inRange: b.trapInRange,
    traitActive: b.traitActive,
    penetrationStacks: b.penetrationStacks ?? 0,
  });
  if (summon && b.plotSummon) {
    source = {
      parts: { Physical: 0, Arts: summon.damage / summon.ticks, True: 0, Elemental: 0 },
      injury: summon.injury / summon.ticks,
      name: 'Blood’s Whisper tick',
      cadence: skill.interval_damage,
      note: 'Tick rate only during the summon’s active damage window. Redeployment and lure travel are excluded.',
    };
    splash = 0;
  }
  if (token) {
    const phase = token.phases[b.elite];
    const tokenAtk =
      Math.round(
        phase.start + ((phase.end - phase.start) * (b.level - 1)) / Math.max(1, phase.maxLevel - 1),
      ) + (mod?.tokenStats[token.id]?.atk ?? 0);
    const tokenInterval =
      Math.max(
        1,
        Math.round(
          (30 * phase.interval * 100) /
            (100 + (skill.attack_speed ?? 0) + (mod?.tokenStats[token.id]?.attack_speed ?? 0)),
        ),
      ) / 30;
    const parts = { Physical: 0, Arts: 0, True: 0, Elemental: 0 };
    const usesOwner = (p.id === 'otter' && b.skill === 2) || (p.id === 'ling' && b.skill === 3);
    const type =
      usesOwner || p.id === 'ling' || (p.id === 'mgllan' && b.skill === 2) || p.id === 'lasher'
        ? 'Arts'
        : 'Physical';
    const oneUse = (p.id === 'otter' && b.skill === 2) || (p.id === 'ling' && b.skill === 2);
    const actorAtk = usesOwner ? atk : tokenAtk * (1 + (skill.atk ?? 0));
    sourceAtk = actorAtk;
    parts[type] = mitigate(actorAtk * (skill.atk_scale ?? 1), type, t);
    source = {
      parts,
      name: token.name + (oneUse ? ' activation' : usesOwner ? ' aura' : ' attack'),
      injury: 0,
      cadence: oneUse ? null : usesOwner ? skill.interval : tokenInterval,
      note:
        'One summon. ' +
        (usesOwner ? 'Scales from the owner’s ATK.' : 'Uses the summon’s own level-scaled ATK.') +
        ' Skill active.',
    };
  }
  if (source) {
    Object.assign(components, source.parts);
    injury = source.injury;
  }
  if (p.id === 'cello' && (b.skill === 1 || b.skill === 2)) {
    periodic =
      t.burst === 'None'
        ? atk *
          (first.ep_damage_ratio ?? 0) *
          (second.ep_damage_scale ?? 1) *
          (t.tier === 'Grunt' ? 1 : (mod?.trait.ep_damage_scale ?? 1)) *
          Math.max(0.05, 1 - t.injuryRes / 100)
        : 0;
  }
  const cadence = source ? source.cadence : interval;
  const damage = Object.values(components).reduce((sum, amount) => sum + amount, 0);
  return {
    base,
    firstTalent: first,
    atk,
    sourceAtk,
    effects: additionalEffects(p.id, b.skill, atk, skill, first, mod?.trait ?? {}, t),
    interval: cadence,
    attackInterval: interval,
    source: source?.name ?? (b.skill ? 'Skill attacks' : 'Normal attack'),
    note: source?.note ?? '',
    element: elements[p.id],
    components,
    damage,
    dps: cadence ? damage / cadence : null,
    injury,
    splash,
    injuryRate: cadence ? injury / cadence + periodic : null,
    periodic,
    summon,
    empowered,
    attacks: empowered ? null : hitsRequired(burstThreshold(t), injury),
  };
}
