import type { NextApiRequest, NextApiResponse } from 'next';
import { isServerId } from '@/lib/account-import/yostar';
import { createPublicNetworkReader } from '@/lib/account-import/publicNetwork';

const read = createPublicNetworkReader();

/** Fixed public endpoints only. Account requests continue through browser-to-provider TLS. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const { server } = req.query;
  if (!isServerId(server) || Object.keys(req.query).some(key => key !== 'server')) return res.status(400).end();
  try {
    const data = await read(server);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(200).json(data);
  } catch {
    return res.status(503).json({ error: 'Public server list temporarily unavailable' });
  }
}
