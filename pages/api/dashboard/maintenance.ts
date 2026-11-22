import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardActor, dashboardEnv, dashboardOrigin } from '@/lib/dashboard/access';
import { maintenanceStatus, publicPageOrigin, refreshPublicPage } from '@/lib/dashboard/pageMaintenance';
import { REFRESH_PAGES } from '@/lib/dashboard/refreshPages';

export default async function maintenance(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  const env = dashboardEnv();
  if (!await dashboardActor(env, req.headers)) return void res.status(403).end();
  const origin = publicPageOrigin(env.ARKPEDIA_DEPLOYMENT_ROLE, env.ARKPEDIA_AUTH_URL);
  if (!origin) return void res.status(503).json({ error: 'The public site is unavailable.' });
  if (req.method === 'GET') return void res.json(await maintenanceStatus(origin, env.NEXT_INC_CACHE_R2_BUCKET));
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return void res.status(405).end();
  }
  if (req.headers.origin !== dashboardOrigin(env)?.origin) return void res.status(403).end();
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') return void res.status(415).end();
  const route = req.body?.route;
  if (req.body?.action !== 'refresh' || !REFRESH_PAGES.includes(route)) {
    return void res.status(400).json({ error: 'Choose a supported page to refresh.' });
  }
  if (!env.NEXT_INC_CACHE_R2_BUCKET) return void res.status(503).json({ error: 'Refresh storage is unavailable.' });
  try {
    res.json(await refreshPublicPage(route, origin, req, res.revalidate, env.NEXT_INC_CACHE_R2_BUCKET));
  } catch {
    res.status(503).json({ error: 'Page refresh failed. Check the public page and try again.' });
  }
}
