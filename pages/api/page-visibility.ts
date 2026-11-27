import type { NextApiRequest, NextApiResponse } from 'next';
import { readPublicPageVisibility } from '@/lib/page-visibility/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  return res.json(await readPublicPageVisibility());
}
