import type { D1Database } from '@cloudflare/workers-types';

// Application limits, not a published Yostar quota. Both old and new clients use
// the same atomic grant counter; a rollout must never create a second allowance.
export const SHARED_REPLAY_INTERVAL = 500;
export const BROWSER_REPLAY_INTERVAL = 3000;
export const REPLAY_QUEUE_LEASE = 10000;
export const MAX_REPLAY_WAITERS = 1000;
export interface ReplayPermit { granted: boolean; retryAfterMs: number; position: number; full?: boolean }

export async function cancelReplayPermit(db: D1Database, client: string) {
  // Keep the rate counter: cancelling must not reset an already consumed grant.
  await db.prepare('DELETE FROM replay_wait_queue WHERE client=?').bind(client).run();
}

export async function acquireReplayPermit(db: D1Database, client: string, now = Date.now()): Promise<ReplayPermit> {
  const grant = crypto.randomUUID();
  const results = await db.batch([
    db.prepare('DELETE FROM replay_wait_queue WHERE expiresAt<=?').bind(now),
    db.prepare(`INSERT INTO replay_wait_queue(client,readyAt,expiresAt)
      SELECT ?,MAX(?,COALESCE((SELECT nextAt FROM replay_pacing WHERE id=?),0)),?
      WHERE (SELECT count(*) FROM replay_wait_queue)<?
        OR EXISTS(SELECT 1 FROM replay_wait_queue WHERE client=?)
      ON CONFLICT(client) DO UPDATE SET expiresAt=excluded.expiresAt`)
      .bind(client,now,client,now+REPLAY_QUEUE_LEASE,MAX_REPLAY_WAITERS,client),
    db.prepare(`UPDATE replay_pacing SET nextAt=?,grantId=? WHERE id='global' AND nextAt<=?
      AND NOT EXISTS(SELECT 1 FROM replay_pacing WHERE id=? AND nextAt>?)
      AND ?=(SELECT client FROM replay_wait_queue WHERE readyAt<=? ORDER BY ticket LIMIT 1)
      RETURNING grantId`).bind(now+SHARED_REPLAY_INTERVAL,grant,now,client,now,client,now),
    db.prepare(`INSERT INTO replay_pacing(id,nextAt,grantId)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM replay_pacing WHERE id='global' AND grantId=?)
      ON CONFLICT(id) DO UPDATE SET nextAt=excluded.nextAt,grantId=excluded.grantId`)
      .bind(client,now+BROWSER_REPLAY_INTERVAL,grant,grant),
    db.prepare(`DELETE FROM replay_wait_queue WHERE client=?
      AND EXISTS(SELECT 1 FROM replay_pacing WHERE id='global' AND grantId=?)`).bind(client,grant),
    db.prepare(`SELECT readyAt,(SELECT count(*) FROM replay_wait_queue other
      WHERE other.ticket<=self.ticket AND other.readyAt<=MAX(?,self.readyAt)) AS position
      FROM replay_wait_queue self WHERE client=?`).bind(now,client),
    // Indexed and bounded; rate counters live longer than waiting positions.
    db.prepare(`DELETE FROM replay_pacing WHERE id IN
      (SELECT id FROM replay_pacing WHERE nextAt<? AND id!='global' ORDER BY nextAt LIMIT 100)`)
      .bind(now-3600000),
  ]);
  if (results[2].results.length) return { granted: true, retryAfterMs: 0, position: 0 };
  const queued = results[5].results[0] as { readyAt: number; position: number } | undefined;
  if (!queued) return { granted: false, retryAfterMs: 60000, position: 0, full: true };
  return { granted: false, position: queued.position,
    retryAfterMs: Math.max(500,Math.min(2000,Math.max(queued.readyAt-now,queued.position*SHARED_REPLAY_INTERVAL))) };
}
