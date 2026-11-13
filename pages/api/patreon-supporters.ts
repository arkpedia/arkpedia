import type { ExecutionContext } from '@cloudflare/workers-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { patreonConfigured, readSupporters, syncPatreon, type PatreonEnv } from '@/lib/patreon/sync.mjs';
import { validSupporterSnapshot } from '@/lib/patreon/supporters';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).end(); }
  try {
    let context: ReturnType<typeof getCloudflareContext> | undefined;
    try { context = getCloudflareContext(); } catch { /* Local development has the published fallback. */ }
    const env = context?.env as unknown as PatreonEnv | undefined;
    if (!env || !patreonConfigured(env)) { res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300'); return res.status(204).end(); }
    const snapshot = await readSupporters(env);
    if (!snapshot) {
      // Warm the first snapshot once after setup. D1 leases/backoff prevent public visits
      // from duplicating API calls; later visits only read the daily cron's snapshot.
      if (req.method === 'GET') (context!.ctx as ExecutionContext).waitUntil(syncPatreon(env, { bootstrapOnly: true }).catch(() => { console.error('Patreon bootstrap failed; the daily refresh will retry.'); }));
      return req.method === 'HEAD' ? res.status(202).end() : res.status(202).json({ status: 'preparing' });
    }
    if (!validSupporterSnapshot(snapshot)) throw Error('Invalid supporter projection.');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return req.method === 'HEAD' ? res.status(200).end() : res.json(snapshot);
  } catch { return res.status(503).json({ error: 'Supporter acknowledgements are temporarily unavailable.' }); }
}
