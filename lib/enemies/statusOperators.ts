import { appliesEnemyStatus } from './statusSources';
import { isReleasedAt, type ReleaseMarker } from '@/lib/operators/operatorAvailability';
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

/** Every operator whose technique entry applies `status`, in the index's order. */
function statusOperators(groups: TechniqueGroup[]): [EnemyStatus, string, (EnemyStatusOperator & { entry: TechniqueGroup['entries'][number] })[]][] {
  const byName = new Map(groups.map(group => [group.name, group]));
  return (Object.entries(ENEMY_STATUS_TECHNIQUES) as [EnemyStatus, string][]).flatMap(([status, technique]) => {
    const group = byName.get(technique);
    if (!group) return [];
    const operators = group.entries
      .map(entry => ({ ...entry, badges: entry.badges.filter(badge => appliesEnemyStatus(status, badge.sourceText)) }))
      .filter(entry => entry.badges.length > 0)
      .map(entry => {
        const source = entry.badges[0];
        return {
          entry,
          name: entry.operatorName,
          icon: entry.operatorIconPath,
          sourceIcon: source?.skillIconPath ?? null,
          sourceTitle: source ? `${source.label}${status === 'Paralysis' ? ' — Paralysis on Nervous Impairment burst' : ''}` : null,
          sourceLabel: source ? `${source.skillNumber ? `Skill ${source.skillNumber}` : source.label.replace(/^T(\d+)$/, 'Talent $1')}${/\bin Integrated Strategies\b/i.test(source.sourceText || '') ? ' · Integrated Strategies' : ''}` : null,
        };
      });
    return [[status, technique, operators]];
  });
}

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
  const result: EnemyStatusOperatorMap = {};
  for (const [status, technique, all] of statusOperators(groups)) {
    const operators = all.filter(operator => !availableNames || availableNames.has(operator.name)).map(({ entry: _entry, ...operator }) => operator);
    if (operators.length) result[status] = { technique, total: operators.length, operators: operators.slice(0, limit) };
  }
  return result;
}

/** A status operator with its release marker, for choosing at the moment of reading. */
export interface EnemyStatusCandidate extends EnemyStatusOperator { release: ReleaseMarker }
export type EnemyStatusCandidates = Partial<Record<EnemyStatus, { technique: string; operators: EnemyStatusCandidate[] }>>;

/**
 * What the handbook exports: every operator who applies each status, released or not,
 * with the instant it counts as released. The export used to keep only the operators
 * released at that moment, so a new operator stayed off the list until the next
 * release. An operator with no date and a future flag can never be chosen, so it is
 * left out.
 */
export function buildEnemyStatusCandidates(groups: TechniqueGroup[], releases: ReadonlyMap<string, ReleaseMarker>): EnemyStatusCandidates {
  const result: EnemyStatusCandidates = {};
  for (const [status, technique, all] of statusOperators(groups)) {
    const operators = all.flatMap(({ entry: _entry, ...operator }) => {
      const release = releases.get(operator.name);
      return release && (release.releasedAt !== null || !release.isFuture) ? [{ ...operator, release }] : [];
    });
    if (operators.length) result[status] = { technique, operators };
  }
  return result;
}

/** buildEnemyStatusOperatorMap's result for the operators released at `now`. */
export function selectEnemyStatusOperators(candidates: EnemyStatusCandidates, now: number, limit = 4): EnemyStatusOperatorMap {
  const result: EnemyStatusOperatorMap = {};
  for (const [status, group] of Object.entries(candidates) as [EnemyStatus, NonNullable<EnemyStatusCandidates[EnemyStatus]>][]) {
    const operators = group.operators.filter(operator => isReleasedAt(operator.release, now)).map(({ release: _release, ...operator }) => operator);
    if (operators.length) result[status] = { technique: group.technique, total: operators.length, operators: operators.slice(0, limit) };
  }
  return result;
}
