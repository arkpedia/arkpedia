/**
 * The pull archive: the one store of the reader's headhunting history, one entry per game
 * account (server and uid) under arkpediaPullArchives, kept past Yostar's 90 days and with its
 * own cloud consent. The account record keeps only when its history was last read
 * (lib/account/accountStore pulls). An import adds its read to the entry (lib/account/importAccount);
 * the Account page shows an entry (components/account/PullHistory). A record an older build
 * wrote still carries its rows in `pulls.rows`: legacyArchives reads them off the stored text,
 * for the one-time move into the archive (lib/account/pullArchiveStore).
 */
import { parseAccount, type AccountRecord } from './accountStore';
import { parsePullHistory, type PullHistory, type PullRecord } from './pulls';
import type { ServerId } from '@/lib/account-import/yostar';

export const PULL_ARCHIVE_KEY = 'arkpediaPullArchives';
export const PULL_ARCHIVE_EVENT = 'arkpedia:pull-archives';
export interface PullArchive { server: ServerId; uid: string; doctor: string | null; history: PullHistory; savedAt?: string }
export const archiveKey = (archive: Pick<PullArchive, 'server' | 'uid'>) => `${archive.server}:${archive.uid}`;
/** The archive entry an account record's history is kept under: a record from before the
 *  profile kept the uid is 'unknown'. */
export const accountArchiveKey = (account: Pick<AccountRecord, 'server' | 'profile'>) => archiveKey({ server: account.server, uid: account.profile?.uid || 'unknown' });
const rowKey = (row: PullRecord) => `${row.at}|${row.pool}|${row.char}`;

/** A multiset union: repeated operators within a batch survive, repeated imports don't grow it.
 * Keep every known draw even if another device only knows part of the same batch. */
export function unionPullHistory(left: PullHistory, right: PullHistory): PullHistory {
  const counts = new Map<string, number>(), seen = new Map<string, number>(), rows = [...left.rows];
  for (const row of left.rows) counts.set(rowKey(row), (counts.get(rowKey(row)) ?? 0) + 1);
  for (const row of right.rows) {
    const key = rowKey(row), occurrence = (seen.get(key) ?? 0) + 1; seen.set(key, occurrence);
    if (occurrence > (counts.get(key) ?? 0)) rows.push(row);
  }
  const latest = (right.readAt ?? '') >= (left.readAt ?? '') ? right : left;
  return { rows: rows.sort((a, b) => b.at - a.at),
    pools: { ...left.pools, ...right.pools }, names: { ...left.names, ...right.names }, readAt: latest.readAt, error: latest.error };
}

export function parsePullArchives(value: unknown): PullArchive[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Invalid pull archive accounts.');
  const result: PullArchive[] = [];
  for (const entry of value) {
    if (!entry || !['en', 'jp', 'kr'].includes(entry.server) || typeof entry.uid !== 'string' || !/^(?:\d{1,32}|unknown)$/.test(entry.uid)) throw new Error('Pull archives require an imported game UID and server.');
    const history = parsePullHistory(entry.history);
    if (!history || history.rows.length !== entry.history.rows.length) throw new Error('Invalid pull archive rows.');
    result.push({ server: entry.server, uid: entry.uid, doctor: typeof entry.doctor === 'string' ? entry.doctor.slice(0, 100) : null, history });
  }
  return mergePullArchives([], result);
}

export function mergePullArchives(left: PullArchive[], right: PullArchive[]): PullArchive[] {
  const merged = new Map(left.map(entry => [archiveKey(entry), entry]));
  for (const entry of right) {
    const key = archiveKey(entry), old = merged.get(key);
    merged.set(key, old ? { ...entry, doctor: entry.doctor ?? old.doctor, history: unionPullHistory(old.history, entry.history) } : entry);
  }
  return [...merged.values()].sort((a, b) => archiveKey(a).localeCompare(archiveKey(b)));
}

/** An account's history as its archive entry. */
export function archiveFromAccount(account: Pick<AccountRecord, 'server' | 'doctor' | 'profile'>, history: PullHistory): PullArchive {
  return parsePullArchives([{ server: account.server, uid: account.profile?.uid || 'unknown', doctor: account.doctor, history }])[0];
}

/**
 * The rows that account records written before the archive was the one store still carry
 * (`pulls.rows`), as archive entries. Takes the stored values as parsed JSON (the shown record
 * and the other servers' map), not AccountRecords: parseAccount keeps only the read status.
 * Empty once the rows have moved (migrateLegacyPullRows), and for records with none.
 */
export function legacyArchives(account: unknown, others: unknown): PullArchive[] {
  const values = [account, ...(others && typeof others === 'object' && !Array.isArray(others) ? Object.values(others as Record<string, unknown>) : [])];
  return mergePullArchives([], values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const history = parsePullHistory((value as Record<string, unknown>).pulls);
    if (!history?.rows.length) return [];
    const record = parseAccount(JSON.stringify(value));
    return record ? [archiveFromAccount(record, history)] : [];
  }));
}

/** Whether a stored record (or map of records) still carries pull rows. */
export function carriesPullRows(value: unknown): boolean {
  return !!value && typeof value === 'object' && Array.isArray(((value as Record<string, unknown>).pulls as Record<string, unknown> | undefined)?.rows);
}

export function archiveStatus(archive: PullArchive) {
  const times = archive.history.rows.map(row => row.at);
  return { count: times.length, oldest: times.length ? times.reduce((min, time) => Math.min(min, time), Infinity) : null,
    newest: times.length ? times.reduce((max, time) => Math.max(max, time), 0) : null, readAt: archive.history.readAt };
}

/** Upload only previously unknown multiplicities. Whole batch/character groups stay together. */
export function archiveUploadChunks(local: PullArchive[], cloud: PullArchive[]): PullArchive[][] {
  const chunks: PullArchive[][] = [];
  for (const archive of local) {
    const remote = cloud.find(other => archiveKey(other) === archiveKey(archive));
    const counts = new Map<string, number>();
    for (const row of remote?.history.rows ?? []) counts.set(rowKey(row), (counts.get(rowKey(row)) ?? 0) + 1);
    const groups = new Map<string, PullRecord[]>();
    for (const row of archive.history.rows) { const key = rowKey(row); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(row); }
    let rows: PullRecord[] = [];
    const push = () => {
      const pools = Object.fromEntries([...new Set(rows.map(row => row.pool))].filter(key => archive.history.pools[key]).map(key => [key, archive.history.pools[key]]));
      const names = Object.fromEntries([...new Set(rows.map(row => row.char))].filter(key => archive.history.names[key]).map(key => [key, archive.history.names[key]]));
      chunks.push([{ server: archive.server, uid: archive.uid, doctor: archive.doctor, history: { rows, pools, names, readAt: archive.history.readAt, error: null } }]); rows = [];
    };
    for (const [key, group] of groups) if (group.length > (counts.get(key) ?? 0)) {
      if (rows.length && rows.length + group.length > 1000) push();
      rows.push(...group);
    }
    if (rows.length || !remote || (archive.history.readAt ?? '') > (remote.history.readAt ?? '')) push();
  }
  return chunks;
}
