export interface YouTubeVideo {
  videoId: string;
  title: string;
  description?: string;
  channelLabel: string;
  publishedAt: string; // ISO date string
  thumbnail: string;
  url: string;
  // Enriched via the YouTube Data API (only if YOUTUBE_API_KEY is set).
  // isLivestream: true for any broadcast (past or present), false for a
  // regular upload. liveStatus: 'live' right now, 'upcoming' scheduled,
  // or 'none' for a normal video / completed broadcast VOD.
  isLivestream: boolean;
  liveStatus: 'live' | 'upcoming' | 'none';
  /** Public metadata recovered from the creator's archive or an indexed guide. */
  archived?: true;
  operatorNames?: string[];
  topicHint?: 'operators';
}

export interface VideoOEmbedInfo {
  title: string;
  author: string; // the channel/creator name -- comes back in the same oEmbed response, no extra call needed
}

// YouTube's public oEmbed endpoint -- no API key needed, no quota cost,
// just looks up title/author/thumbnail metadata for a public video URL.
// Shared by the music player and the operator guides section.
export async function fetchVideoOEmbedInfo(videoId: string): Promise<VideoOEmbedInfo> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    );
    if (!res.ok) return { title: '', author: '' };
    const data = await res.json();
    return { title: data.title || '', author: data.author_name || '' };
  } catch {
    return { title: '', author: '' };
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * The videos in one channel's Atom feed (https://www.youtube.com/feeds/videos.xml?channel_id=),
 * in the feed's order. Pure: the server's feed reader (youtubeFeedsServer.ts) and the Check's
 * fixture feed both go through it.
 */
export function parseChannelFeed(xml: string, channelLabel: string): YouTubeVideo[] {
  const entries = xml.split('<entry>').slice(1);
  return entries
    .map((entry) => {
      const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || '';
      const rawTitle = (entry.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
      const thumbMatch = entry.match(/<media:thumbnail url="([^"]+)"/);
      const thumbnail = thumbMatch ? thumbMatch[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      return {
        videoId,
        title: decodeHtmlEntities(rawTitle),
        description: decodeHtmlEntities((entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '').trim().slice(0, 400),
        channelLabel,
        publishedAt: published,
        thumbnail,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isLivestream: false,
        liveStatus: 'none' as const,
      };
    })
    .filter((v) => v.videoId);
}

// Enriches videos with real live/upcoming/livestream status using the
// YouTube Data API's videos.list endpoint. This costs only 1 quota unit
// per batch of up to 50 video IDs (vs. 100 units for a search.list call),
// so checking a full page of results stays well within the free daily
// quota. Requires YOUTUBE_API_KEY -- if unset, videos are left as
// regular (non-live) videos rather than failing the whole page.
export async function enrichWithLiveStatus(
  videos: YouTubeVideo[],
  apiKey: string | undefined
): Promise<YouTubeVideo[]> {
  if (!apiKey || videos.length === 0) return videos;

  const statusById = new Map<string, { isLivestream: boolean; liveStatus: 'live' | 'upcoming' | 'none' }>();
  const ids = videos.map((v) => v.videoId);

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${batch.join(
        ','
      )}`;
      const res = await fetch(url, { headers: { 'X-Goog-Api-Key': apiKey } });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.items || []) {
        const liveBroadcastContent = item.snippet?.liveBroadcastContent as
          | 'live'
          | 'upcoming'
          | 'none'
          | undefined;
        const hasLiveDetails = Boolean(item.liveStreamingDetails);
        statusById.set(item.id, {
          isLivestream: hasLiveDetails,
          liveStatus: liveBroadcastContent || 'none',
        });
      }
    } catch {
      /* leave this batch as defaults on failure */
    }
  }

  return videos.map((v) => {
    const status = statusById.get(v.videoId);
    return status ? { ...v, ...status } : v;
  });
}
