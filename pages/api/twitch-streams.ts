import type { NextApiRequest, NextApiResponse } from 'next';
import { getLiveTwitchStreams, type TwitchStream } from '@/lib/community/twitch';
import { TWITCH_CATEGORY, TWITCH_STREAM_LIMIT } from '@/lib/community/twitchConfig';

// Share short-lived results and concurrent requests within each server instance.
// Do not let a CDN serve an old LIVE label through stale-while-revalidate.
type Snapshot = { streams: TwitchStream[]; checkedAt: number };
let cached: Snapshot | null = null;
let pending: Promise<Snapshot> | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(200).json({ streams: [], available: false });
  if (!cached || Date.now() - cached.checkedAt >= 15000) {
    pending ??= getLiveTwitchStreams(TWITCH_CATEGORY, TWITCH_STREAM_LIMIT, clientId, clientSecret)
      .then(streams => (cached = { streams, checkedAt: Date.now() }))
      .finally(() => { pending = null; });
    await pending;
  }
  return res.status(200).json({ ...cached, available: true });
}
