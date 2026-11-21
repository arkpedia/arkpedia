import type { NextApiRequest, NextApiResponse } from 'next';
import { readerCampaigns } from '@/lib/dashboard/campaignCatalog';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return void res.status(405).end();
  try {
    const table = await readerCampaigns();
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');
    res.json(table);
  } catch { res.setHeader('Cache-Control', 'no-store'); res.status(503).end(); }
}
