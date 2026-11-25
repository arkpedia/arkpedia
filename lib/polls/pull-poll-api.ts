import { votingOpenSql } from './settingsStore';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { D1Database } from '@cloudflare/workers-types';
import { allowAccountRequest, accountLimited } from '@/lib/cloud-account/limits';
import { parseBallot, activePollBanners, PULL_POLL_ID, type PollBanner } from './pull-poll';
import { pullPollResults } from './pull-poll-results';
import { pullPollCatalogue } from './pull-poll-catalogue';
import { pollResultSnapshot } from './resultSnapshot';

import { ENDFIELD_BALLOT_ID, ENDFIELD_POLL, endfieldBanners } from './endfield';
export async function pullPoll(req: NextApiRequest, res: NextApiResponse, db: D1Database, owner: string | null,
  {catalogue = pullPollCatalogue, edition = 'pull-or-skip'}: {catalogue?: () => Promise<{ banners: PollBanner[] }>; edition?: 'pull-or-skip' | typeof ENDFIELD_POLL} = {}) {
  const endfield = edition === ENDFIELD_POLL;
  const pollId = endfield ? ENDFIELD_BALLOT_ID : PULL_POLL_ID;
  const cookie = endfield ? '__Host-arkpedia-endfield-poll' : '__Host-arkpedia-pull-poll';
  if(req.method==='GET' && req.query?.view==='results')return res.json(await pollResultSnapshot(db, pollId, () => pullPollResults(db,pollId)));
  let anonymous = req.cookies[cookie];
  if (!anonymous || !/^[a-f0-9-]{36}$/.test(anonymous)) {
    if (req.method !== 'GET') return res.status(409).json({ error: 'Reload the poll to start an anonymous entry.' });
    anonymous = crypto.randomUUID();
    res.setHeader('Set-Cookie', `${cookie}=${anonymous}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  }
  const voter = owner ? `user:${owner}` : `guest:${anonymous}`;
  if (req.method === 'GET') {
    const row = await db.prepare('SELECT choices,revision FROM pull_poll_ballot WHERE poll=? AND voter=?').bind(pollId, voter).first<{ choices: string; revision: number }>();
    const saved = row ? JSON.parse(row.choices) : {};
    return res.json({ owner, choices: endfield ? parseBallot(saved, endfieldBanners) : saved, revision: row?.revision ?? 0 });
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
    choices = parseBallot(req.body.choices, endfield ? endfieldBanners : activePollBanners((await catalogue()).banners));
    if (!Object.keys(choices).length) throw Error('Choose at least one banner or operator.');
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid poll choices.' }); }
  const row = await db.prepare(`INSERT INTO pull_poll_ballot(poll,voter,userId,choices,revision)
    SELECT ?,?,?,?,1 WHERE ${votingOpenSql(edition)} AND (?=0 OR EXISTS(SELECT 1 FROM pull_poll_ballot WHERE poll=? AND voter=? AND revision=?))
    ON CONFLICT(poll,voter) DO UPDATE SET choices=excluded.choices,revision=revision+1,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE pull_poll_ballot.revision=? RETURNING revision`)
    .bind(pollId, voter, owner, JSON.stringify(choices), req.body.revision, pollId, voter, req.body.revision, req.body.revision).first<{ revision: number }>();
  if (row && owner) await db.prepare('DELETE FROM pull_poll_ballot WHERE poll=? AND voter=? AND userId IS NULL')
    .bind(pollId, `guest:${anonymous}`).run();
  // The insert must not recreate a missing ballot when a client expects an existing revision.
  // A matching row is updated atomically; stale revisions receive a conflict.
  return row ? res.json({ owner, choices, revision: row.revision }) : res.status(409).json({ error: 'Your submitted choices changed on another device. Reload before submitting again.' });
}
