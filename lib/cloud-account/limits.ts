import type { D1Database } from '@cloudflare/workers-types';
import type { NextApiResponse } from 'next';

export const ACCOUNT_LIMITS = { read: 120, write: 60, profile: 30, remove: 10 } as const;
/** One atomic counter per user and operation, shared across devices/Workers. */
export async function allowAccountRequest(db: D1Database, userId: string, operation: keyof typeof ACCOUNT_LIMITS, now = Date.now()) {
  const window = Math.floor(now / 60_000);
  const row = await db.prepare(`INSERT INTO account_request_limit (userId, operation, window, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(userId, operation) DO UPDATE SET
      count = CASE WHEN window = excluded.window THEN count + 1 ELSE 1 END, window = excluded.window
    WHERE window != excluded.window OR count < ? RETURNING count`)
    .bind(userId, operation, window, ACCOUNT_LIMITS[operation]).first();
  return { allowed: !!row, retryAfter: 60 - Math.floor(now / 1000) % 60 };
}
export function accountLimited(res: NextApiResponse, retryAfter: number) {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Too many account requests. Please wait a minute and try again. Your saves are unchanged.' });
}
export function archiveQuotaError(error: unknown): boolean {
  return String(error).includes('ARKPEDIA_ARCHIVE_QUOTA');
}
