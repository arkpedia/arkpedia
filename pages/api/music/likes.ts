import type { NextApiRequest, NextApiResponse } from 'next';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifyStatisticsRefreshToken } from '@/scripts/deploy/statistics-schedule.mjs';
import { readPublishedContentPageProps } from '@/lib/content/release';
import { collectArkpediaLikes, MUSIC_CHART_KEY } from '@/lib/music/arkpediaLikesServer';
import { NO_PUBLISHED_LIKES, validArkpediaLikes } from '@/lib/music/arkpediaLikes';

interface Env {
  ARKPEDIA_ACCOUNTS_DB: D1Database;
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket;
  ARKPEDIA_DEPLOYMENT_ROLE?: string;
  BETTER_AUTH_SECRET: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'x-arkpedia-statistics-refresh');
  if (!['GET', 'HEAD'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  try {
    let env: Env | undefined;
    try { env = getCloudflareContext().env as unknown as Env; }
    catch (error) { if (process.env.NODE_ENV !== 'development') throw error; }
    const bucket = env?.NEXT_INC_CACHE_R2_BUCKET;
    const token = req.headers['x-arkpedia-statistics-refresh'];
    if (token !== undefined) {
      if (req.method !== 'GET' || !env?.BETTER_AUTH_SECRET || env.ARKPEDIA_DEPLOYMENT_ROLE !== 'production' ||
        !await verifyStatisticsRefreshToken(env.BETTER_AUTH_SECRET, 'music', token)) return res.status(403).end();
      if (!bucket) throw Error('Music chart storage is unavailable.');
      const previous = await bucket.head(MUSIC_CHART_KEY);
      const day = new Date().toISOString().slice(0, 10);
      if (previous?.customMetadata?.day === day) return res.status(200).end();
      const catalogue = await readPublishedContentPageProps<{songs:{videoId:string}[];pendingSongs?:{songId:string}[]}>('/music/discover');
      if (!catalogue?.songs.length) throw Error('The music catalogue is unavailable.');
      const ids = new Set([...catalogue.songs.map(s => s.videoId), ...(catalogue.pendingSongs ?? []).map(s => 'msr:' + s.songId)]);
      const result = await collectArkpediaLikes(env.ARKPEDIA_ACCOUNTS_DB, ids);
      await bucket.put(MUSIC_CHART_KEY, JSON.stringify(result), {
        customMetadata: { day },
        onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' },
      });
      return res.status(200).end();
    }

    // Page visits only read the last complete snapshot. An empty local account
    // environment or a first deployment before its first cron has no chart yet.
    if (!bucket && process.env.NODE_ENV !== 'development') throw Error('Music chart storage is unavailable.');
    const stored = await bucket?.get(MUSIC_CHART_KEY);
    const result = stored ? await stored.json() : NO_PUBLISHED_LIKES;
    if (!validArkpediaLikes(result)) throw Error('Invalid music chart.');
    if (result.updatedAt && Date.now() - Date.parse(result.updatedAt) > 2 * 86400_000) throw Error('Music chart refresh overdue.');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return req.method === 'HEAD' ? res.status(200).end() : res.json(result);
  } catch {
    return res.status(503).json({ error: 'Arkpedia likes are temporarily unavailable.' });
  }
}
