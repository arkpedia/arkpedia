import type { D1Database } from '@cloudflare/workers-types';

const FRESH_MS = 30_000;
const LEASE_MS = 10_000;
const MAX_AGE_MS = 120_000;
type Snapshot = { payload: string | null; refreshedAt: number; leaseUntil: number };

/** Share the public projection across Worker isolates. Keep the lease on failure
 * so an unavailable database does not receive a new aggregate scan per request. */
export async function pollResultSnapshot<T>(db: D1Database, poll: string, compute: () => Promise<T>, now = Date.now): Promise<T> {
  const read = () => db.prepare('SELECT payload,refreshedAt,leaseUntil FROM poll_result_snapshot WHERE poll=?').bind(poll).first<Snapshot>();
  const time = now();
  const snapshot = await read();
  const previous = snapshot?.payload && snapshot.refreshedAt > time - MAX_AGE_MS ? JSON.parse(snapshot.payload) as T : undefined;
  if (previous !== undefined && snapshot && snapshot.refreshedAt > time - FRESH_MS) return previous;

  const deadline = time + LEASE_MS;
  if ((!snapshot || snapshot.leaseUntil <= time) && await db.prepare(`INSERT INTO poll_result_snapshot(poll,leaseUntil) VALUES(?,?)
    ON CONFLICT(poll) DO UPDATE SET leaseUntil=excluded.leaseUntil
    WHERE leaseUntil<=? AND refreshedAt<=? RETURNING leaseUntil`)
    .bind(poll, deadline, time, time - FRESH_MS).first()) {
    try {
      const result = await compute();
      await db.prepare('UPDATE poll_result_snapshot SET payload=?,refreshedAt=?,leaseUntil=0 WHERE poll=? AND leaseUntil=?')
        .bind(JSON.stringify(result), time, poll, deadline).run();
      return result;
    } catch (error) {
      if (previous === undefined) throw error;
      console.error('Poll results refresh failed', poll, error);
    }
  }
  if (previous !== undefined) return previous;

  // Concurrent readers of the first snapshot briefly wait for its publisher.
  for (const delay of [100, 250, 500]) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const published = await read();
    if (published?.payload && published.refreshedAt > now() - MAX_AGE_MS) return JSON.parse(published.payload) as T;
  }
  throw Error('Poll results are temporarily unavailable.');
}
