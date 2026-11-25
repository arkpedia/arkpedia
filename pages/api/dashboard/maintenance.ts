import type { NextApiRequest, NextApiResponse } from 'next';
import { acceptDashboardWrite, dashboardRequest } from '@/lib/dashboard/access';
import { maintenanceStatus, publicPageOrigin, refreshPublicPage } from '@/lib/dashboard/pageMaintenance';
import { REFRESH_PAGES } from '@/lib/dashboard/refreshPages';

export default async function maintenance(req: NextApiRequest, res: NextApiResponse) {
  const session = await dashboardRequest(req, res);
  if (!session) return;
  const { env } = session;
  const origin = publicPageOrigin(env.ARKPEDIA_DEPLOYMENT_ROLE, env.ARKPEDIA_AUTH_URL);
  if (!origin) return void res.status(503).json({ error: 'The public site is unavailable.' });
  if (req.method === 'GET') return void res.json(await maintenanceStatus(origin, env.NEXT_INC_CACHE_R2_BUCKET));
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return void res.status(405).end();
  }
  if (!acceptDashboardWrite(env, req, res)) return;
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
