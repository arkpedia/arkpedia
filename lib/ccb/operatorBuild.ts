import {
  applyModuleStatBonuses,
  clampInteger,
  getBaseStats,
  getTrustBonus,
  parseModuleStatBonuses,
  type StatValues,
} from '@/lib/operators/operatorStats';
import type { Owned } from '@/lib/planner/roster';
import { modifiedStats } from './modifiers';
import type { TeamBuild } from './teamPreset';
import type { Contract, OperatorBuildData } from './types';

export function accountBuild(operator: OperatorBuildData, owned?: Owned): TeamBuild {
  const upgradeSlots = operator.modules.flatMap((row, index) => row.type === 'Upgrade' ? [index] : []);
  const equipped = owned?.equippedModule;
  return {
    elite: owned?.elite ?? 0,
    level: owned?.level ?? 1,
    potential: owned?.potential ?? 1,
    trust: owned?.trust ?? 0,
    moduleIndex: equipped == null ? -1 : upgradeSlots[equipped] ?? -1,
    moduleStage: equipped == null ? 0 : owned?.modules?.[equipped] ?? 0,
    tile: null,
    elapsed: 0,
  };
}

const POTENTIAL_STATS: Record<string, keyof StatValues | 'aspd'> = {
  'dp cost': 'dp',
  'redeployment time': 'redeploy',
  atk: 'atk',
  def: 'def',
  hp: 'hp',
  'max hp': 'hp',
  res: 'res',
  'attack speed': 'aspd',
  aspd: 'aspd',
};

export function calculateOperatorBuild(operator: OperatorBuildData, build: TeamBuild, contracts: Contract[]) {
  const stats = operator.stats;
  const phase = stats?.phases.find(row => row.elite === build.elite) ?? stats?.phases[0];
  if (!stats || !phase) return null;

  const level = clampInteger(build.level, phase.minLevel, phase.maxLevel);
  const base = getBaseStats(phase, level);
  const bonus = getTrustBonus(stats, build.trust);
  for (const key of ['hp', 'atk', 'def'] as const) base[key] += bonus[key];

  let potentialAspd = 0;
  for (const row of operator.potential.levels) {
    if (row.level > build.potential) continue;
    const match = row.benefit.match(/^(DP cost|Redeployment time|ATK|DEF|Max HP|HP|RES|Attack Speed|ASPD)\s*([+-])\s*(\d+(?:\.\d+)?)/i);
    if (!match) continue;
    const key = POTENTIAL_STATS[match[1].toLowerCase()];
    const amount = Number(match[3]) * (match[2] === '-' ? -1 : 1);
    if (key === 'aspd') potentialAspd += amount;
    else base[key] += amount;
  }

  const moduleMinLevel = operator.rarity === 6 ? 60 : operator.rarity === 5 ? 50 : 40;
  const moduleAvailable = phase.elite === 2 && level >= moduleMinLevel;
  const selectedModule = operator.modules[build.moduleIndex];
  const activeModule = moduleAvailable && selectedModule?.type === 'Upgrade' ? selectedModule : undefined;
  const moduleStage = activeModule ? clampInteger(build.moduleStage, 0, Math.max(0, activeModule.stages.length - 1)) : 0;
  const moduleBonuses = parseModuleStatBonuses(activeModule?.stages[moduleStage]?.attributesIncreased);
  const aspd = potentialAspd + (moduleBonuses.aspd ?? 0);
  const original = { ...applyModuleStatBonuses(base, { ...moduleBonuses, aspd }), aspd: 100 + aspd };
  const home = operator.position === 'Ranged' ? 'high' : 'ground';
  const tile = operator.bothTiles ? build.tile ?? home : home;
  const modified = modifiedStats(original, contracts, { side: 'operator', className: operator.className, tile, elapsed: build.elapsed });
  return { phase, level, moduleMinLevel, moduleAvailable, activeModule, moduleStage, tile, original, modified };
}
