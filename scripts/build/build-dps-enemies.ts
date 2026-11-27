// Compile a small fallback that a cold Worker can read before its content release includes the page.
import { writeFileSync } from 'node:fs';
import { enemyTargets } from '../../lib/dps/enemyTargets';
import { deploymentAllies } from '../../lib/dps/deploymentAllies';
import { getEnemyBundles } from '../../lib/enemies/enemies';
import type { EnemyLevel } from '../../lib/enemies/enemyTypes';
import { getAllOperators } from '../../lib/operators/operators';
import { getSkillList } from '../../lib/operators/operatorTypes';
import type { DamageRecovery } from '../../lib/dps/skillCasts';
import { survivalRosterVersion } from '../../lib/dps/survivalRoster';
import type { AttackType, Attacker, CalculatorRoster, DefenderSkillRank, EnemyAbility, PatriotStances, SurvivalRoster } from '../../lib/dps/survivalRoster';

const catalogue = getEnemyBundles().flatMap(bundle => bundle.enemies);
const targets = enemyTargets();
writeFileSync('public/dps-roster.json', JSON.stringify({
  operators: deploymentAllies(),
  enemyIcons: Object.fromEntries(catalogue.flatMap(enemy => enemy.icon ? [[enemy.id, enemy.icon]] : [])),
} satisfies CalculatorRoster) + '\n');
writeFileSync('data/dps-enemy-presets.json', JSON.stringify(targets) + '\n');

const enemySkills: Record<string, { key: string; name: string; type: AttackType; mode: EnemyAbility['mode'] }> = {
  enemy_1508_faust: { key: 'CriticalHit', name: 'Special bolt', type: 'Physical', mode: 'next-hit' },
  enemy_1504_cqbw: { key: 'C4', name: 'C4', type: 'Physical', mode: 'separate' },
  enemy_1505_frstar: { key: 'ArcticBlast', name: 'Ice Nova', type: 'Arts', mode: 'separate' },
  enemy_1513_dekght: { key: 'ChargeAttack', name: 'Charged attack', type: 'Physical', mode: 'charge' },
};

function patriotStances(level: EnemyLevel, atk: number, period: number, speed: number): PatriotStances | undefined {
  const marching = level.talents.find(talent => talent.key === 'shield')?.parameters.atk;
  const command = level.talents.find(talent => talent.key === 'strength')?.parameters.atk;
  const ruination = level.talents.find(talent => talent.key === 'immo_trigger[rage]')?.parameters;
  const revival = level.skills.find(skill => skill.key === 'immo_trigger[reborning]')?.parameters;
  const revivesIn = level.talents.find(talent => talent.key === 'reborn')?.parameters.duration;
  const aura = level.skills.find(skill => skill.key === 'Immo[Rage]')?.parameters.atk_scale;
  const spear = level.skills.find(skill => skill.key === 'throwspear[Rage]');
  const scale = spear?.parameters.atk_scale;
  if (typeof marching !== 'number' || typeof command !== 'number' || typeof ruination?.atk !== 'number'
    || typeof ruination.base_attack_time !== 'number' || typeof ruination.interval !== 'number' || ruination.interval <= 0
    || typeof aura !== 'number' || typeof scale !== 'number' || !spear || spear.initial_cooldown == null || !spear.cooldown) return undefined;
  if (typeof revival?.atk !== 'number' || typeof revivesIn !== 'number' || revivesIn <= 0
    || typeof revival.interval !== 'number' || revival.interval <= 0) return undefined;
  return {
    marchingAtk: atk * (1 + command + marching),
    ruinationAtk: atk * (1 + ruination.atk),
    ruinationInterval: Math.max(1, Math.round((period + ruination.base_attack_time) * 3000 / speed)) / 30,
    revival: { atk: atk * (1 + revival.atk), duration: revivesIn, interval: revival.interval },
    aura: { name: 'True damage aura', type: 'True', mode: 'aura', scale: aura,
      firstReady: ruination.interval, cooldown: ruination.interval, delay: 0 },
    spear: { name: 'Spear throw', type: 'Physical', mode: 'separate', scale,
      firstReady: spear.initial_cooldown, cooldown: spear.cooldown, delay: 3 },
  };
}

const attackers = new Map<string, Attacker>(catalogue.flatMap(enemy => {
  const types = enemy.damage_type.filter((type): type is AttackType => type === 'Physical' || type === 'Arts');
  const reviewed = enemySkills[enemy.id];
  const levels = enemy.levels.flatMap(row => {
    const { level, stats, skills } = row;
    const { atk, attack_interval: period, attack_speed: speed } = stats;
    if (!(atk && atk > 0 && period && period > 0 && speed && speed > 0)) return [];
    const skill = reviewed && skills.find(skill => skill.key === reviewed.key);
    const scale = skill?.parameters.atk_scale;
    const delay = reviewed?.key === 'C4' ? 3 : skill?.parameters.duration;
    const ability = reviewed && skill && typeof scale === 'number' && scale > 0
      && skill.initial_cooldown !== null && skill.cooldown !== null && skill.cooldown > 0 ? {
        name: reviewed.name, type: reviewed.type, mode: reviewed.mode, scale,
        firstReady: skill.initial_cooldown, cooldown: skill.cooldown,
        delay: (reviewed.mode === 'charge' || reviewed.key === 'C4') && typeof delay === 'number' ? delay : 0,
      } : undefined;
    const patriot = enemy.id === 'enemy_1506_patrt' ? patriotStances(row, atk, period, speed) : undefined;
    return [{ level, atk, interval: Math.max(1, Math.round(period * 3000 / speed)) / 30, ability, patriot }];
  });
  return types.length && levels.length && enemy.attack_position
    ? [[enemy.id, { id: enemy.id, name: enemy.name, code: enemy.index, types, levels }] as const]
    : [];
}));
const enemies = targets.map(({ id, name, code }) => attackers.get(id) ?? { id, name, code, types: [], levels: [] });

// Use the reviewed parts of each effect on the defending operator. Outgoing
// damage, changes in targeting, and the operator's talents are outside this model.
const reviewedSlots: Record<string, number[]> = {
  char_150_snakek: [2], char_136_hsguma: [1, 2, 3], char_199_yak: [1, 2],
  char_381_bubble: [2], char_325_bison: [2],
  char_4123_ela: [2], char_4088_hodrer: [1], char_311_mudrok: [2],
  char_1044_hsgma2: [1], char_2026_yu: [1], char_4207_branch: [1],
};
const healingStrikes = new Set(['char_4088_hodrer:1', 'char_311_mudrok:2']);
const recoveryKinds = new Map<string, DamageRecovery['kind']>([
  ['Auto Recovery', 'time'], ['Offensive Recovery', 'attack'], ['Defensive Recovery', 'hit'],
]);

const operators = getAllOperators().flatMap(op => {
  if (!op.internalName || !op.stats?.phases.length) return [];
  const statKeys = { 'Max HP': 'hp', DEF: 'def', RES: 'res', 'DP cost': 'dp', ASPD: 'aspd', 'Attack Speed': 'aspd' } as const;
  const potential = (op.potential?.levels ?? []).map(({ benefit }) => {
    for (const [label, key] of Object.entries(statKeys)) {
      const match = benefit.match(new RegExp('^' + label + '\\s*([+-]\\s*\\d+)', 'i'));
      if (match) return { [key]: Number(match[1].replace(/\s/g, '')) };
    }
    return {};
  });
  const blocksDirectHealing = ['Juggernaut', 'Reaper', 'Soloblade'].includes(op.branch ?? '');
  const skills = getSkillList(op).flatMap((skill, i) => {
    const slot = i + 1;
    if (!skill.name || (!reviewedSlots[op.internalName!]?.includes(slot) && !/^DEF Up [αβγ]$/.test(skill.name))) return [];
    const kind = recoveryKinds.get(skill.recoveryType ?? '');
    const healsOnAttack = healingStrikes.has(`${op.internalName}:${slot}`);
    const ranks = skill.levels.map(level => {
      const desc = level.description ?? '';
      const percent = (stat: string) => {
        const value = desc.match(new RegExp('\\b' + stat + '\\s*(?:by\\s*)?\\+([\\d.]+)%', 'i'))?.[1];
        return value === undefined ? undefined : Number(value) / 100;
      };
      const regen = desc.match(/Restores HP by ([\d.]+)(% of Max HP)? per second/i);
      const strikeHeal = healsOnAttack ? desc.match(/restores\s+(?:HP by\s+)?([\d.]+)%/i)?.[1] : undefined;
      const cost = Number(level.spCost), initial = Number(level.initialSp);
      const sp = kind && level.initialSp !== null && cost > 0 && Number.isFinite(cost) && Number.isFinite(initial)
        ? { cost, initial, kind } : undefined;
      return {
        def: percent('DEF'), res: percent('RES'), hp: percent('Max HP'),
        regeneration: regen && !regen[2] ? Number(regen[1]) : undefined,
        regenerationRatio: regen?.[2] ? Number(regen[1]) / 100 : undefined,
        healOnAttack: strikeHeal === undefined ? undefined : Number(strikeHeal) / 100,
        duration: healsOnAttack ? 0 : level.duration === null ? null : Number(level.duration),
        sp,
      } satisfies DefenderSkillRank;
    });
    return ranks.length && ranks.every(rank => rank.healOnAttack && rank.sp
      || (rank.def || rank.res || rank.hp || rank.regeneration || rank.regenerationRatio)
        && (rank.duration === null || Number.isFinite(rank.duration) && rank.duration > 0))
      ? [{ slot, name: skill.name, ranks }] : [];
  });
  return [{ id: op.internalName, name: op.name, stats: op.stats, potential, blocksDirectHealing,
    ranged: op.position === 'Ranged' || undefined, ...(skills.length ? { skills } : {}) }];
});

writeFileSync('public/dps-survival.json', JSON.stringify({ version: survivalRosterVersion, enemies, operators } satisfies SurvivalRoster) + '\n');
