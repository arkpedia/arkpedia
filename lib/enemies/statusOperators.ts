import { appliesEnemyStatus } from './statusSources';
import type { TechniqueGroup } from '@/lib/techniques/buildTechniqueGroups';

// The panel and source lookup share this vocabulary, so a displayed status
// cannot silently omit its operator mapping.
export const ENEMY_STATUSES = ['Stun', 'Silence', 'Sleep', 'Frozen', 'Levitate', 'Fear', 'Lure', 'Disarm', 'Paralysis'] as const;
export type EnemyStatus = typeof ENEMY_STATUSES[number];

export const ENEMY_STATUS_TECHNIQUES = {
  Stun: 'Stun',
  Silence: 'Silence',
  Sleep: 'Sleep',
  Frozen: 'Cold / Freeze',
  Levitate: 'Levitate',
  Fear: 'Fear',
  Lure: 'Lure',
  Disarm: 'Frighten',
  Paralysis: 'Nervous Impairment',
} as const satisfies Record<EnemyStatus, string>;

export interface EnemyStatusOperator {
  name: string;
  icon: string;
  sourceIcon: string | null;
  sourceLabel: string | null;
  sourceTitle?: string | null;
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
    const entries = group.entries
      .filter(entry => !availableNames || availableNames.has(entry.operatorName))
      .map(entry => ({ ...entry, badges: entry.badges.filter(badge => appliesEnemyStatus(status, badge.sourceText)) }))
      .filter(entry => entry.badges.length > 0);
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
          sourceTitle: source ? `${source.label}${status === 'Paralysis' ? ' — Paralysis on Nervous Impairment burst' : ''}` : null,
          sourceLabel: source ? `${source.skillNumber ? `S${source.skillNumber}` : source.label}${/\bin Integrated Strategies\b/i.test(source.sourceText || '') ? ' · Integrated Strategies' : ''}` : null,
        };
      }),
    };
  }

  return result;
}
