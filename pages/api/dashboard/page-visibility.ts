import type { NextApiRequest, NextApiResponse } from 'next';
import { acceptDashboardWrite, dashboardDatabase, dashboardRequest } from '@/lib/dashboard/access';
import { validPageVisibility } from '@/lib/page-visibility/settings';
import { readPageVisibility, savePageVisibility } from '@/lib/page-visibility/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await dashboardRequest(req, res);
  if (!session) return;
  const { env, actor } = session;
  const db = dashboardDatabase(env);
  if (!db) return res.status(503).json({ error: 'Page visibility storage is unavailable.' });
  try {
    if (req.method === 'GET') return res.json(await readPageVisibility(db));
    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
      return res.status(405).end();
    }
    if (!acceptDashboardWrite(env, req, res)) return;
    if (!validPageVisibility(req.body)) return res.status(400).json({ error: 'Check the listing mode and scheduled times.' });
    const saved = await savePageVisibility(db, req.body, actor);
    return saved ? res.json(saved) : res.status(409).json({ error: 'Another editor changed this page. Reload the settings before saving.' });
  } catch {
    return res.status(503).json({ error: 'Could not confirm page visibility. Reload to check.' });
  }
}
