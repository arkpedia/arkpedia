import type { NextApiRequest, NextApiResponse } from 'next';
import type { D1Database } from '@cloudflare/workers-types';
import { allowAccountRequest, accountLimited } from '@/lib/cloud-account/limits';
import { parseBallot, activePollBanners, PULL_POLL_ID, type PollBanner } from './pull-poll';
import { pullPollResults } from './pull-poll-results';
import { pullPollCatalogue } from './pull-poll-catalogue';

const COOKIE = '__Host-arkpedia-pull-poll';
export async function pullPoll(req: NextApiRequest, res: NextApiResponse, db: D1Database, owner: string | null,
  catalogue: () => Promise<{ banners: PollBanner[] }> = pullPollCatalogue) {
  if(req.method==='GET' && req.query?.view==='results')return res.json(await pullPollResults(db));
  let anonymous = req.cookies[COOKIE];
  if (!anonymous || !/^[a-f0-9-]{36}$/.test(anonymous)) {
    if (req.method !== 'GET') return res.status(409).json({ error: 'Reload the poll to start an anonymous entry.' });
    anonymous = crypto.randomUUID();
    res.setHeader('Set-Cookie', `${COOKIE}=${anonymous}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  }
  const voter = owner ? `user:${owner}` : `guest:${anonymous}`;
  if (req.method === 'GET') {
    const row = await db.prepare('SELECT choices,revision FROM pull_poll_ballot WHERE poll=? AND voter=?').bind(PULL_POLL_ID, voter).first<{ choices: string; revision: number }>();
    return res.json({ owner, choices: row ? JSON.parse(row.choices) : {}, revision: row?.revision ?? 0 });
  }
  if (req.body?.owner !== owner) return res.status(409).json({ error: 'Your signed-in account changed. Reload before submitting.' });
  if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) return res.status(400).json({ error: 'Invalid ballot revision.' });
  if (owner) {
    const limit = await allowAccountRequest(db, owner, 'write');
    if (!limit.allowed) return accountLimited(res, limit.retryAfter);
  } else {
    const window = Math.floor(Date.now() / 60_000);
    const allowed = await db.prepare(`INSERT INTO pull_poll_write_limit(voter,window,count) VALUES(?,?,1)
      ON CONFLICT(voter) DO UPDATE SET window=excluded.window,count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END
      WHERE window!=excluded.window OR count<10 RETURNING count`).bind(voter,window).first();
    if (!allowed) return accountLimited(res,60);
  }
  let choices;
  try {
    choices = parseBallot(req.body.choices, activePollBanners((await catalogue()).banners));
    if (!Object.keys(choices).length) throw Error('Choose at least one banner or operator.');
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid poll choices.' }); }
  const row = await db.prepare(`INSERT INTO pull_poll_ballot(poll,voter,userId,choices,revision)
    SELECT ?,?,?,?,1 WHERE ?=0 OR EXISTS(SELECT 1 FROM pull_poll_ballot WHERE poll=? AND voter=? AND revision=?)
    ON CONFLICT(poll,voter) DO UPDATE SET choices=excluded.choices,revision=revision+1,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE pull_poll_ballot.revision=? RETURNING revision`)
    .bind(PULL_POLL_ID, voter, owner, JSON.stringify(choices), req.body.revision, PULL_POLL_ID, voter, req.body.revision, req.body.revision).first<{ revision: number }>();
  if (row && owner) await db.prepare('DELETE FROM pull_poll_ballot WHERE poll=? AND voter=? AND userId IS NULL')
    .bind(PULL_POLL_ID, `guest:${anonymous}`).run();
  // The insert must not recreate a missing ballot when a client expects an existing revision.
  // A matching row is updated atomically; stale revisions receive a conflict.
  return row ? res.json({ owner, choices, revision: row.revision }) : res.status(409).json({ error: 'Your submitted choices changed on another device. Reload before submitting again.' });
}
