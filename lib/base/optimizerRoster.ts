import type { AccountRecord } from '@/lib/account/accountStore';
import type { OwnedOperator } from './baseOptimizer';

const ELITES = ['Base', 'Elite 1', 'Elite 2'] as const;

/**
 * The operators an import says the reader owns, each at the promotion and level base
 * skills unlock from. In order of trust: the import's base snapshot (every owned
 * operator's progress), the account's build snapshot. An owned
 * operator none of them describes is placed at Elite 0 level 1, the conservative
 * reading, and named in `assumed` so the page can say so.
 */
export function ownedBaseRoster(account: Pick<AccountRecord, 'operators' | 'base' | 'operatorBuilds'>, known: ReadonlySet<string>): { roster: Record<string, OwnedOperator>; assumed: string[] } {
  const roster: Record<string, OwnedOperator> = {};
  const assumed: string[] = [];
  // Amiya's class forms are one physical base worker.
  for (const name of new Set(account.operators.map(n => /^Amiya \(/.test(n) ? 'Amiya' : n))) {
    if (!known.has(name)) continue;
    const imported = account.base?.operatorProgress?.[name];
    // The planner can contain another server's builds or hypothetical promotions.
    // Only the selected account's own snapshots can unlock optimizer skills.
    const build = account.operatorBuilds?.[name];
    if (imported && (ELITES as readonly string[]).includes(imported.eliteLevel)) roster[name] = { eliteLevel: imported.eliteLevel as OwnedOperator['eliteLevel'], level: imported.level };
    else if (build) roster[name] = { eliteLevel: ELITES[Math.min(2, Math.max(0, build.elite))], level: build.level };
    else { roster[name] = { eliteLevel: 'Base', level: 1 }; assumed.push(name); }
  }
  return { roster, assumed };
}
