import type { NextApiRequest, NextApiResponse } from 'next';
import { acceptDashboardWrite, dashboardDatabase, dashboardRequest } from '@/lib/dashboard/access';
import { listDrafts, parseUpdate, publishDraft, readDraft, saveDraft, validUpdateId } from '@/lib/site-updates/store';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await dashboardRequest(req, res);
  if (!session) return;
  const { env, actor } = session;
  const db = dashboardDatabase(env);
  if (!db) return res.status(503).json({ error: 'Update storage is unavailable.' });

  try {
    if (req.method === 'GET') {
      if (req.query.id === undefined) return res.json(await listDrafts(db));
      if (!validUpdateId(req.query.id)) return res.status(400).json({ error: 'Invalid update.' });
      const row = await readDraft(db, req.query.id);
      return row ? res.json(row) : res.status(404).json({ error: 'Update not found.' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).end();
    }
    if (!acceptDashboardWrite(env, req, res)) return;

    const { id, revision, action, content } = req.body ?? {};
    if (!Number.isSafeInteger(revision) || revision < 0 ||
        (action !== 'save' && action !== 'publish') || (id === null ? action !== 'save' || revision !== 0 : !validUpdateId(id))) {
      return res.status(400).json({ error: 'Invalid update revision.' });
    }
    let result;
    if (action === 'save') {
      let parsed;
      try { parsed = parseUpdate(content); }
      catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Check the update.' }); }
      result = await saveDraft(db, id, revision, parsed, actor);
    } else {
      result = await publishDraft(db, id, revision, actor);
    }
    return result ? res.json(await readDraft(db, result.id))
      : res.status(409).json({ error: 'This update changed. Reload the draft before continuing.' });
  } catch {
    return res.status(503).json({ error: 'Could not confirm the update. Reload to check.' });
  }
}
