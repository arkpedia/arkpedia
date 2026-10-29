/**
 * A game import, applied: what the account owns (lib/account/accountStore), and the planner's
 * roster and depot (lib/planner/gameAccount), all three replaced by what the account holds.
 * The planner's plans move their starts with the roster when it next reads it
 * (lib/planner/ownedSync.ts), and its goals stay. The pull history is added to, not replaced
 * (lib/account/pulls.ts): the read joins the pull archive's entry for this game account
 * (lib/account/pullArchive, by server and uid) and, when the import is the stored record's
 * player (samePlayer), that record's entry too, which is the same one unless the record was
 * written before the profile kept the uid. The record itself keeps only when the history was
 * last read. The account page calls it. Another server's record is never replaced: the shown
 * one, if it is another server's, waits under its own (accountStore OTHER_ACCOUNTS_KEY).
 */
import type { ImportAliases } from '@/lib/planner/foreignImport';
import { readGameAccount, type GameAccountMap, type TrainingCounted } from '@/lib/planner/gameAccount';
import { writeDepot } from '@/lib/planner/depot';
import { writeRoster } from '@/lib/planner/roster';
import type { ServerId } from '@/lib/account-import/yostar';
import { accountFromGame, storedAccount, storedOtherAccounts, writeAccount, writeOtherAccounts, type AccountRecord } from './accountStore';
import { mergePulls, type PullHistory, type PullRead } from './pulls';
import { accountArchiveKey, archiveFromAccount, archiveKey, unionPullHistory } from './pullArchive';
import { collectPullArchives, migrateLegacyPullRows, restorePullArchives } from './pullArchiveStore';
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
  /** The skill in the Training Room, counted as already trained (readGameAccount). */
  training?: TrainingCounted;
}

/** `pulls`: what this import read of the pull history, or null when it did not ask (a file).
 *  `server`: the one it was read from. */
export function importGameAccount(user: Record<string, any>, tables: ImportTables, pulls: PullRead | null, server: ServerId, now = new Date()): ImportResult {
  // Rows an older build left on the records join the archive first, so this read joins them.
  migrateLegacyPullRows();
  const imported = accountFromGame(user, tables.map, server, now);
  const shown = storedAccount(), others = { ...storedOtherAccounts() };
  // This server's earlier record, shown or waiting: its pull history is the one this joins.
  const earlier = shown?.server === server ? shown : others[server] ?? null;
  // What the archive kept of this player's history: this game account's entry, and the stored
  // record's when that is the same player under another key (a record with no uid).
  const keys = new Set([accountArchiveKey(imported), ...(samePlayer(earlier, imported) && earlier ? [accountArchiveKey(earlier)] : [])]);
  const kept = collectPullArchives(window.localStorage).filter((entry) => keys.has(archiveKey(entry)))
    .reduce<PullHistory | undefined>((joined, entry) => (joined ? unionPullHistory(joined, entry.history) : entry.history), undefined);
  const history = pulls ? mergePulls(kept, pulls, now) : undefined;
  // The record keeps when its history was last read: this read's result, or for an import that
  // did not ask (a file), what the same player's record said.
  const status = history ? { readAt: history.readAt, error: history.error } : samePlayer(earlier, imported) ? earlier?.pulls : undefined;
  const { roster, depot, training, unknown } = readGameAccount(user, tables.map, tables.aliases, tables.depotNames);
  const record: AccountRecord = { ...imported, operatorBuilds: roster, ...(status ? { pulls: status } : {}) };
  // The history goes to the archive, as a union, before the record it was read for is written.
  if (history) restorePullArchives([archiveFromAccount(record, history)]);
  // The import is shown; the record it takes the place of, if another server's, waits.
  delete others[server];
  if (shown && shown.server !== server) others[shown.server] = shown;
  writeOtherAccounts(others);
  writeAccount(record);
  // The site follows the account just imported, whatever server the nav showed before.
  rememberSiteServer(server);
  writeRoster(roster);
  writeDepot(depot);
  return { record, operators: Object.keys(roster).length, materials: Object.values(depot).filter((count) => count > 0).length, ...(training ? { training } : {}), unknown };
}
