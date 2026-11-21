import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardActor, dashboardDatabase, dashboardEnv, dashboardOrigin } from '@/lib/dashboard/access';
import { canonicalPublicHref } from '@/lib/nav/publicRoutes';
import { REFRESH_PAGES } from '@/lib/dashboard/refreshPages';
import { campaignCatalog, expireReaderCampaigns } from '@/lib/dashboard/campaignCatalog';
import { EditConflict, InvalidEdit, invalidateCampaignEdits, saveCampaign } from '@/lib/dashboard/campaignStore';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  const env = dashboardEnv();
  const actor = await dashboardActor(env, req.headers);
  if (!actor) return void res.status(403).end();
  const db = dashboardDatabase(env);
  if (!db) return void res.status(503).json({ error: 'Campaign storage is unavailable.' });
  try {
    if (req.method === 'POST') {
      if (req.headers.origin !== dashboardOrigin(env)?.origin) return void res.status(403).end();
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return void res.status(415).end();
      if (req.body?.action === 'refresh') {
        const route = req.body.route;
        if (!REFRESH_PAGES.includes(route)) return void res.status(400).json({ error: 'Choose a supported page.' });
        await res.revalidate(canonicalPublicHref(route));
        return void res.json({ refreshed: route });
      }
      await saveCampaign(db, actor, req.body);
      invalidateCampaignEdits();
      expireReaderCampaigns();
    } else if (req.method !== 'GET') return void res.status(405).end();
    const { base, edits } = await campaignCatalog();
    res.json({ base: base.campaigns, edits });
  } catch (error) {
    if (error instanceof InvalidEdit) return void res.status(400).json({ error: error.message });
    if (error instanceof EditConflict) return void res.status(409).json({ error: 'Another editor saved this campaign. Reload before saving.' });
    res.status(503).json({ error: 'Campaign storage is unavailable. Reload to check the latest revision.' });
  }
}
