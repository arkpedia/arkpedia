import type { D1Database } from '@cloudflare/workers-types';

// Conservative application defaults, not a published Yostar quota. The encrypted
// relay cannot enforce HTTP request counts; cooperating Preview clients ask here.
export const SHARED_REPLAY_INTERVAL = 500;
export const BROWSER_REPLAY_INTERVAL = 3000;
export async function acquireReplayPermit(db:D1Database, client:string, now=Date.now()) {
  const grant=crypto.randomUUID();
  const [result]=await db.batch<{grantId:string}>([
    db.prepare(`UPDATE replay_pacing SET nextAt=?, grantId=? WHERE id='global' AND nextAt<=?
      AND NOT EXISTS (SELECT 1 FROM replay_pacing WHERE id=? AND nextAt>?) RETURNING grantId`)
      .bind(now+SHARED_REPLAY_INTERVAL,grant,now,client,now),
    db.prepare(`INSERT INTO replay_pacing(id,nextAt,grantId)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM replay_pacing WHERE id='global' AND grantId=?)
      ON CONFLICT(id) DO UPDATE SET nextAt=excluded.nextAt,grantId=excluded.grantId`)
      .bind(client,now+BROWSER_REPLAY_INTERVAL,grant,grant),
    // Indexed, bounded housekeeping. Only idle anonymous identifiers expire.
    db.prepare(`DELETE FROM replay_pacing WHERE id IN
      (SELECT id FROM replay_pacing WHERE nextAt<? AND id!='global' ORDER BY nextAt LIMIT 100)`)
      .bind(now-3600000),
  ]);
  return result.results.some(row=>row.grantId===grant);
}
