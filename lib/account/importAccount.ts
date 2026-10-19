/**
 * A game import, applied: what the account owns (lib/account/accountStore), and the planner's
 * roster and depot (lib/planner/gameAccount), all three replaced by what the account holds.
 * The planner's plans move their starts with the roster when it next reads it
 * (lib/planner/ownedSync.ts), and its goals stay. The pull history is added to, not replaced
 * (lib/account/pulls.ts), when the import is the same player's (samePlayer). The account page
 * calls it. Another server's record is never replaced: the shown one, if it is another server's,
 * waits under its own (accountStore OTHER_ACCOUNTS_KEY), and this server's own earlier record is
 * the one whose pull history this import joins.
 */
import type { ImportAliases } from '@/lib/planner/foreignImport';
import { readGameAccount, type GameAccountMap } from '@/lib/planner/gameAccount';
import { writeDepot } from '@/lib/planner/depot';
import { writeRoster } from '@/lib/planner/roster';
import type { ServerId } from '@/lib/account-import/yostar';
import { accountFromGame, storedAccount, storedOtherAccounts, writeAccount, writeOtherAccounts, type AccountRecord } from './accountStore';
import { mergePulls, type PullRead } from './pulls';
import { rememberSiteServer } from '@/lib/time/siteServer';

/**
 * Whether an import is the stored account's player: the same server, and the same game uid when
 * both records know it (a record from before the profile kept none). Only then does the pull
 * history kept so far join the new one; another server's or another account's pulls never do.
 */
export function samePlayer(stored: AccountRecord | null, imported: AccountRecord): boolean {
  if (!stored || stored.server !== imported.server) return false;
  const was = stored.profile?.uid ?? null, is = imported.profile?.uid ?? null;
  return was === null || is === null || was === is;
}

export interface ImportTables {
  map: GameAccountMap;
  aliases: ImportAliases;
  /** Every material the planner's depot tracks. */
  depotNames: string[];
}

export interface ImportResult {
  record: AccountRecord;
  operators: number;
  materials: number;
  /** Character ids no record answers to yet. */
  unknown: string[];
}

/** `pulls`: what this import read of the pull history, or null when it did not ask (a file).
 *  `server`: the one it was read from. */
export function importGameAccount(user: Record<string, any>, tables: ImportTables, pulls: PullRead | null, server: ServerId, now = new Date()): ImportResult {
  const imported = accountFromGame(user, tables.map, server, now);
  const shown = storedAccount(), others = { ...storedOtherAccounts() };
  // This server's earlier record, shown or waiting: its pull history is the one this joins.
  const earlier = shown?.server === server ? shown : others[server] ?? null;
  const history = mergePulls(samePlayer(earlier, imported) ? earlier?.pulls : undefined, pulls, now);
  const { roster, depot, unknown } = readGameAccount(user, tables.map, tables.aliases, tables.depotNames);
  const record: AccountRecord = { ...imported, operatorBuilds: roster, ...(history ? { pulls: history } : {}) };
  // The import is shown; the record it takes the place of, if another server's, waits.
  delete others[server];
  if (shown && shown.server !== server) others[shown.server] = shown;
  writeOtherAccounts(others);
  writeAccount(record);
  // The site follows the account just imported, whatever server the nav showed before.
  rememberSiteServer(server);
  writeRoster(roster);
  writeDepot(depot);
  return { record, operators: Object.keys(roster).length, materials: Object.values(depot).filter((count) => count > 0).length, unknown };
}
