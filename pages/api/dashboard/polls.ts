import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardActor, dashboardDatabase, dashboardEnv, dashboardOrigin } from '@/lib/dashboard/access';
import { validPollSettings } from '@/lib/polls/settings';
import { readPollSettings, savePollSetting } from '@/lib/polls/settingsStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store');
  const env = dashboardEnv(), actor = await dashboardActor(env, req.headers);
  if (!actor) return res.status(403).end();
  const db = dashboardDatabase(env);
  if (!db) return res.status(503).json({error:'Poll storage is unavailable.'});
  try {
    if (req.method === 'GET') return res.json(await readPollSettings(db));
    if (req.method !== 'PUT') { res.setHeader('Allow','GET, PUT'); return res.status(405).end(); }
    if (req.headers.origin !== dashboardOrigin(env)?.origin) return res.status(403).end();
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return res.status(415).end();
    if (!validPollSettings(req.body)) return res.status(400).json({error:'Check the poll settings and closing time.'});
    const saved = await savePollSetting(db, req.body, actor);
    return saved ? res.json(saved) : res.status(409).json({error:'Another editor changed this poll. Reload its settings before saving.'});
  } catch { return res.status(503).json({error:'Could not confirm the poll settings. Reload to check.'}); }
}
