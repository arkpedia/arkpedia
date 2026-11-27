import { getAllOperators } from '../operators/operators';
import { getOperatorIconPath } from '../operators/operatorIcon';
import { getSkillList, type Operator } from '../operators/operatorTypes';
import type { Profile } from './calculator';

function basicAttack(op: Operator): Profile['basicAttack'] {
  if (['Bard', 'Phalanx Caster', 'Liberator'].includes(op.branch ?? '')) return 'None';
  if (op.class === 'Medic') return op.branch === 'Incantation Medic' ? 'Arts' : 'Healing';
  if (op.class === 'Caster' || op.class === 'Supporter' && op.branch !== 'Artificer' || op.branch === 'Arts Fighter') return 'Arts';
  return 'Physical';
}

function skillTiming(op: Operator): Profile['skillTiming'] {
  const entries = getSkillList(op).flatMap((skill, i): [number, 'manual' | 'auto'][] => {
    if (skill.recoveryType !== 'Auto Recovery') return [];
    if (skill.activationType === 'Auto') return [[i + 1, 'auto']];
    if (skill.activationType === 'Manual') return [[i + 1, 'manual']];
    return [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// Shared ATK Up skills have one effect that can be verified at every rank.
function basicSkills(op: Operator): Profile['skills'] {
  return getSkillList(op).flatMap((skill, i) => {
    if (!skill.name || !/^(?:ATK|Healing) Up [αβγ]$/.test(skill.name)
      || skill.recoveryType !== 'Auto Recovery' || skill.activationType !== 'Manual' || !skill.levels.length) return [];
    const ranks = skill.levels.map(level => {
      const atk = level.description?.trim().match(/^ATK \+([\d.]+)%\.?$/i)?.[1];
      const duration = Number(level.duration), sp = Number(level.spCost), initialSp = Number(level.initialSp);
      return atk !== undefined && duration > 0 && sp > 0 && level.initialSp !== null && Number.isFinite(initialSp)
        ? { atk: Number(atk) / 100, duration, sp, initialSp } : null;
    });
    return ranks.every(rank => rank !== null)
      ? [{ slot: i + 1, name: skill.name, elite: i, ranks, manual: true, token: null }] : [];
  });
}

export function deploymentAllies(): Profile[] {
  return getAllOperators().flatMap((op) => {
    if (!op.internalName || !op.stats?.phases.length) return [];
    return [
      {
        id: op.internalName.split('_').at(-1)!,
        name: op.name,
        region: op.sourceRegion === 'CN' ? 'CN' : 'EN',
        rarity: op.rarity ?? 1,
        branch: op.branch ?? '',
        subclass: op.branch || undefined,
        icon: getOperatorIconPath(op),
        aliases: op.aliases,
        basicAttack: basicAttack(op),
        skillTiming: skillTiming(op),
        trust: op.stats.trust.atk,
        phases: op.stats.phases.map((p) => ({
          maxLevel: p.maxLevel,
          start: p.base.atk,
          end: p.max.atk,
          interval: p.base.interval,
        })),
        potential: (op.potential?.levels ?? []).map((p): Record<string, number> => {
          const match = p.benefit.match(/^(ATK|ASPD|Attack Speed)\s*\+\s*(\d+)/i);
          return match ? { [match[1].toUpperCase() === 'ATK' ? 'ATK' : 'ATTACK_SPEED']: Number(match[2]) } : {};
        }),
        skills: basicSkills(op),
        talents: [],
        module: null,
        alternateModule: null,
      } satisfies Profile,
    ];
  });
}
