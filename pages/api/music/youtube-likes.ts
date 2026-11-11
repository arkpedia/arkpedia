import type { NextApiRequest, NextApiResponse } from 'next';
import { readPublishedContentPageProps } from '@/lib/content/release';
import { validYouTubeLikes } from '@/lib/music/youtubeLikes';
import { createYouTubeLikesLoader } from '@/lib/music/youtubeLikesServer';

const loadLikes = createYouTubeLikesLoader({
  apiKey: () => process.env.YOUTUBE_API_KEY,
  videoIds: async () => {
    const published = await readPublishedContentPageProps<{ songs: { videoId: string }[] }>('/music/discover');
    return (published?.songs ?? (process.env.ARKPEDIA_WORKER === '1' ? [] : (await import('@/lib/music/albumsDataServer')).getDiscoverPageData().songs)).map(song => song.videoId);
  },
});

/** Local development can use the public counts without a YouTube key. */
async function readChart() {
  if (process.env.NODE_ENV !== 'development' || process.env.YOUTUBE_API_KEY) return loadLikes();
  const response = await fetch('https://www.arkpedia.net/api/music/youtube-likes', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Unavailable');
  const chart: unknown = await response.json();
  if (!validYouTubeLikes(chart, Date.now())) throw new Error('Invalid YouTube likes');
  return chart;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const data = await readChart();
    const remaining = 86400 - Math.floor((Date.now() - Date.parse(data.updatedAt)) / 1000);
    res.setHeader('Cache-Control', `public, max-age=60, s-maxage=${remaining > 0 ? remaining : 300}`);
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).json(data);
  } catch {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(503).json({ error: 'YouTube likes are temporarily unavailable' });
  }
}
