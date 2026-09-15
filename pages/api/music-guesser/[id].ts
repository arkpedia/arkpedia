import type { NextApiRequest, NextApiResponse } from 'next';
import { getSongChoices } from '@/lib/music-guesser/catalogue';

const allowedIds = new Set(getSongChoices().map((song) => song.id));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id } = req.query;
  if (typeof id !== 'string' || !allowedIds.has(id)) return res.status(404).json({ error: 'Unknown song' });
  try {
    const response = await fetch(`https://monster-siren.hypergryph.com/api/song/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Song source unavailable');
    const data = await response.json();
    const url = new URL(data.data?.sourceUrl);
    if (data.code !== 0 || url.protocol !== 'https:' || !url.hostname.endsWith('.hycdn.cn')) throw new Error('Invalid audio source');
    // These CDN URLs are signed and expire. Cache only briefly; never proxy audio bytes.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.status(200).json({ url: url.href });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'This song could not be loaded. Retry or try another song.' });
  }
}
