import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardEnv } from '@/lib/dashboard/access';
import { readPublishedImage, readPublishedUpdates, validUpdateId } from '@/lib/site-updates/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const db = dashboardEnv().ARKPEDIA_ACCOUNTS_DB;
  const { id, image, latest } = req.query;
  try {
    if (id !== undefined || image !== undefined) {
      if (!db || !validUpdateId(id) || (image !== '0' && image !== '1')) return res.status(404).end();
      const data = await readPublishedImage(db, id, Number(image));
      if (!data) return res.status(404).end();
      res.setHeader('Content-Type', data.mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      return res.send(data.bytes);
    }
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.json(db ? await readPublishedUpdates(db, latest === '1') : []);
  } catch {
    return res.status(503).end();
  }
}
