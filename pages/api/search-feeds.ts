import type { NextApiRequest, NextApiResponse } from 'next';
import { enrichWithLiveStatus } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { youtubeChannels, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { getLiveTwitchStreams } from '@/lib/community/twitch';
import { TWITCH_CATEGORY, TWITCH_STREAM_LIMIT } from '@/lib/community/twitchConfig';
import { buildSiteSearchFeedEntries } from '@/lib/search/siteSearchIndex';
import type { SiteSearchIndex } from '@/lib/search/siteSearch';

/** The community pages regenerate every 1500 seconds; the search's copy of their feeds
 *  is as old as theirs, and no older. */
const CACHE = 'public, max-age=300, s-maxage=1500, stale-while-revalidate=1500';

/**
 * The site search's live rows (lib/search/siteSearch.ts): the videos /community and
 * /community/videos list, and who is live in the Twitch category, as search rows.
 *
 * The same feeds, read the same way: every curated channel's latest uploads, livestreams
 * dropped and the Arknights filter applied as those pages apply them, so the search finds
 * no video the pages hide. Cached at the edge for as long as the pages are, so the feeds
 * are fetched about as often as one more page regenerating -- once when a reader opens
 * the search, at most, and never per keystroke. Without Twitch credentials (a local
 * `npm run dev`) there are no streams, as on the pages.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const [videos, streams] = await Promise.all([
    getLatestVideos(await youtubeChannels(), VIDEOS_PER_CHANNEL)
      .then((raw) => enrichWithLiveStatus(raw, process.env.YOUTUBE_API_KEY))
      .then((enriched) => filterArknightsVideos(enriched.filter((v) => !v.isLivestream))),
    getLiveTwitchStreams(TWITCH_CATEGORY, TWITCH_STREAM_LIMIT, process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET),
  ]);
  const body: SiteSearchIndex = { entries: buildSiteSearchFeedEntries({ videos, streams }) };
  res.setHeader('Cache-Control', CACHE);
  return res.status(200).json(body);
}
