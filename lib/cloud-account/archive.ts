import { parsePullArchives, type PullArchive } from '@/lib/account/pullArchive';
import type { PullRecord } from '@/lib/account/pulls';
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export async function readArchives(db: D1Database, userId: string): Promise<PullArchive[]> {
  const accounts = (await db.prepare('SELECT server, uid, doctor, readAt, updatedAt FROM pull_archive_account WHERE userId = ? ORDER BY server, uid').bind(userId).all<{ server: PullArchive['server']; uid: string; doctor: string | null; readAt: string | null; updatedAt: string }>()).results;
  const rows = (await db.prepare('SELECT server, uid, at, pool, char, count, star, poolName, charName FROM pull_archive_row WHERE userId = ? ORDER BY at DESC, pool, char').bind(userId).all<PullRecord & { server: string; uid: string; count: number; poolName: string | null; charName: string | null }>()).results;
  return accounts.map(account => {
    const history: PullArchive['history'] = { rows: [], pools: {}, names: {}, readAt: account.readAt, error: null };
    for (const row of rows) if (row.server === account.server && row.uid === account.uid) {
      for (let i = 0; i < row.count; i++) history.rows.push({ at: row.at, pool: row.pool, char: row.char, star: row.star });
      if (row.poolName) history.pools[row.pool] = row.poolName;
      if (row.charName) history.names[row.char] = row.charName;
    }
    return { server: account.server, uid: account.uid, doctor: account.doctor, history, savedAt: account.updatedAt };
  });
}

/** Every statement is guarded by this write's unique CAS nonce, in the same D1 transaction.
 * A concurrent stale writer can neither overwrite a row nor resurrect a deleted archive. */
export function archiveStatements(db: D1Database, userId: string, mutationId: string, input: unknown): D1PreparedStatement[] {
  const archives = parsePullArchives(input);
  return archives.flatMap(archive => {
    const grouped = new Map<string, PullRecord & { count: number; poolName: string | null; charName: string | null }>();
    for (const row of archive.history.rows) {
      const key = `${row.at}|${row.pool}|${row.char}`, old = grouped.get(key);
      grouped.set(key, { ...row, count: (old?.count ?? 0) + 1, poolName: archive.history.pools[row.pool] ?? null, charName: archive.history.names[row.char] ?? null });
    }
    return [
      db.prepare(`INSERT INTO pull_archive_account (userId, server, uid, doctor, readAt, updatedAt)
        SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM cloud_save WHERE userId = ? AND mutationId = ? AND historySync = 1)
        ON CONFLICT(userId, server, uid) DO UPDATE SET doctor = COALESCE(excluded.doctor, doctor), readAt = max(COALESCE(readAt, ''), COALESCE(excluded.readAt, '')), updatedAt = excluded.updatedAt`)
        .bind(userId, archive.server, archive.uid, archive.doctor, archive.history.readAt, new Date().toISOString(), userId, mutationId),
      db.prepare(`INSERT INTO pull_archive_row (userId, server, uid, at, pool, char, count, star, poolName, charName)
        SELECT ?, ?, ?, json_extract(value, '$.at'), json_extract(value, '$.pool'), json_extract(value, '$.char'), json_extract(value, '$.count'), json_extract(value, '$.star'), json_extract(value, '$.poolName'), json_extract(value, '$.charName')
        FROM json_each(?) WHERE EXISTS (SELECT 1 FROM cloud_save WHERE userId = ? AND mutationId = ? AND historySync = 1)
        ON CONFLICT(userId, server, uid, at, pool, char) DO UPDATE SET count = max(count, excluded.count), star = COALESCE(excluded.star, star), poolName = COALESCE(excluded.poolName, poolName), charName = COALESCE(excluded.charName, charName)`)
        .bind(userId, archive.server, archive.uid, JSON.stringify([...grouped.values()]), userId, mutationId),
    ];
  });
}
