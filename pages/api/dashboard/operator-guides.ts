import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardActor, dashboardDatabase, dashboardEnv, dashboardOrigin } from '@/lib/dashboard/access';
import { readPublishedContentPageProps } from '@/lib/content/release';
import { operatorHref } from '@/lib/operators/operatorHref';
import type { Operator } from '@/lib/operators/operatorTypes';
import { publicPageOrigin, revalidatePublicPath } from '@/lib/dashboard/pageMaintenance';
import { guideFields, validGuideValue } from '@/lib/dashboard/operatorGuide';
import { readGuideEdits, saveGuideEdit } from '@/lib/dashboard/operatorGuideStore';

export const config = { api: { bodyParser: { sizeLimit: '192kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  const env = dashboardEnv();
  const actor = await dashboardActor(env, req.headers);
  if (!actor) return res.status(403).end();
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (req.method === 'POST') {
    if (req.headers.origin !== dashboardOrigin(env)?.origin) return res.status(403).end();
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return res.status(415).end();
  }
  const db = dashboardDatabase(env);
  if (!db) return res.status(503).json({ error: 'Guide storage is unavailable.' });
  const name = req.query.operator;
  if (typeof name !== 'string' || !name || name.length > 160 || /[\/\\]/.test(name) || name === '.' || name === '..') {
    return res.status(400).json({ error: 'Choose an operator.' });
  }
  try {
    const page = await readPublishedContentPageProps<{ operator: Operator }>(operatorHref(name, null));
    const op = page?.operator;
    if (!op?.internalName) return res.status(404).json({ error: 'This operator has no published record.' });
    const fields = guideFields(op, await readGuideEdits(db, op.internalName));
    if (req.method === 'GET') return res.json({ name: op.name, fields });
    const { key, value, revision, source } = req.body ?? {};
    const field = fields.find(row => row.key === key);
    if (!field || !Number.isSafeInteger(revision) || revision < 0 || (value !== null && !validGuideValue(value, field.source.kind))) {
      return res.status(400).json({ error: 'Check the selected guide and its fields.' });
    }
    if (field.revision !== revision || JSON.stringify(field.source) !== JSON.stringify(source)
      || !await saveGuideEdit(db, op.internalName, key, revision, value, actor)) {
      return res.status(409).json({ error: 'This guide changed. Reload the guide before publishing.' });
    }
    const origin = publicPageOrigin(env.ARKPEDIA_DEPLOYMENT_ROLE, env.ARKPEDIA_AUTH_URL);
    let refreshed = false;
    if (origin) {
      try { await revalidatePublicPath(operatorHref(op.name, null), origin, req, res.revalidate); refreshed = true; }
      catch { /* ISR will retry on the next eligible page request. */ }
    }
    return res.json({ refreshed, ...field, value: value ?? field.source, revision: revision + 1, customized: value !== null });
  } catch {
    return res.status(503).json({ error: 'Could not confirm the guide. Reload to check its latest version.' });
  }
}
