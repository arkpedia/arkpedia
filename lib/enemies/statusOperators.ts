import type { TechniqueGroup } from '@/lib/techniques/buildTechniqueGroups';

export const ENEMY_STATUS_TECHNIQUES = {
  Stun: 'Stun',
  Silence: 'Silence',
  Sleep: 'Sleep',
  Frozen: 'Cold / Freeze',
  Levitate: 'Levitate',
  Fear: 'Fear',
  Lure: 'Lure',
} as const;

export type EnemyStatus = keyof typeof ENEMY_STATUS_TECHNIQUES;

export interface EnemyStatusOperator {
  name: string;
  icon: string;
  sourceIcon: string | null;
  sourceLabel: string | null;
}

export interface EnemyStatusOperatorGroup {
  technique: string;
  total: number;
  operators: EnemyStatusOperator[];
}

export type EnemyStatusOperatorMap = Partial<Record<EnemyStatus, EnemyStatusOperatorGroup>>;

/**
 * Builds the compact status-to-operator payload used by the enemy handbook.
 * The technique index remains the source of truth, so the handbook cannot drift
 * into a second manually maintained list of who applies each status.
 */
export function buildEnemyStatusOperatorMap(
  groups: TechniqueGroup[],
  availableNames?: ReadonlySet<string>,
  limit = 4,
): EnemyStatusOperatorMap {
  const byName = new Map(groups.map(group => [group.name, group]));
  const result: EnemyStatusOperatorMap = {};

  for (const [status, technique] of Object.entries(ENEMY_STATUS_TECHNIQUES) as [EnemyStatus, string][]) {
    const group = byName.get(technique);
    if (!group) continue;
    const entries = availableNames
      ? group.entries.filter(entry => availableNames.has(entry.operatorName))
      : group.entries;
    if (!entries.length) continue;
    result[status] = {
      technique,
      total: entries.length,
      operators: entries.slice(0, limit).map(entry => {
        const source = entry.badges[0];
        return {
          name: entry.operatorName,
          icon: entry.operatorIconPath,
          sourceIcon: source?.skillIconPath ?? null,
          sourceLabel: source?.label ?? null,
        };
      }),
    };
  }

  return result;
}
