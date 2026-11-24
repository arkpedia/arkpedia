import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardEnv } from '@/lib/dashboard/access';
import { defaultPollSettings, publicPoll } from '@/lib/polls/settings';
import { readPollSettings } from '@/lib/polls/settingsStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).end(); }
  try {
    const env = dashboardEnv(), db = env.ARKPEDIA_ACCOUNTS_DB;
    const offline = !env.ARKPEDIA_DEPLOYMENT_ROLE && (process.env.NODE_ENV === 'development' || process.env.ARKPEDIA_CONTENT_DISABLED === '1');
    if (!db && !offline) throw Error();
    const settings = db ? await readPollSettings(db) : defaultPollSettings(), now = Date.now();
    return res.json(Object.fromEntries(settings.filter(s => s.visible).map(s => [s.id, publicPoll(s, now)])));
  } catch { return res.status(503).json({error:'Poll availability could not be loaded.'}); }
}
