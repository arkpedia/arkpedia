/**
 * A game import, applied: what the account owns (lib/account/accountStore), and the planner's
 * roster and depot (lib/planner/gameAccount), all three replaced by what the account holds.
 * The planner's plans move their starts with the roster when it next reads it
 * (lib/planner/ownedSync.ts), and its goals stay. The account page calls it.
 */
import type { ImportAliases } from '@/lib/planner/foreignImport';
import { readGameAccount, type GameAccountMap } from '@/lib/planner/gameAccount';
import { writeDepot } from '@/lib/planner/depot';
import { writeRoster } from '@/lib/planner/roster';
import { accountFromGame, writeAccount, type AccountRecord } from './accountStore';

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

export function importGameAccount(user: Record<string, any>, tables: ImportTables, now = new Date()): ImportResult {
  const record = accountFromGame(user, tables.map, now);
  const { roster, depot, unknown } = readGameAccount(user, tables.map, tables.aliases, tables.depotNames);
  writeAccount(record);
  writeRoster(roster);
  writeDepot(depot);
  return { record, operators: Object.keys(roster).length, materials: Object.values(depot).filter((count) => count > 0).length, unknown };
}
